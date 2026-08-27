// src/app/utils/api.js
// Simple fetch-based API client for your MongoDB-backed backend.
//
// ═══════════════════════════════════════════════════════════════════════════
// 👈 CHANGED — THE FIX: `credentials: "include"` on every request.
//
// fetch() defaults to credentials:"same-origin". The frontend is served from
// https://naplan.kaisolutions.ai and the API lives at
// https://naplanapi.kaisolutions.ai — a DIFFERENT origin. Under the default,
// the browser silently strips the Cookie header on every one of these calls.
//
// Symptom this caused: parent_token was present in DevTools → Application →
// Cookies with correct attributes (Domain .kaisolutions.ai, SameSite=None,
// Secure, HttpOnly), the request reached Express, and the server still
// answered 401 "No credentials provided" — because the Network tab request
// carried no Cookie header at all. The cookie was never the problem; the
// fetch never asked for it.
//
// Only calls that route through THIS file were affected. The rest of the app
// uses apiFetch() from AuthContext, which already sets credentials:"include"
// — which is why the results page failed while the dashboards worked.
//
// Note: credentials:"include" requires the server to send
// Access-Control-Allow-Credentials: true and to echo a specific origin (never
// "*"). app.js already does both via cors({ credentials: true }).
// ═══════════════════════════════════════════════════════════════════════════
//
// IMPORTANT:
// - Set VITE_API_BASE_URL in your frontend .env (Vite) to your backend base URL.
//   Example:
//     VITE_API_BASE_URL=http://localhost:3000
//     VITE_API_BASE_URL=https://xxxx.ngrok-free.app

// In dev with Vite proxy, use "" so /api goes to backend via proxy. Otherwise use env or default.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

/**
 * ✅ getJson:
 * - Prevents 304 Not Modified from breaking JSON parsing
 * - Disables caching (cache: 'no-store' + no-cache headers)
 * - Accepts fetch options (e.g., { signal } from AbortController)
 * - Tries to surface server error messages when possible
 * - 👈 CHANGED: sends cookies cross-origin, and no longer lets a caller's
 *   options object clobber the base headers.
 */
async function getJson(path, options = {}) {
  const baseUrl = `${API_BASE}${path}`;

  // 👈 CHANGED: pull `headers` out of options before spreading. Previously
  // `...options` was spread AFTER the headers key, so any caller passing
  // { headers: { Authorization } } replaced the whole merged headers object
  // and silently dropped Accept / Cache-Control / Pragma.
  const { headers: callerHeaders, ...restOptions } = options;

  const doFetch = async (url) => {
    return fetch(url, {
      method: "GET",
      // 👈 CHANGED — sends parent_token / child_token on cross-origin calls.
      credentials: "include",
      cache: "no-store",
      ...restOptions,
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(callerHeaders || {}),
      },
    });
  };

  let res = await doFetch(baseUrl);

  // 204 No Content
  if (res.status === 204) return null;

  // ✅ 304 Not Modified often comes with NO body.
  // Retry once with a cache-busting query param.
  if (res.status === 304) {
    const bustedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
    res = await doFetch(bustedUrl);
    if (res.status === 204) return null;
  }

  // Parse JSON if possible
  let body = null;
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      const text = await res.text();
      body = text ? { message: text } : null;
    }
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg =
      body?.error || body?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
   ✅ Registration (email NOT unique)
   Backend:
     POST /api/users/register
     body: { firstName, lastName, yearLevel, email }
========================================================= */
export async function registerUserInFlexiQuiz({
  firstName,
  lastName,
  yearLevel,
  email,
}) {
  const payload = {
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    yearLevel: String(yearLevel || "").trim(),
    email: normalizeEmail(email),
  };

  const r = await fetch(`${API_BASE}/api/users/register`, {
    method: "POST",
    credentials: "include", // 👈 CHANGED
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    throw new Error(j?.detail || j?.error || "Registration failed");
  }
  return j; // { ok, user_id, user_name, password?, mode }
}

export async function fetchQuizNamesByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const data = await getJson(
    `/api/writing/quizzes?email=${encodeURIComponent(e)}`,
    options,
  );
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

export async function fetchLatestWritingByEmailAndQuiz(
  email,
  quizName,
  options = {},
) {
  const e = normalizeEmail(email);
  const q = String(quizName || "").trim();
  const data = await getJson(
    `/api/writing/latest?email=${encodeURIComponent(e)}&quiz=${encodeURIComponent(q)}`,
    options,
  );
  return data;
}

export async function fetchWritingByResponseId(responseId, options = {}) {
  const id = String(responseId || "").trim();
  if (!id) throw new Error("responseId is required");
  const data = await getJson(`/api/writing/${encodeURIComponent(id)}`, options);
  return data;
}

// Quiz names from results collection (for non-writing dashboard lookup)
export async function fetchResultQuizNamesByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const data = await getJson(
    `/api/results/quizzes?email=${encodeURIComponent(e)}`,
    options,
  );
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

// ——— Dashboard (non-writing results) ———
export async function fetchLatestResultByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const params = new URLSearchParams({ email: e });
  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.year) params.set("year", options.year);
  if (options.subject) params.set("subject", options.subject);
  // 👈 CHANGED: forward auth headers, which were previously dropped here.
  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(
    `/api/results/latest/by-filters?${params.toString()}`,
    fetchOpts,
  );
  return data;
}

