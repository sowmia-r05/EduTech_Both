/**
 * src/constants/attemptStatus.js
 *
 * SINGLE SOURCE OF TRUTH for QuizAttempt status values.
 *
 * Import these everywhere a status string is used — the model's `enum`, the
 * /start and /submit routes, the expiry cron, the max-attempts count query, and
 * the tests — instead of writing raw strings. One mistyped literal is exactly
 * the drift this prevents, and adding a new status becomes a one-line change here.
 *
 * Everything is Object.freeze'd so a stray reassignment throws in strict mode
 * instead of silently corrupting the set.
 */

// ─────────────────────────────────────────────
// Attempt lifecycle status
// ─────────────────────────────────────────────
const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: "in_progress", // live: resumable + re-submittable
  SCORING: "scoring", // transient claim during submit (being scored)
  SUBMITTED: "submitted", // writing quiz submitted, awaiting AI scoring
  SCORED: "scored", // score computed
  AI_DONE: "ai_done", // AI feedback attached
  EXPIRED: "expired", // timer ran out with no submit
  ERROR: "error", // processing error
});

// Array form for the Mongoose `enum:` option (derived — never hand-maintained).
const ATTEMPT_STATUS_VALUES = Object.freeze(Object.values(ATTEMPT_STATUS));

// ─────────────────────────────────────────────
// Semantic groupings
//
// ⚠️ These encode BEHAVIOR. Before you swap one into existing logic, confirm its
// membership matches what that code does today, or you'll silently change rules.
// Adjust membership HERE (one place) rather than in each consumer.
// ─────────────────────────────────────────────

// The only status a /start request may resume.
const RESUMABLE = Object.freeze([ATTEMPT_STATUS.IN_PROGRESS]);

// "Already submitted" — used by the /submit race 409 check. Any of these means
// the attempt has been claimed/processed and must not be re-scored.
const SUBMITTED_OR_BEYOND = Object.freeze([
  ATTEMPT_STATUS.SCORING,
  ATTEMPT_STATUS.SUBMITTED,
  ATTEMPT_STATUS.SCORED,
  ATTEMPT_STATUS.AI_DONE,
]);

// Finished states that won't transition further (useful for the cron / reads).
const TERMINAL = Object.freeze([
  ATTEMPT_STATUS.SCORED,
  ATTEMPT_STATUS.AI_DONE,
  ATTEMPT_STATUS.EXPIRED,
  ATTEMPT_STATUS.ERROR,
]);

// Statuses that CONSUME an attempt (count against a quiz's max_attempts).
// ✅ Confirmed by your tests: SCORED and AI_DONE count; IN_PROGRESS does not.
// The set below is the conservative confirmed pair. If your CURRENT count query
// also counts SUBMITTED / SCORING / EXPIRED, add them here so this mirrors
// today's behavior exactly — do NOT swap this into the query until you've
// checked. (Paste the count query and we'll pin the membership together.)
const COUNTS_TOWARD_LIMIT = Object.freeze([
  ATTEMPT_STATUS.SCORED,
  ATTEMPT_STATUS.AI_DONE,
]);

// ─────────────────────────────────────────────
// AI feedback pipeline status (ai_feedback_meta.status) — separate enum,
// same treatment so gemini scripts / feedback routes stop hard-coding it.
// ─────────────────────────────────────────────
const FEEDBACK_STATUS = Object.freeze({
  PENDING: "pending",
  QUEUED: "queued",
  GENERATING: "generating",
  DONE: "done",
  ERROR: "error",
});
const FEEDBACK_STATUS_VALUES = Object.freeze(Object.values(FEEDBACK_STATUS));

module.exports = {
  ATTEMPT_STATUS,
  ATTEMPT_STATUS_VALUES,
  RESUMABLE,
  SUBMITTED_OR_BEYOND,
  TERMINAL,
  COUNTS_TOWARD_LIMIT,
  FEEDBACK_STATUS,
  FEEDBACK_STATUS_VALUES,
};