// src/app/utils/quizCache.js
// Reusable email-based caches for quiz names + user existence.
// Supports namespacing via `scope` so different pages (writing/nonwriting) don't overwrite each other.

const QUIZ_TTL_MS = 5 * 60 * 1000;     // 5 minutes
const EXISTS_TTL_MS = 30 * 60 * 1000;  // 30 minutes

const getFresh = (entry, ttl) => {
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) return null;
  return entry;
};

const key = (scope, email) => `${scope}:${email}`;

export function createEmailCaches() {
  return {
    quiz: new Map(),   // key(scope:email) -> { quizzes, ts }
    exists: new Map(), // key(scope:email) -> { exists, ts }
  };
}

/**
 * Load quiz names for an email from memory or sessionStorage.
 * @param {string} email - normalized email
 * @param {object} caches - object from createEmailCaches()
 * @param {string} scope - namespace (e.g., "writing", "nonwriting", "default")
 * @returns {string[]|null}
 */
export function loadQuizCache(email, caches, scope = "default") {
  if (!email || !caches) return null;

  const k = key(scope, email);

  // 1) memory
  const mem = getFresh(caches.quiz.get(k), QUIZ_TTL_MS);
  if (mem) return mem.quizzes;

  // 2) sessionStorage
  try {
    const raw = sessionStorage.getItem(`quizCache:${k}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const fresh = getFresh(parsed, QUIZ_TTL_MS);
    if (!fresh) return null;

    caches.quiz.set(k, fresh);
    return fresh.quizzes;
  } catch {
    return null;
  }
}

/**
 * Save quiz names for an email into memory + sessionStorage.
 */
export function saveQuizCache(email, quizzes, caches, scope = "default") {
  if (!email || !caches) return;

  const k = key(scope, email);
  const payload = {
    quizzes: Array.isArray(quizzes) ? quizzes : [],
    ts: Date.now(),
  };

  caches.quiz.set(k, payload);

  try {
    sessionStorage.setItem(`quizCache:${k}`, JSON.stringify(payload));
  } catch {}
}

/**
 * Load existence check result for an email from memory or sessionStorage.
 * @returns {boolean|null}  (null means "not cached")
 */
export function loadExistsCache(email, caches, scope = "default") {
  if (!email || !caches) return null;

  const k = key(scope, email);

  // 1) memory
  const mem = getFresh(caches.exists.get(k), EXISTS_TTL_MS);
  if (mem) return mem.exists;

  // 2) sessionStorage
  try {
    const raw = sessionStorage.getItem(`existsCache:${k}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const fresh = getFresh(parsed, EXISTS_TTL_MS);
    if (!fresh) return null;

    caches.exists.set(k, fresh);
    return fresh.exists;
  } catch {
    return null;
  }
}

/**
 * Save existence check result for an email into memory + sessionStorage.
 */
export function saveExistsCache(email, exists, caches, scope = "default") {
  if (!email || !caches) return;

  const k = key(scope, email);
  const payload = {
    exists: !!exists,
    ts: Date.now(),
  };

  caches.exists.set(k, payload);

  try {
    sessionStorage.setItem(`existsCache:${k}`, JSON.stringify(payload));
  } catch {}
}

/**
 * Optional helper: clear caches for a specific email + scope.
 */
export function clearEmailCache(email, caches, scope = "default") {
  if (!email || !caches) return;

  const k = key(scope, email);
  caches.quiz.delete(k);
  caches.exists.delete(k);

  try {
    sessionStorage.removeItem(`quizCache:${k}`);
    sessionStorage.removeItem(`existsCache:${k}`);
  } catch {}
}
