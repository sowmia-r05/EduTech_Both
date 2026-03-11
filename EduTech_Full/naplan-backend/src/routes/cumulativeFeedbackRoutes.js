/**
 * routes/cumulativeFeedbackRoutes.js
 *
 * FIX v2:
 *   - Detect stale "generating" docs (stuck >5 min after server restart / Python crash)
 *     and reset them to "error" so they can be re-triggered on next poll.
 *   - Also clears the in-memory runningChildren lock if the server restarted.
 */

const router = require("express").Router({ mergeParams: true });
const mongoose = require("mongoose");
const { verifyToken, requireAuth } = require("../middleware/auth");
const CumulativeFeedback = require("../models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
  clearRunningLock,           // ← new export (see cumulativeFeedbackService fix)
} = require("../services/cumulativeFeedbackService");

router.use(verifyToken);
router.use(requireAuth);

// How long before a "generating" doc is considered stale and eligible for retry
const STALE_GENERATING_MS = 5 * 60 * 1000; // 5 minutes

function validateChildAccess(req, childId) {
  const user = req.user;
  if (!user) return false;
  if (user.role === "parent" || user.parentId) return true;
  if (user.role === "child" || user.childId) {
    return String(user.childId || user.child_id) === String(childId);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// GET /api/children/:childId/cumulative-feedback
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid childId" });
    }

    if (!validateChildAccess(req, childId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const feedbackMap = await getCumulativeFeedback(childId);

    // ── FIX: Detect and reset stale "generating" docs ──────────
    // If a doc has been stuck in "generating" for >5 min (e.g. server restart
    // cleared the in-memory runningChildren lock, but MongoDB was never updated),
    // reset it to "error" so the next logic block can safely re-trigger.
    const staleThreshold = new Date(Date.now() - STALE_GENERATING_MS);
    const staleSubjects = Object.entries(feedbackMap)
      .filter(([, d]) =>
        d.status === "generating" &&
        d.updatedAt &&
        new Date(d.updatedAt) < staleThreshold
      )
      .map(([subject]) => subject);

    if (staleSubjects.length > 0) {
      console.warn(
        `⚠️ Resetting ${staleSubjects.length} stale "generating" doc(s) for child ${childId}: ${staleSubjects.join(", ")}`
      );

      await CumulativeFeedback.updateMany(
        {
          child_id: childId,
          status: "generating",
          updatedAt: { $lt: staleThreshold },
        },
        {
          $set: {
            status: "error",
            status_message: "Generation timed out (server restart?) — will retry automatically",
          },
        }
      );

      // Update local map so the logic below sees the corrected status
      for (const subject of staleSubjects) {
        if (feedbackMap[subject]) {
          feedbackMap[subject].status = "error";
        }
      }

      // Also clear the in-memory lock so triggerCumulativeFeedback can run again
      if (typeof clearRunningLock === "function") {
        clearRunningLock(childId);
      }
    }
    // ── END FIX ────────────────────────────────────────────────

    const hasAnyDone = Object.values(feedbackMap).some((d) => d.status === "done");
    const hasError   = Object.values(feedbackMap).some((d) => d.status === "error");
    const isCurrentlyGenerating = Object.values(feedbackMap).some(
      (d) => d.status === "generating" || d.status === "pending"
    );

    // Trigger generation when: nothing is done yet OR there's an error, AND nothing is actively running
    const shouldTrigger = (!hasAnyDone || hasError) && !isCurrentlyGenerating;

    if (shouldTrigger) {
      console.log(`🚀 Triggering cumulative feedback for child ${childId}`);
      setImmediate(() => {
        triggerCumulativeFeedback(childId).catch((e) =>
          console.error("Async cumulative trigger error:", e.message)
        );
      });
    }

    return res.json({
      ok: true,
      feedback: feedbackMap,
      generating: shouldTrigger || isCurrentlyGenerating,
    });

  } catch (err) {
    console.error("GET cumulative-feedback error:", err);
    return res.status(500).json({ error: "Failed to fetch cumulative feedback" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/children/:childId/cumulative-feedback/refresh
// ─────────────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid childId" });
    }

    if (!validateChildAccess(req, childId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Reset all docs to pending + clear any stale lock
    await CumulativeFeedback.updateMany(
      { child_id: childId },
      { $set: { status: "pending", status_message: "Refresh requested…" } }
    );

    if (typeof clearRunningLock === "function") {
      clearRunningLock(childId);
    }

    setImmediate(() => {
      triggerCumulativeFeedback(childId).catch((e) =>
        console.error("Refresh cumulative trigger error:", e.message)
      );
    });

    return res.status(202).json({
      ok: true,
      message: "Cumulative feedback refresh started. Poll GET endpoint for updates.",
    });

  } catch (err) {
    console.error("POST cumulative-feedback/refresh error:", err);
    return res.status(500).json({ error: "Failed to trigger refresh" });
  }
});

module.exports = router;