// src/app/utils/api.js
// Simple fetch-based API client for your MongoDB-backed backend.
//
// IMPORTANT:
// - Set VITE_API_BASE_URL in your frontend .env (Vite) to your backend base URL.
//   Example:
//     VITE_API_BASE_URL=http://localhost:3000
//     VITE_API_BASE_URL=https://xxxx.ngrok-free.app
//
// This file assumes your backend exposes these endpoints:
//   POST /api/users/register
//   GET  /api/writing/quizzes?email=...
//   GET  /api/writing/latest?email=...&quiz=...
//   GET  /api/writing/:responseId
//   GET  /api/results/quizzes?email=...
//   GET  /api/results/latest/by-filters?email=...&quiz_name=...&year=...&subject=...
//   GET  /api/results/by-email?email=...
//   GET  /api/results/:responseId
//
// OTP endpoints:
//   POST /api/auth/otp/request  { username }
//   POST /api/auth/otp/verify   { username, otp }

// In dev with Vite proxy, use "" so /api goes to backend via proxy. Otherwise use env or default.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

/**
 * ✅ FIXED getJson:
 * - Prevents 304 Not Modified from breaking JSON parsing
 * - Disables caching (cache: 'no-store' + no-cache headers)
 * - Accepts fetch options (e.g., { signal } from AbortController)
 * - Tries to surface server error messages when possible
 */
async function getJson(path, options = {}) {
  const baseUrl = `${API_BASE}${path}`;

  const doFetch = async (url) => {
    return fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(options.headers || {}),
      },
      cache: "no-store",
      ...options,
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
    const msg = body?.error || body?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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
  const data = await getJson(`/api/writing/quizzes?email=${encodeURIComponent(e)}`, options);
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

export async function fetchLatestWritingByEmailAndQuiz(email, quizName, options = {}) {
  const e = normalizeEmail(email);
  const q = String(quizName || "").trim();
  const data = await getJson(
    `/api/writing/latest?email=${encodeURIComponent(e)}&quiz=${encodeURIComponent(q)}`,
    options
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
  const data = await getJson(`/api/results/quizzes?email=${encodeURIComponent(e)}`, options);
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

// ——— Dashboard (non-writing results) ———
export async function fetchLatestResultByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const params = new URLSearchParams({ email: e });
  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.year) params.set("year", options.year);
  if (options.subject) params.set("subject", options.subject);
  const data = await getJson(`/api/results/latest/by-filters?${params.toString()}`);
  return data;
}

export async function fetchResultsByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const params = new URLSearchParams({ email: e });

  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.year) params.set("year", options.year);
  if (options.subject) params.set("subject", options.subject);

  const data = await getJson(`/api/results/by-email?${params.toString()}`);
  return Array.isArray(data) ? data : [];
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to send OTP");
  return j; // { ok, otp_sent_to, otp_expires_in_sec }
}

export async function verifyParentOtp({ email, otp }) {
  const r = await fetch(`${API_BASE}/api/parents/auth/verify-otp`, {
    method: "POST",
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