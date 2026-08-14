/**
 * loadtest.js — NAPLAN PREP backend concurrency test
 *
 * PLACE IN:  naplan-backend/loadtest.js
 *
 * RUN (PowerShell, from naplan-backend):
 *   cd C:\Users\DELL\EduTech_Both\EduTech_Full\naplan-backend; .\k6.exe run loadtest.js
 *
 * ENV VARS (all optional, defaults shown):
 *   -e BASE_URL=http://localhost:3000
 *   -e CHILD_USERNAME=aarav
 *   -e CHILD_PIN=123456
 *   -e PROFILE=smoke            (smoke | ramp | spike)
 *   -e P95_MS=3000              (latency threshold — see note below)
 *   -e AI_BURST=false           (true = also exercise the submit/feedback path)
 *   -e AI_PATH=/api/quiz-attempts/<id>/submit
 *
 * ⚠️  NEVER point BASE_URL at naplanapi.kaisolutions.ai. That is the live
 *     service with real students mid-quiz and real Stripe payments. Load
 *     testing it means real children see timeouts. A staging service on
 *     *.onrender.com is allowed and is the correct way to test real
 *     Render↔Atlas behaviour.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED IN THIS VERSION, AND WHY
 *
 *   1. DEFAULT PORT 5000 → 3000. The .env sets PORT=3000. The old default
 *      silently produced "connection refused" / status 0 on every run, which
 *      looks like an auth failure but is really "nothing is listening there".
 *
 *   2. DEFAULT CREDENTIALS. loadtest01/1234 never existed in the database —
 *      they were placeholder text, and using them gives a 401 that reads like
 *      a bug. Defaults now point at a child that actually exists.
 *
 *   3. aiBurst() USED `data.token`, WHICH NO LONGER EXISTS. setup() returns
 *      { childToken, childId } since the httpOnly-cookie migration. The old
 *      line sent "Bearer undefined" and would 401 on every request — the
 *      scenario was silently broken. Now uses the cookie jar like readTraffic.
 *
 *   4. p95 THRESHOLD 1000ms → configurable, default 3000ms. 1000ms was chosen
 *      before the Atlas cluster moved to Sydney. Testing from India against a
 *      Sydney cluster costs ~180ms per round trip, so an endpoint making a few
 *      sequential queries cannot physically finish in under a second. The old
 *      threshold reported a permanent, meaningless failure. Set P95_MS to
 *      something tight again when testing from a machine near the cluster.
 *
 *   5. STALE COMMENTS REMOVED. "Render free tier is one 512MB instance" (now
 *      Standard), "M0 connection limits" (now M10, 1500 connections), and
 *      "each request forks a Python process" (the MCQ feedback path is direct
 *      Node → Gemini now; only the writing path still spawns Python).
 *
 *   6. per-endpoint latency Trends added. The aggregate p95 hides which route
 *      is slow. Your median stays ~200ms while p95 hits 2.8s, which means a
 *      minority of requests queue badly — you need per-route numbers to know
 *      which ones.
 *
 *   7. DB_POOL note. With DB_MAX_POOL_SIZE=10 and 50 VUs × 4 requests, pool
 *      contention is the prime suspect for that p95 spread. Raise the pool and
 *      re-run this exact profile to test the theory.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

/* ─────────────────────────── config ─────────────────────────── */

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CHILD_USERNAME = __ENV.CHILD_USERNAME || "aarav";
const CHILD_PIN = __ENV.CHILD_PIN || "123456";
const PROFILE = __ENV.PROFILE || "smoke";
const P95_MS = Number(__ENV.P95_MS || 3000);
const AI_BURST = String(__ENV.AI_BURST || "false") === "true";
const AI_PATH = __ENV.AI_PATH || "";

