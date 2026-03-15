// src/app/utils/api-children.js
// Child-related API functions — import alongside existing api.js
//
// ═══════════════════════════════════════════════════════════════
// UPDATED: Added fetchAvailableQuizzes() and fetchFlashcards()
// to support the native quiz system (replacing FlexiQuiz catalog)
// ═══════════════════════════════════════════════════════════════
//
// Usage:
//   import { fetchChildrenSummaries, createChild, fetchAvailableQuizzes, ... } from "@/app/utils/api-children";
export async function fetchCumulativeFeedback(token, childId) {
  const data = await authGet(`/api/children/${childId}/cumulative-feedback`, token);
  return {
    feedback: data?.feedback || {},
    generating: data?.generating ?? false,
  };
}

// One-time migration: remove tokens from localStorage if present
// (legacy from before the cookie-only auth switch)
;(function cleanupLegacyTokens() {
  try {
    localStorage.removeItem("parent_token");
    localStorage.removeItem("child_token");
    localStorage.removeItem("admin_token");
  } catch {}
})();


/**
 * Trigger a manual refresh of cumulative AI feedback for a child.
 * Returns 202 Accepted immediately — feedback generates asynchronously.
 * Poll fetchCumulativeFeedback() to get updated results.
 */
export async function refreshCumulativeFeedback(token, childId) {
  return authPost(
    `/api/children/${childId}/cumulative-feedback/refresh`,
    {},
    token
  );
}
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";





// ─── Helpers ───

async function authGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed: ${res.status}`);
  return body;
}




async function authPost(path, data, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
    const body = await res.json().catch(() => null);
    if (!res.ok)
      throw new Error(body?.error || `Request failed: ${res.status}`);
    return body;
}


async function authPut(path, data, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
    const body = await res.json().catch(() => null);
    if (!res.ok)
      throw new Error(body?.error || `Request failed: ${res.status}`);
    return body;
}

async function authDelete(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
    const body = await res.json().catch(() => null);
    if (!res.ok)
      throw new Error(body?.error || `Request failed: ${res.status}`);
    return body;
}

// ─── Children CRUD ───

/**
 * Fetch all children for the parent with aggregated stats.
 * Powers the ParentDashboard.
 */
export async function fetchChildrenSummaries(token) {
  const data = await authGet("/api/children/summaries", token);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch children list (lightweight, no stats).
 */
export async function fetchChildren(token) {
  const data = await authGet("/api/children", token);
  return Array.isArray(data) ? data : [];
}

/**
 * Create a new child profile.
 * @param {string} token - Parent JWT
 * @param {{ display_name, username, year_level, pin }} childData
 */
export async function createChild(token, childData) {
  return authPost("/api/children", childData, token);
}

/**
 * Update a child's profile.
 * @param {string} token - Parent JWT
 * @param {string} childId - MongoDB _id
 * @param {{ display_name?, year_level?, pin? }} updates
 */
export async function updateChild(token, childId, updates) {
  return authPut(`/api/children/${childId}`, updates, token);
}

/**
 * Delete a child profile.
 */
export async function deleteChild(token, childId) {
  return authDelete(`/api/children/${childId}`, token);
}


// ─── Username Check (public) ───

/**
 * Check if a username is available.
 * Returns { available: boolean }
 */
export async function checkUsername(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return { available: false };
  return authGet(`/api/children/check-username/${encodeURIComponent(u)}`);
}

// ─── Child Login ───

/**
 * Log in as a child with username + PIN.
 * Returns { ok, token, child: { childId, username, displayName, yearLevel, status } }
 */
export async function childLogin({ username, pin }) {
  return authPost("/api/auth/child-login", { username, pin });
}

// ─── Child Results ───

/**
 * Fetch all Result docs for a specific child.
 * ✅ UPDATED: Now returns MERGED results from both FlexiQuiz (legacy)
 * and native QuizAttempt documents in a unified format.
 */
export async function fetchChildResults(token, childId) {
  const data = await authGet(`/api/children/${childId}/results`, token);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch all Writing docs for a specific child.
 */
export async function fetchChildWriting(token, childId) {
  const data = await authGet(`/api/children/${childId}/writing`, token);
  return Array.isArray(data) ? data : [];
}




// ═══════════════════════════════════════════════════════
// ✅ NEW: Native Quiz Functions (replaces FlexiQuiz catalog)
// ═══════════════════════════════════════════════════════

/**
 * Fetch all available quizzes for a child from admin-uploaded quiz database.
 * Returns quizzes that match the child's year level, with entitlement info.
 *
 * ✅ FIX: Now also returns child_status from the backend so the frontend
 * doesn't have to guess or rely on stale localStorage data.
 *
 * For TRIAL children: backend only returns is_trial quizzes (paid quizzes are filtered out)
 * For ACTIVE children: backend returns all quizzes for their year level
 *
 * @param {string} token - Parent or Child JWT
 * @param {string} childId - MongoDB _id of the child
 * @returns {Promise<{ quizzes: Array, child_status: string }>}
 */
export async function fetchAvailableQuizzes(token, childId) {
  const data = await authGet(`/api/children/${childId}/available-quizzes`, token);
  return {
    quizzes: data?.quizzes || [],
    child_status: data?.child_status || "trial",
  };
}

/**
 * Fetch flashcards for a specific completed quiz attempt.
 * Returns all questions with correct answers and the child's responses.
 *
 * @param {string} token - Parent or Child JWT
 * @param {string} attemptId - The attempt_id (not MongoDB _id)
 * @returns {Promise<Object>} { flashcards, wrong_only, total_correct, total_wrong, ... }
 */
export async function fetchAttemptFlashcards(token, attemptId) {
  return authGet(`/api/attempts/${attemptId}/flashcards`, token);
}

/**
 * Fetch wrong-answer flashcards across all recent attempts for a child.
 * Great for a "Review Mistakes" study mode.
 *
 * @param {string} token - Parent or Child JWT
 * @param {string} childId - MongoDB _id of the child
 * @param {Object} [options] - { subject?: string, limit?: number }
 * @returns {Promise<Object>} { flashcards: [], total: number }
 */
export async function fetchChildFlashcards(token, childId, options = {}) {
  const params = new URLSearchParams();
  if (options.subject) params.set("subject", options.subject);
  if (options.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return authGet(`/api/children/${childId}/flashcards${qs ? `?${qs}` : ""}`, token);
}
