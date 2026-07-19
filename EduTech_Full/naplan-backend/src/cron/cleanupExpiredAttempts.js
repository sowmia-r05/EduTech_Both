/**
 * cron/cleanupExpiredAttempts.js
 *
 * ✅ Gap 6: Periodic cleanup of expired quiz attempts.
 *
 * Runs every 5 minutes. Finds in_progress attempts where expires_at < now
 * and marks them as "expired". This handles cases where:
 *   - Child closed the browser without submitting
 *   - Network disconnected during a timed quiz
 *   - Client-side timer failed to trigger auto-submit
 *
 * ✅ MULTI-INSTANCE: the tick is gated by amILeader(). With >= 2 instances,
 *    only the current cron leader actually runs the cleanup; the others tick
 *    and return immediately. See utils/cronLeader.js.
 *
 * Usage:
 *   Call setupExpiredAttemptCleanup() once at server startup (in app.js).
 *   startCronLeadership() must also be called once at startup.
 */

const QuizAttempt = require("../models/quizAttempt");
const connectDB = require("../config/db");
const { amILeader } = require("../utils/cronLeader");

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function cleanupExpiredAttempts() {
  // ✅ Only the elected cron leader does the work.
  if (!amILeader()) return;

  try {
    await connectDB();

    const now = new Date();

    // Find and update all expired in-progress attempts
    const result = await QuizAttempt.updateMany(
      {
        status: "in_progress",
        expires_at: { $ne: null, $lt: now },
      },
      {
        $set: {
          status: "expired",
          submitted_at: now,
          "ai_feedback_meta.status": "error",
          "ai_feedback_meta.status_message": "Quiz expired — time ran out without submission",
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`🧹 Cleaned up ${result.modifiedCount} expired quiz attempt(s)`);
    }

    // Also clean up very old in-progress attempts without a timer
    // (e.g., abandoned quizzes older than 24 hours)
    const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago
    const staleResult = await QuizAttempt.updateMany(
      {
        status: "in_progress",
        expires_at: null, // No timer set
        started_at: { $lt: staleThreshold },
      },
      {
        $set: {
          status: "expired",
          submitted_at: now,
          "ai_feedback_meta.status": "error",
          "ai_feedback_meta.status_message": "Quiz abandoned — no activity for 24 hours",
        },
      }
    );

    if (staleResult.modifiedCount > 0) {
      console.log(`🧹 Cleaned up ${staleResult.modifiedCount} stale abandoned attempt(s)`);
    }
  } catch (err) {
    console.error("❌ Expired attempt cleanup error:", err.message);
  }
}

function setupExpiredAttemptCleanup() {
  // Run once shortly after startup. Delayed (not immediate) so the cron
  // leadership heartbeat has time to settle — otherwise this first run would
  // always see amILeader() === false and skip.
  setTimeout(cleanupExpiredAttempts, 8000);

  // Then run periodically
  const interval = setInterval(cleanupExpiredAttempts, CLEANUP_INTERVAL_MS);

  // Allow cleanup on process exit (don't keep process alive)
  if (interval.unref) interval.unref();

  console.log("⏰ Expired attempt cleanup cron started (every 5 min, leader-gated)");
  return interval;
}

module.exports = { cleanupExpiredAttempts, setupExpiredAttemptCleanup };