export async function fetchResultsByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const params = new URLSearchParams({ email: e });

  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.year) params.set("year", options.year);
  if (options.subject) params.set("subject", options.subject);

  // ✅ Forward auth headers so backend doesn't return 401
  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(
    `/api/results/by-email?${params.toString()}`,
    fetchOpts,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * ✅ Fetch all results for a specific child by username (not email).
 * This avoids mixing results from siblings who share the same parent email.
 */
export async function fetchResultsByUsername(username, options = {}) {
  const u = String(username || "").trim();
  if (!u) throw new Error("username is required");

  const params = new URLSearchParams({ username: u });
  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.subject) params.set("subject", options.subject);

  // ✅ Forward auth headers so backend doesn't return 401
  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(
    `/api/results/by-username?${params.toString()}`,
    fetchOpts,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * ✅ Fetch all writing submissions for a specific child by username.
 * Sibling-safe — doesn't mix children sharing the same parent email.
 */
export async function fetchWritingsByUsername(username, options = {}) {
  const u = String(username || "").trim();
  if (!u) throw new Error("username is required");
  const params = new URLSearchParams({ username: u });
  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(`/api/writing/by-username?${params.toString()}`, fetchOpts);
  return Array.isArray(data) ? data : [];
}

/**
 * ✅ Fetch all writing submissions by child_id.
 * Fallback for native quiz children where user.user_name may be null.
 */
export async function fetchWritingsByChildId(childId, options = {}) {
  const id = String(childId || "").trim();
  if (!id) throw new Error("childId is required");

  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(
    `/api/writing/by-child-id?child_id=${encodeURIComponent(id)}`,
    fetchOpts,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * ✅ Fetch latest writing submission by username (sibling-safe).
 */
export async function fetchLatestWritingByUsername(username, options = {}) {
  const u = String(username || "").trim();
  if (!u) throw new Error("username is required");

  // 👈 CHANGED: forward auth headers, which were previously dropped here.
  const fetchOpts = options.headers ? { headers: options.headers } : {};
  const data = await getJson(
    `/api/writing/latest/by-username?username=${encodeURIComponent(u)}`,
    fetchOpts,
  );
  return data;
}

export async function fetchResultByResponseId(responseId, options = {}) {
  const id = String(responseId || "").trim();
  if (!id) throw new Error("responseId required");
  const data = await getJson(`/api/results/${encodeURIComponent(id)}`, options);
  return data;
}

/* =========================================================
   ✅ OTP (username-based)
   Backend:
     POST /api/auth/otp/request { username }
     POST /api/auth/otp/verify  { username, otp }
========================================================= */

export function normalizeUsername(username) {
  return String(username || "").trim();
}

export async function requestOtpByUsername(username) {
  const u = normalizeUsername(username);
  if (!u) throw new Error("User ID required");

  const r = await fetch(`${API_BASE}/api/auth/otp/request`, {
    method: "POST",
    credentials: "include", // 👈 CHANGED
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Failed to send OTP");

  return j;
}

export async function verifyOtpByUsername(username, otp) {
  const u = normalizeUsername(username);
  const code = String(otp || "").trim();

  if (!u) throw new Error("User ID required");
  if (!code) throw new Error("OTP required");

  const r = await fetch(`${API_BASE}/api/auth/otp/verify`, {
    method: "POST",
    credentials: "include", // 👈 CHANGED
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, otp: code }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "OTP verification failed");

  return j.login_token; // ✅ use for /api/flexiquiz/sso?login_token=...
}

export async function createParentAccount({ firstName, lastName, email }) {
  const payload = {
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    email: normalizeEmail(email),
  };

  const r = await fetch(`${API_BASE}/api/parents/auth/send-otp`, {
    method: "POST",
    credentials: "include", // 👈 CHANGED
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to send OTP");
  return j; // { ok, otp_sent_to, otp_expires_in_sec }
}

export async function verifyParentOtp({ email, otp }) {
  // 👈 CHANGED — this one matters twice over. Without credentials:"include"
  // the browser also IGNORES the Set-Cookie header on a cross-origin
  // response, so the parent_token cookie would never be stored in the first
  // place.
  const r = await fetch(`${API_BASE}/api/parents/auth/verify-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: normalizeEmail(email),
      otp: String(otp || "").trim(),
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || "OTP verification failed");
  return j; // { ok, parent_token, parent }
}