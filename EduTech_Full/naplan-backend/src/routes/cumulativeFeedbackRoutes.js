/**
 * routes/cumulativeFeedbackRoutes.js
 *
 * Mounts at: /api/children/:childId/cumulative-feedback
 *
 * GET  /api/children/:childId/cumulative-feedback
 *   → Returns all cumulative feedback docs for the child (keyed by subject).
 *     If feedback is stale (not generated yet or errored), optionally triggers refresh.
 *
 * POST /api/children/:childId/cumulative-feedback/refresh
 *   → Manually triggers regeneration of all cumulative feedback for the child.
 *     Runs async (responds immediately with 202 Accepted).
 *
 * Auth: requireAuth (parent token or child token both OK)
 */

const router = require("express").Router({ mergeParams: true });
const mongoose = require("mongoose");
const { verifyToken, requireAuth } = require("../middleware/auth");
const CumulativeFeedback = require("../models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
} = require("../services/cumulativeFeedbackService");

// All routes require auth
router.use(verifyToken);
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// Validate child access helper
// Ensures the requester (parent or child) can access this child's data
// ─────────────────────────────────────────────────────────────
function validateChildAccess(req, childId) {
  const user = req.user;
  if (!user) return false;

  // Parent: must own the child (checked by parent_id on child — enforced at child routes level)
  if (user.role === "parent" || user.parentId) return true;

  // Child: must match their own childId
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

    // If no feedback exists at all, kick off generation (async, don't wait)
    const hasAnyDone = Object.values(feedbackMap).some((d) => d.status === "done");
    if (!hasAnyDone) {
      // Fire and forget — client can poll or refresh
      setImmediate(() => {
        triggerCumulativeFeedback(childId).catch((e) =>
          console.error("Async cumulative trigger error:", e.message)
        );
      });
    }

    return res.json({
      ok: true,
      feedback: feedbackMap,
      // Tell the client if it needs to poll
      generating: Object.values(feedbackMap).some((d) => d.status === "generating"),
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

    // Mark all existing docs as pending so UI shows loading state
    await CumulativeFeedback.updateMany(
      { child_id: childId },
      { $set: { status: "pending", status_message: "Refresh requested…" } }
    );

    // Trigger async (fire and forget)
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