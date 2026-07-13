/**
 * loadtest.js — NAPLAN PREP backend concurrency test
 *
 * PLACE IN:  naplan-backend/loadtest.js
 *
 * RUN (PowerShell, from naplan-backend):
 *   cd C:\Users\DELL\EduTech_Both\EduTech_Full\naplan-backend; .\k6.exe run loadtest.js
 *
 * ENV VARS (all optional, defaults shown):
 *   -e BASE_URL=http://localhost:5000
 *   -e CHILD_USERNAME=loadtest01
 *   -e CHILD_PIN=1234
 *   -e PROFILE=smoke            (smoke | ramp | spike)
 *   -e AI_BURST=false           (true = also hammer the Python-spawn path)
 *   -e AI_PATH=/api/quiz-attempts/<id>/submit
 *
 * ⚠️  NEVER point BASE_URL at naplanapi.kaisolutions.ai.
 *     Render free tier is one 512MB instance. You will take prod down.
 */

import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

/* ─────────────────────────── config ─────────────────────────── */

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const CHILD_USERNAME = __ENV.CHILD_USERNAME || "loadtest01";
const CHILD_PIN = __ENV.CHILD_PIN || "1234";
const PROFILE = __ENV.PROFILE || "smoke";
const AI_BURST = String(__ENV.AI_BURST || "false") === "true";
const AI_PATH = __ENV.AI_PATH || "";

if (BASE_URL.includes("kaisolutions.ai")) {
  fail("Refusing to load-test production. Point BASE_URL at localhost.");
}

/* ───────────────────── load profiles ───────────────────── */

const PROFILES = {
  // Does it work at all? ~30s, 2 users. Run this first, every time.
  smoke: [
    { duration: "10s", target: 2 },
    { duration: "20s", target: 2 },
  ],
  // Where does it start to hurt? Gradual climb to 50 concurrent.
  ramp: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  // What happens on a sudden rush (e.g. a class of 30 all starting at once)?
  spike: [
    { duration: "10s", target: 2 },
    { duration: "5s", target: 60 },
    { duration: "40s", target: 60 },
    { duration: "10s", target: 2 },
    { duration: "20s", target: 2 },
  ],
};

/* ───────────────────── custom metrics ───────────────────── */

const rateLimited = new Counter("rate_limited_429");
const serverErrors = new Counter("server_errors_5xx");
const authFailures = new Counter("auth_failures_401_403");
const dbReadyLatency = new Trend("db_ready_latency", true);
const okRate = new Rate("business_success");

/* ───────────────────── options ───────────────────── */

const scenarios = {
  reads: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: PROFILES[PROFILE] || PROFILES.smoke,
    exec: "readTraffic",
    tags: { scenario: "reads" },
  },
};

if (AI_BURST && AI_PATH) {
  // Deliberately small. Each request forks a Python process (~150-300MB).
  // 10 concurrent = ~2GB. On a 512MB box this is the crash you're looking for.
  scenarios.ai = {
    executor: "per-vu-iterations",
    vus: 10,
    iterations: 1,
    maxDuration: "3m",
    exec: "aiBurst",
    tags: { scenario: "ai" },
  };
}

export const options = {
  scenarios,
  thresholds: {
    // p95 under 1s for reads. Tune once you have a baseline.
    "http_req_duration{scenario:reads}": ["p(95)<1000"],
    // Fewer than 1% hard failures.
    http_req_failed: ["rate<0.01"],
    // Any 5xx is a real bug, not a capacity signal.
    server_errors_5xx: ["count<1"],
    business_success: ["rate>0.95"],
  },
  // Render/Node keep-alive behaviour matters — don't mask it.
  noConnectionReuse: false,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

/* ───────────────────── setup: log in once ───────────────────── */

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/child-login`,
    JSON.stringify({ username: CHILD_USERNAME, pin: CHILD_PIN }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "setup:login" } }
  );

  if (res.status !== 200) {
    fail(
      `Child login failed (${res.status}). Body: ${res.body}\n` +
      `→ Create a test child first, then pass -e CHILD_USERNAME=... -e CHILD_PIN=...`
    );
  }

  const body = res.json();
  const token = body.token;
  const childId = body.child?.childId;

  if (!token || !childId) {
    fail(`Login returned no token/childId. Body: ${res.body}`);
  }

  console.log(`✅ Auth OK — childId=${childId}`);
  return { token, childId };
}

/* ───────────────────── read traffic ───────────────────── */

export function readTraffic(data) {
  const authed = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
  };

  // 1. Cheap liveness ping — no DB.
  track(
    http.get(`${BASE_URL}/api/health`, { tags: { name: "GET /api/health" } }),
    200
  );

  // 2. Deep check — touches MongoDB. This is where M0 connection
  //    limits show up under concurrency.
  const ready = http.get(`${BASE_URL}/api/health/ready`, {
    tags: { name: "GET /api/health/ready" },
  });
  dbReadyLatency.add(ready.timings.duration);
  track(ready, 200);

  sleep(0.5);

  // 3. Authenticated read — the child's results list.
  track(
    http.get(`${BASE_URL}/api/children/${data.childId}/results`, {
      ...authed,
      tags: { name: "GET /api/children/:id/results" },
    }),
    200
  );

  // 4. Authenticated read — available quizzes (entitlement logic + joins).
  track(
    http.get(`${BASE_URL}/api/children/${data.childId}/available-quizzes`, {
      ...authed,
      tags: { name: "GET /api/children/:id/available-quizzes" },
    }),
    200
  );

  // Think time. Without this you're testing your own laptop's socket
  // limit, not the server.
  sleep(Math.random() * 2 + 1);
}

/* ───────────────────── AI burst (opt-in) ───────────────────── */

export function aiBurst(data) {
  const res = http.post(`${BASE_URL}${AI_PATH}`, JSON.stringify({}), {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
    timeout: "180s",
    tags: { name: "POST ai-spawn" },
  });

  // 503 with code PYTHON_BUSY is the CORRECT answer under load once
  // pythonSpawnLimiter is wired. Before it's wired, expect the process
  // to OOM instead.
  check(res, {
    "ai: not a 5xx crash": (r) => r.status < 500 || r.status === 503,
    "ai: 503 is a clean PYTHON_BUSY": (r) =>
      r.status !== 503 || String(r.body).includes("busy"),
  });

  console.log(`AI request → ${res.status} in ${Math.round(res.timings.duration)}ms`);
}

/* ───────────────────── helpers ───────────────────── */

function track(res, expected) {
  if (res.status === 429) rateLimited.add(1);
  if (res.status === 401 || res.status === 403) authFailures.add(1);
  if (res.status >= 500) serverErrors.add(1);

  const ok = check(res, {
    [`status is ${expected}`]: (r) => r.status === expected,
  });
  okRate.add(ok);
  return ok;
}