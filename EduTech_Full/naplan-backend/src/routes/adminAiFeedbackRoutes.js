/**
 * routes/adminAiFeedbackRoutes.js
 *
 * Admin endpoints to diagnose and re-trigger AI feedback for
 * quiz attempts that failed or got stuck.
 *
 * Auth: requireAdmin (admin JWT from /api/admin/login)
 *
 * Endpoints:
 *   GET  /api/admin/ai-feedback/status/:responseId — Check AI status
 *   GET  /api/admin/ai-feedback/failed              — List all failed/stuck attempts
 *   POST /api/admin/ai-feedback/retry/:responseId   — Re-trigger by attempt_id
 *   POST /api/admin/ai-feedback/retry-all           — Bulk re-trigger all failed
 */

const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const connectDB = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");

const { triggerAiFeedback } = require("../services/aiFeedbackService");

const router = express.Router();
router.use(requireAdmin);

const NATIVE_RETRIABLE = ["error", "pending", "queued", "generating"];
const MAX_BULK_RETRY = 50;

// ─────────────────────────────────────────────────────────────
// HELPER: Find a native QuizAttempt by attempt_id
// ─────────────────────────────────────────────────────────────
async function findByResponseId(responseId) {
  const doc = await QuizAttempt.findOne({ attempt_id: responseId }).lean();
  return doc ? { source: "native", doc } : null;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Re-trigger AI feedback for a native QuizAttempt
// ─────────────────────────────────────────────────────────────
async function retryNativeAttempt(attemptDoc) {
  const tb = attemptDoc.topic_breakdown;
  const hasTB = tb && (tb instanceof Map ? tb.size > 0 : Object.keys(tb).length > 0);

  if (!hasTB) {
    throw new Error("topic_breakdown is empty — cannot generate feedback");
  }

  const isWriting = String(attemptDoc.subject || "").toLowerCase() === "writing";

  await triggerAiFeedback({
    attemptId: attemptDoc.attempt_id,
    quizId: attemptDoc.quiz_id,
    subject: attemptDoc.subject,
    isWriting,
    scoredAnswers: attemptDoc.answers || [],
    topicBreakdown: attemptDoc.topic_breakdown,
    score: attemptDoc.score,
    yearLevel: attemptDoc.year_level,
    quizName: attemptDoc.quiz_name,
    childId: attemptDoc.child_id,
    duration: attemptDoc.duration_sec,
  });
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/admin/ai-feedback/status/:responseId
   ═══════════════════════════════════════════════════════════════ */
router.get("/ai-feedback/status/:responseId", async (req, res) => {
  try {
    await connectDB();
    const found = await findByResponseId(req.params.responseId);
    if (!found) {
      return res.status(404).json({ error: `No attempt found for: ${req.params.responseId}` });
    }

    const { doc } = found;
    const fb = doc.ai_feedback || {};
    const hasFeedback =
      (fb.overall_feedback && String(fb.overall_feedback).trim().length > 0) ||
      (Array.isArray(fb.strengths) && fb.strengths.length > 0) ||
      (Array.isArray(fb.weaknesses) && fb.weaknesses.length > 0) ||
      (Array.isArray(fb.coach) && fb.coach.length > 0);

    return res.json({
      source: "native (QuizAttempt)",
      attempt_id: doc.attempt_id,
      quiz_name: doc.quiz_name,
      child_id: doc.child_id,
      subject: doc.subject,
      score_pct: doc.score?.percentage || 0,
      ai_status: doc.ai_feedback_meta?.status || "unknown",
      ai_message: doc.ai_feedback_meta?.status_message || "",
      has_feedback: hasFeedback,
      has_topic_breakdown: !!(doc.topic_breakdown && Object.keys(doc.topic_breakdown).length > 0),
      topic_count: doc.topic_breakdown ? Object.keys(doc.topic_breakdown).length : 0,
      feedback_fields: {
        overall_feedback: !!fb.overall_feedback,
        strengths: (fb.strengths || []).length,
        weaknesses: (fb.weaknesses || []).length,
        coach: (fb.coach || []).length,
        study_tips: (fb.study_tips || []).length,
        topic_wise_tips: (fb.topic_wise_tips || []).length,
      },
    });
  } catch (err) {
    console.error("❌ admin/ai-feedback/status:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/admin/ai-feedback/failed
   ═══════════════════════════════════════════════════════════════ */
router.get("/ai-feedback/failed", async (req, res) => {
  try {
    await connectDB();

    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const quizNameFilter = req.query.quiz_name;
    const statusFilter = req.query.status;

    const nativeStatuses = statusFilter ? [statusFilter] : NATIVE_RETRIABLE;
    const query = {
      "ai_feedback_meta.status": { $in: nativeStatuses },
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quizNameFilter) query.quiz_name = { $regex: quizNameFilter, $options: "i" };

    const docs = await QuizAttempt.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const results = docs.map((d) => ({
      source: "native",
      attempt_id: d.attempt_id,
      quiz_name: d.quiz_name,
      child_id: d.child_id,
      subject: d.subject,
      score_pct: d.score?.percentage || 0,
      ai_status: d.ai_feedback_meta?.status || "unknown",
      ai_message: d.ai_feedback_meta?.status_message || "",
      no_topic_breakdown: !(d.topic_breakdown && Object.keys(d.topic_breakdown).length > 0),
      date: d.submitted_at || d.createdAt,
    }));

    const summary = { total: results.length, by_status: {} };
    for (const r of results) {
      summary.by_status[r.ai_status] = (summary.by_status[r.ai_status] || 0) + 1;
    }

    res.json({ summary, results });
  } catch (err) {
    console.error("❌ admin/ai-feedback/failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/admin/ai-feedback/retry/:responseId
   ═══════════════════════════════════════════════════════════════ */
router.post("/ai-feedback/retry/:responseId", async (req, res) => {
  try {
    await connectDB();

    const { responseId } = req.params;
    const force = req.query.force === "true";

    const found = await findByResponseId(responseId);
    if (!found) {
      return res.status(404).json({
        error: `No attempt found for: ${responseId}`,
        hint: "Check the attempt_id / response_id value",
      });
    }

    const { doc } = found;
    const currentStatus = String(doc.ai_feedback_meta?.status || "unknown").toLowerCase();

    if (currentStatus === "done" && !force) {
      return res.status(409).json({
        error: "AI feedback already completed",
        hint: "Add ?force=true to re-generate anyway",
        current_status: currentStatus,
      });
    }

    try {
      await retryNativeAttempt(doc);
      const fresh = await QuizAttempt.findOne({ attempt_id: doc.attempt_id })
        .select("ai_feedback_meta.status").lean();

      return res.json({
        message: "AI feedback regenerated",
        source: "native (QuizAttempt)",
        attempt_id: doc.attempt_id,
        quiz_name: doc.quiz_name,
        previous_status: currentStatus,
        new_status: fresh?.ai_feedback_meta?.status || "done",
      });
    } catch (retryErr) {
      return res.status(500).json({
        error: `Retry failed: ${retryErr.message}`,
        attempt_id: doc.attempt_id,
        previous_status: currentStatus,
      });
    }
  } catch (err) {
    console.error("❌ admin/ai-feedback/retry:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/admin/ai-feedback/retry-all
   ═══════════════════════════════════════════════════════════════ */
router.post("/ai-feedback/retry-all", async (req, res) => {
  try {
    await connectDB();

    const quizNameFilter = req.body?.quiz_name;
    const statusFilter = req.body?.status;
    const limit = Math.min(parseInt(req.body?.limit) || MAX_BULK_RETRY, MAX_BULK_RETRY);

    const retried = [];
    const errors = [];

    const nativeStatuses = statusFilter ? [statusFilter] : NATIVE_RETRIABLE;
    const query = {
      "ai_feedback_meta.status": { $in: nativeStatuses },
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quizNameFilter) query.quiz_name = { $regex: quizNameFilter, $options: "i" };

    const docs = await QuizAttempt.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    for (const doc of docs) {
      const tb = doc.topic_breakdown;
      const hasTB = tb && (tb instanceof Map ? tb.size > 0 : Object.keys(tb).length > 0);

      if (!hasTB) {
        errors.push({ attempt_id: doc.attempt_id, error: "No topic_breakdown" });
        continue;
      }

      try {
        await retryNativeAttempt(doc);
        retried.push({ attempt_id: doc.attempt_id, quiz_name: doc.quiz_name, status: "done" });
      } catch (err) {
        errors.push({ attempt_id: doc.attempt_id, error: err.message });
      }
    }

    console.log(`🔄 Admin bulk retry by ${req.admin?.email || "admin"}: ${retried.length} succeeded, ${errors.length} failed`);

    res.json({
      message: `Retried ${retried.length} attempt(s), ${errors.length} failed`,
      retried,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("❌ admin/ai-feedback/retry-all:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;