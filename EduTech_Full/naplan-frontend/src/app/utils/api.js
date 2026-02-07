// utils/api.js
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
//   GET /api/results/quizzes?email=...
//   GET /api/results/latest/by-filters?email=...&quiz_name=...&year=...&subject=...
//   GET /api/results/by-email?email=...

// In dev with Vite proxy, use "" so /api goes to backend via proxy. Otherwise use env or default.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

/**
 * ✅ UPDATED:
 * - Accepts fetch options (e.g., { signal } from AbortController)
 * - Spreads options into fetch so requests can be aborted
 */
async function getJson(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    ...options, // ✅ enables AbortController signal etc.
  });

  // Handle 204 No Content responses
  if (res.status === 204) return null;

  // Try to parse JSON even on errors (to show server message)
  let body = null;
  try {
    body = await res.json();
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

/**
 * ✅ UPDATED:
 * - Accepts options (e.g. { signal })
 * - Passes options into getJson to support abort + faster UX while typing
 */
export async function verifyEmailExists(email, options = {}) {
  const e = normalizeEmail(email);
  const data = await getJson(`/api/users/exists?email=${encodeURIComponent(e)}`, options);
  return !!data?.exists;
}

export async function fetchQuizNamesByEmail(email) {
  const e = normalizeEmail(email);
  const data = await getJson(`/api/writing/quizzes?email=${encodeURIComponent(e)}`);
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

export async function fetchLatestWritingByEmailAndQuiz(email, quizName) {
  const e = normalizeEmail(email);
  const q = String(quizName || "").trim();
  const data = await getJson(
    `/api/writing/latest?email=${encodeURIComponent(e)}&quiz=${encodeURIComponent(q)}`
  );
  return data;
}

// Quiz names from results collection (for non-writing dashboard lookup)
export async function fetchResultQuizNamesByEmail(email) {
  const e = normalizeEmail(email);
  const data = await getJson(`/api/results/quizzes?email=${encodeURIComponent(e)}`);
  return Array.isArray(data?.quizNames) ? data.quizNames : [];
}

// ——— Dashboard (non-writing results) ———
// Latest result for an email, optionally filtered by quiz/year/subject
export async function fetchLatestResultByEmail(email, options = {}) {
  const e = normalizeEmail(email);
  const params = new URLSearchParams({ email: e });
  if (options.quiz_name) params.set("quiz_name", options.quiz_name);
  if (options.year) params.set("year", options.year);
  if (options.subject) params.set("subject", options.subject);
  const data = await getJson(`/api/results/latest/by-filters?${params.toString()}`);
  return data;
}

// All results for an email (for progress-over-time chart)
export async function fetchResultsByEmail(email) {
  const e = normalizeEmail(email);
  const data = await getJson(`/api/results/by-email?email=${encodeURIComponent(e)}`);
  return Array.isArray(data) ? data : [];
}
