/**
 * routes/cumulativeFeedbackRoutes.js
 */

const router = require("express").Router({ mergeParams: true });
const mongoose = require("mongoose");
const { verifyToken, requireAuth } = require("../middleware/auth");
const CumulativeFeedback = require("../models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
} = require("../services/cumulativeFeedbackService");

router.use(verifyToken);
router.use(requireAuth);

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

    const hasAnyDone = Object.values(feedbackMap).some((d) => d.status === "done");
    const hasError = Object.values(feedbackMap).some((d) => d.status === "error");
    const isCurrentlyGenerating = Object.values(feedbackMap).some(
      (d) => d.status === "generating" || d.status === "pending"
    );

    const justTriggered = !hasAnyDone || hasError;
    if (justTriggered && !isCurrentlyGenerating) {
      setImmediate(() => {
        triggerCumulativeFeedback(childId).catch((e) =>
          console.error("Async cumulative trigger error:", e.message)
        );
      });
    }

    return res.json({
      ok: true,
      feedback: feedbackMap,
      generating: justTriggered || isCurrentlyGenerating, // ✅ FIXED
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

    await CumulativeFeedback.updateMany(
      { child_id: childId },
      { $set: { status: "pending", status_message: "Refresh requested…" } }
    );

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