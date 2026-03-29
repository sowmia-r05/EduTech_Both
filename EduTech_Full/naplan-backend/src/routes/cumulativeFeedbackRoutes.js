// routes/cumulativeFeedbackRoutes.js
//
// BUGS FIXED:
//   ✅ BUG-4 (HIGH): Added subscription check on GET and POST /refresh endpoints.
//     Trial children could call these endpoints directly from the browser console
//     and receive (or trigger) AI feedback without a paid subscription.
//     Now returns 403 if child.status !== "active".

const express  = require("express");
const mongoose = require("mongoose");
const router   = express.Router({ mergeParams: true }); // needs :childId from parent router

const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");

const Child              = require("../models/child");
const CumulativeFeedback = require("../models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
  clearRunningLock,
} = require("../services/cumulativeFeedbackService");

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Validates that the requester is allowed to access this child's data.
// Parent can access any of their children. Child can only access own data.

function validateChildAccess(req, childId) {
  const { role, childId: tokenChildId, parentId } = req.user || {};
  if (role === "child") return String(tokenChildId) === String(childId);
  if (role === "parent") return true; // ownership verified below against DB
  return false;
}

// ─────────────────────────────────────────────────────────────
// GET /api/children/:childId/cumulative-feedback
// ─────────────────────────────────────────────────────────────
router.get("/", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();

    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid childId" });
    }

    if (!validateChildAccess(req, childId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // If parent, verify ownership
    if (req.user.role === "parent") {
      const parentId = req.user?.parentId || req.user?.parent_id;
      if (String(child.parent_id) !== String(parentId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // ✅ BUG-4 FIX: Subscription gate — trial children cannot access AI feedback
    if (child.status !== "active") {
      return res.status(403).json({
        error: "Upgrade required",
        code:  "TRIAL_LIMIT",
        message: "AI feedback is only available with a full access subscription.",
      });
    }

    // ── Stale lock detection ──────────────────────────────────────────────────
    // If a doc has been "generating" for >5 minutes, reset it to "error" so
    // the UI can show a retry button instead of spinning forever.
    const STALE_THRESHOLD_MS = 5 * 60 * 1000;
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    const staleDocs = await CumulativeFeedback.find({
      child_id: childId,
      status:   "generating",
      updatedAt: { $lt: staleThreshold },
    }).lean();

    const staleSubjects = staleDocs.map((d) => d.subject);

    if (staleSubjects.length > 0) {
      await CumulativeFeedback.updateMany(
        { child_id: childId, subject: { $in: staleSubjects } },
        {
          $set: {
            status: "error",
            status_message: "Generation timed out — will retry automatically",
          },
        }
      );

      if (typeof clearRunningLock === "function") {
        clearRunningLock(childId);
      }
    }

    const feedbackMap = await getCumulativeFeedback(childId);

    // Merge stale resets into the map
    for (const subject of staleSubjects) {
      if (feedbackMap[subject]) {
        feedbackMap[subject].status = "error";
      }
    }

    const hasAnyDone = Object.values(feedbackMap).some((d) => d.status === "done");
    const isCurrentlyGenerating = Object.values(feedbackMap).some(
      (d) => d.status === "generating" || d.status === "pending",
    );

    // Check if any subjects that the child HAS data for are missing feedback
    const ALL_SUBJECTS = ["Overall", "Reading", "Writing", "Numeracy", "Language"];
    const missingSubjects = ALL_SUBJECTS.filter(
      (s) => !feedbackMap[s] || feedbackMap[s].status === "error",
    );

    const shouldTrigger =
      (!hasAnyDone || missingSubjects.length > 0) && !isCurrentlyGenerating;

    if (shouldTrigger) {
      setImmediate(() => {
        triggerCumulativeFeedback(childId).catch((e) =>
          console.error("Async cumulative trigger error:", e.message),
        );
      });
    }


    return res.json({
      ok: true,
      feedback:   feedbackMap,
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
router.post("/refresh", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();

    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid childId" });
    }

    if (!validateChildAccess(req, childId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // If parent, verify ownership
    if (req.user.role === "parent") {
      const parentId = req.user?.parentId || req.user?.parent_id;
      if (String(child.parent_id) !== String(parentId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // ✅ BUG-4 FIX: Subscription gate — trial children cannot trigger AI refresh
    if (child.status !== "active") {
      return res.status(403).json({
        error: "Upgrade required",
        code:  "TRIAL_LIMIT",
        message: "AI feedback refresh is only available with a full access subscription.",
      });
    }

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
