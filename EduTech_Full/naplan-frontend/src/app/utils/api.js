// src/app/utils/api.js
// Simple fetch-based API client for your MongoDB-backed backend.
//
// IMPORTANT:
// - Set VITE_API_BASE_URL in your frontend .env (Vite) to your backend base URL.
//   Example:
//     VITE_API_BASE_URL=http://localhost:3000
//     # or your ngrok URL
//     VITE_API_BASE_URL=https://xxxx.ngrok-free.app
//
// This file assumes your backend exposes these endpoints:
//   GET /api/users/exists?email=...
//   GET /api/writing/quizzes?email=...
//   GET /api/writing/latest?email=...&quiz=...
//   GET /api/writing/:responseId
//   GET /api/results/quizzes?email=...
//   GET /api/results/latest/by-filters?email=...&quiz_name=...&year=...&subject=...
//   GET /api/results/by-email?email=...
//   GET /api/results/:responseId
//
// OTP endpoints (new requirements):
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

export async function verifyEmailExists(email, options = {}) {
  const e = normalizeEmail(email);
  const data = await getJson(`/api/users/exists?email=${encodeURIComponent(e)}`, options);
  return !!data?.exists;
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
   ✅ OTP (NEW REQUIREMENT: username-based, not email-based)
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

  // backend may return { ok:true, email_masked:"v****@gmail.com" }
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