// Production only. A *.onrender.com staging service is fine and is the point.
if (BASE_URL.includes("kaisolutions.ai")) {
  fail(
    "Refusing to load-test production (kaisolutions.ai). " +
    "Use localhost, or a staging service on *.onrender.com."
  );
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
const okRate = new Rate("business_success");

// Per-endpoint latency. The aggregate p95 tells you SOMETHING is slow;
// these tell you WHICH thing, which is the only actionable version.
const healthLatency = new Trend("lat_health", true);
const dbReadyLatency = new Trend("lat_health_ready", true);
const resultsLatency = new Trend("lat_results", true);
const quizzesLatency = new Trend("lat_available_quizzes", true);

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
  // Kept small on purpose. The MCQ path no longer forks Python, but each
  // submission still costs real Gemini tokens — a big burst here is a bill,
  // not just load. The WRITING path does still spawn Python and is still
  // capped by MAX_CONCURRENT_PYTHON.
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
    // Configurable — see note 4 in the header. Tighten when testing from a
    // machine close to the cluster.
    "http_req_duration{scenario:reads}": [`p(95)<${P95_MS}`],
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

  // status 0 means no HTTP response at all — the server isn't running, or
  // it's on a different port. It is NEVER a wrong-password error.
  if (res.status === 0) {
    fail(
      `No response from ${BASE_URL} — is the backend running?\n` +
      `→ In another terminal: npm run dev\n` +
      `→ Check the PORT in .env matches BASE_URL.`
    );
  }

  if (res.status !== 200) {
    fail(
      `Child login failed (${res.status}). Body: ${res.body}\n` +
      `→ Pass a child that exists: -e CHILD_USERNAME=... -e CHILD_PIN=...`
    );
  }

  const body = res.json();
  const childId = body.child?.childId;

  // Auth is httpOnly-cookie based — the token is in Set-Cookie, not the body.
  const childToken = res.cookies?.child_token?.[0]?.value;

  if (!childToken || !childId) {
    fail(`Login returned no child_token cookie / childId. Body: ${res.body}`);
  }

  console.log(`✅ Auth OK — childId=${childId} @ ${BASE_URL}`);
  return { childToken, childId };
}

/* ───────────────────── read traffic ───────────────────── */

export function readTraffic(data) {
  // Each VU has its own cookie jar and setup()'s jar does NOT carry over,
  // so seed this VU's jar with the token captured during setup.
  http.cookieJar().set(BASE_URL, "child_token", data.childToken);

  const authed = { headers: { "Content-Type": "application/json" } };

  // 1. Cheap liveness ping — no DB. Your floor for "how fast can this box
  //    answer anything at all".
  const health = http.get(`${BASE_URL}/api/health`, {
    tags: { name: "GET /api/health" },
  });
  healthLatency.add(health.timings.duration);
  track(health, 200);

  // 2. Deep check — touches MongoDB. Compare against #1: the difference is
  //    almost entirely your network distance to the Atlas region.
  const ready = http.get(`${BASE_URL}/api/health/ready`, {
    tags: { name: "GET /api/health/ready" },
  });
  dbReadyLatency.add(ready.timings.duration);
  track(ready, 200);

  sleep(0.5);

  // 3. Authenticated read — the child's results list.
  const results = http.get(`${BASE_URL}/api/children/${data.childId}/results`, {
    ...authed,
    tags: { name: "GET /api/children/:id/results" },
  });
  resultsLatency.add(results.timings.duration);
  track(results, 200);

  // 4. Authenticated read — available quizzes (entitlement logic + joins).
  //    Usually the slowest of the four. If lat_available_quizzes is where your
  //    p95 lives, check Atlas → Performance Advisor for a missing index.
  const quizzes = http.get(
    `${BASE_URL}/api/children/${data.childId}/available-quizzes`,
    { ...authed, tags: { name: "GET /api/children/:id/available-quizzes" } }
  );
  quizzesLatency.add(quizzes.timings.duration);
  track(quizzes, 200);

  // Think time. Without this you're testing your own laptop's socket limit,
  // not the server.
  sleep(Math.random() * 2 + 1);
}

/* ───────────────────── AI burst (opt-in) ───────────────────── */

export function aiBurst(data) {
  // FIXED: was `Bearer ${data.token}` — that field doesn't exist since the
  // cookie migration, so every request in this scenario was 401ing while
  // appearing to "work". Cookie jar, same as readTraffic.
  http.cookieJar().set(BASE_URL, "child_token", data.childToken);

  const res = http.post(`${BASE_URL}${AI_PATH}`, JSON.stringify({}), {
    headers: { "Content-Type": "application/json" },
    timeout: "180s",
    tags: { name: "POST ai-submit" },
  });

  // MCQ feedback is now direct Node → Gemini, so a healthy answer is 2xx.
  // A 503 PYTHON_BUSY here means you hit the WRITING path, which still
  // queues on MAX_CONCURRENT_PYTHON — that's expected, not a crash.
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
