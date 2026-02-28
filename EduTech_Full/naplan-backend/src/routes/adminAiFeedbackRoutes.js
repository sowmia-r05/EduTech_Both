/**
 * routes/adminAiFeedbackRoutes.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Admin endpoints to diagnose and re-trigger AI feedback for
 * quiz results that failed or got stuck.
 *
 * Supports BOTH:
 *   - Legacy Result collection (FlexiQuiz era) — uses runSubjectFeedbackPython
 *   - Native QuizAttempt collection — uses triggerAiFeedback
 *
 * Auth: requireAdmin (admin JWT from /api/admin/login)
 *
 * Endpoints:
 *   GET  /api/admin/ai-feedback/status/:responseId — Check AI status for a specific result
 *   GET  /api/admin/ai-feedback/failed              — List all failed/stuck attempts
 *   POST /api/admin/ai-feedback/retry/:responseId   — Re-trigger by response_id (works for BOTH collections)
 *   POST /api/admin/ai-feedback/retry-all           — Re-trigger ALL failed (bulk)
 *
 * Mount in app.js:
 *   const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");
 *   app.use("/api/admin", adminAiFeedbackRoutes);
 * ═══════════════════════════════════════════════════════════════
 */

const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const connectDB = require("../config/db");
const Result = require("../models/result");
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");

// AI feedback services
const { triggerAiFeedback } = require("../services/aiFeedbackService");
const { runSubjectFeedbackPython } = require("../services/subjectFeedbackService");

const router = express.Router();

// All routes require admin auth
router.use(requireAdmin);

// ─── Retriable statuses ───
const LEGACY_RETRIABLE = ["queued", "fetching", "generating", "error"];
const NATIVE_RETRIABLE = ["error", "pending", "queued", "generating"];
const MAX_BULK_RETRY = 50;

/* ═══════════════════════════════════════════════════════════════
   HELPER: Find a result in EITHER collection by response_id
   Returns { source: "legacy"|"native", doc }  or  null
   ═══════════════════════════════════════════════════════════════ */
async function findByResponseId(responseId) {
  // 1. Try legacy Result collection
  const legacyDoc = await Result.findOne({
    $or: [{ response_id: responseId }, { responseId: responseId }],
  }).lean();

  if (legacyDoc) {
    return { source: "legacy", doc: legacyDoc };
  }

  // 2. Try native QuizAttempt collection
  const nativeDoc = await QuizAttempt.findOne({
    attempt_id: responseId,
  }).lean();

  if (nativeDoc) {
    return { source: "native", doc: nativeDoc };
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: Re-generate feedback for a legacy Result doc
   Mirrors the logic in responseSubmitted.js generateSubjectFeedbackWithRetry
   ═══════════════════════════════════════════════════════════════ */
async function retryLegacyResult(resultDoc) {
  const resultId = resultDoc._id;

  // Check topicBreakdown
  const hasTB =
    resultDoc.topicBreakdown &&
    typeof resultDoc.topicBreakdown === "object" &&
    Object.keys(resultDoc.topicBreakdown).length > 0;

  if (!hasTB) {
    throw new Error("topic_breakdown is empty — cannot generate feedback");
  }

  // Mark as generating
  await Result.updateOne(
    { _id: resultId },
    {
      $set: {
        "ai.status": "generating",
        "ai.message": "Re-generating feedback (admin retry)…",
        "ai.error": null,
      },
    }
  );

  // Call the Python Gemini feedback script
  const py = await runSubjectFeedbackPython({
    doc: {
      response_id: resultDoc.response_id,
      quiz_name: resultDoc.quiz_name,
      score: resultDoc.score,
      topicBreakdown: resultDoc.topicBreakdown,
      duration: resultDoc.duration,
    },
  });

  if (!py || py.success !== true) {
    const errMsg = py?.error || "AI did not return feedback";
    await Result.updateOne(
      { _id: resultId },
      {
        $set: {
          "ai.status": "error",
          "ai.message": "AI generation failed (admin retry)",
          "ai.error": errMsg,
          "ai.evaluated_at": new Date(),
        },
      }
    );
    throw new Error(errMsg);
  }

  // Save successful feedback
  const generatedAt = py?.ai_feedback_meta?.generated_at
    ? new Date(py.ai_feedback_meta.generated_at)
    : new Date();

  await Result.updateOne(
    { _id: resultId },
    {
      $set: {
        performance_analysis: py.performance_analysis || {},
        ai_feedback: py.ai_feedback || {},
        ai_feedback_meta: {
          ...(py.ai_feedback_meta || {}),
          generated_at: generatedAt,
        },
        "ai.status": "done",
        "ai.message": "Feedback ready (admin retry)",
        "ai.error": null,
        "ai.evaluated_at": new Date(),
      },
    }
  );

  return py;
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: Re-generate feedback for a native QuizAttempt doc
   Uses the existing triggerAiFeedback service
   ═══════════════════════════════════════════════════════════════ */
async function retryNativeAttempt(attemptDoc) {
  // Check topic_breakdown
  const tb = attemptDoc.topic_breakdown;
  const hasTB =
    tb &&
    (tb instanceof Map ? tb.size > 0 : Object.keys(tb).length > 0);

  if (!hasTB) {
    throw new Error("topic_breakdown is empty — cannot generate feedback");
  }

  const isWriting = String(attemptDoc.subject || "").toLowerCase() === "writing";

  const feedbackParams = {
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
  };

  // Runs synchronously so admin gets immediate result
  await triggerAiFeedback(feedbackParams);
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/admin/ai-feedback/status/:responseId
   Quick status check for a specific result (either collection)
   ═══════════════════════════════════════════════════════════════ */
router.get("/ai-feedback/status/:responseId", async (req, res) => {
  try {
    await connectDB();
    const { responseId } = req.params;

    const found = await findByResponseId(responseId);
    if (!found) {
      return res.status(404).json({ error: `No result found for response_id: ${responseId}` });
    }

    const { source, doc } = found;

    if (source === "legacy") {
      const fb = doc.ai_feedback || {};
      const hasFeedback =
        (fb.overall_feedback && String(fb.overall_feedback).trim().length > 0) ||
        (Array.isArray(fb.strengths) && fb.strengths.length > 0) ||
        (Array.isArray(fb.weaknesses) && fb.weaknesses.length > 0) ||
        (Array.isArray(fb.coach) && fb.coach.length > 0);

      return res.json({
        source: "legacy (Result)",
        response_id: doc.response_id,
        quiz_name: doc.quiz_name,
        score_pct: doc.score?.percentage || 0,
        ai_status: doc.ai?.status || "unknown",
        ai_message: doc.ai?.message || "",
        ai_error: doc.ai?.error || null,
        has_feedback: hasFeedback,
        has_topic_breakdown: !!(doc.topicBreakdown && Object.keys(doc.topicBreakdown).length > 0),
        topic_count: doc.topicBreakdown ? Object.keys(doc.topicBreakdown).length : 0,
        feedback_fields: {
          overall_feedback: !!fb.overall_feedback,
          strengths: (fb.strengths || []).length,
          weaknesses: (fb.weaknesses || []).length,
          coach: (fb.coach || []).length,
          study_tips: (fb.study_tips || []).length,
          topic_wise_tips: (fb.topic_wise_tips || []).length,
        },
      });
    }

    // native
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
   List all attempts with failed/stuck AI feedback (both collections)

   Query params:
     ?limit=25         (default 25, max 100)
     ?source=legacy    (filter: "legacy", "native", or omit for both)
     ?quiz_name=Set2   (substring filter)
     ?status=error     (specific status filter)
   ═══════════════════════════════════════════════════════════════ */
router.get("/ai-feedback/failed", async (req, res) => {
  try {
    await connectDB();

    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const sourceFilter = req.query.source || "both";
    const quizNameFilter = req.query.quiz_name;
    const statusFilter = req.query.status;

    const results = [];

    // ── Legacy Results ──
    if (sourceFilter === "both" || sourceFilter === "legacy") {
      const legacyStatuses = statusFilter ? [statusFilter] : LEGACY_RETRIABLE;
      const legacyQuery = { "ai.status": { $in: legacyStatuses } };
      if (quizNameFilter) {
        legacyQuery.quiz_name = { $regex: quizNameFilter, $options: "i" };
      }

      const legacyDocs = await Result.find(legacyQuery)
        .sort({ date_submitted: -1, createdAt: -1 })
        .limit(limit)
        .select("response_id quiz_name score.percentage duration ai.status ai.message ai.error user.user_name topicBreakdown date_submitted createdAt")
        .lean();

      for (const d of legacyDocs) {
        results.push({
          source: "legacy",
          response_id: d.response_id,
          quiz_name: d.quiz_name,
          username: d.user?.user_name || "",
          score_pct: d.score?.percentage || 0,
          ai_status: d.ai?.status || "unknown",
          ai_message: d.ai?.message || "",
          ai_error: d.ai?.error || null,
          has_topic_breakdown: !!(d.topicBreakdown && Object.keys(d.topicBreakdown).length > 0),
          date: d.date_submitted || d.createdAt,
        });
      }
    }

    // ── Native QuizAttempts ──
    if (sourceFilter === "both" || sourceFilter === "native") {
      const nativeStatuses = statusFilter ? [statusFilter] : NATIVE_RETRIABLE;
      const nativeQuery = {
        "ai_feedback_meta.status": { $in: nativeStatuses },
        status: { $in: ["scored", "ai_done", "submitted"] },
      };
      if (quizNameFilter) {
        nativeQuery.quiz_name = { $regex: quizNameFilter, $options: "i" };
      }

      const nativeDocs = await QuizAttempt.find(nativeQuery)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("attempt_id quiz_name child_id subject score.percentage duration_sec ai_feedback_meta topic_breakdown createdAt submitted_at")
        .lean();

      for (const d of nativeDocs) {
        results.push({
          source: "native",
          response_id: d.attempt_id,
          quiz_name: d.quiz_name,
          child_id: d.child_id,
          subject: d.subject,
          score_pct: d.score?.percentage || 0,
          ai_status: d.ai_feedback_meta?.status || "unknown",
          ai_message: d.ai_feedback_meta?.status_message || "",
          has_topic_breakdown: !!(d.topic_breakdown && Object.keys(d.topic_breakdown).length > 0),
          date: d.submitted_at || d.createdAt,
        });
      }
    }

    // Sort combined results by date
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Summary
    const summary = { total: results.length, by_status: {}, by_source: {} };
    for (const r of results) {
      summary.by_status[r.ai_status] = (summary.by_status[r.ai_status] || 0) + 1;
      summary.by_source[r.source] = (summary.by_source[r.source] || 0) + 1;
    }

    res.json({ summary, results: results.slice(0, limit) });
  } catch (err) {
    console.error("❌ admin/ai-feedback/failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/admin/ai-feedback/retry/:responseId
   Re-trigger AI feedback for a single result.
   Works for BOTH legacy Result and native QuizAttempt.

   Use the response_id from your dashboard URL:
     POST /api/admin/ai-feedback/retry/e467b8d9-c4d9-41b0-ad8f-883b4abfac36

   Query params:
     ?force=true  — re-generate even if already "done"
   ═══════════════════════════════════════════════════════════════ */
router.post("/ai-feedback/retry/:responseId", async (req, res) => {
  try {
    await connectDB();

    const { responseId } = req.params;
    const force = req.query.force === "true";

    const found = await findByResponseId(responseId);
    if (!found) {
      return res.status(404).json({
        error: `No result found for response_id: ${responseId}`,
        hint: "Check the response_id in your dashboard URL (?r=...)",
      });
    }

    const { source, doc } = found;

    // Determine current status
    const currentStatus = source === "legacy"
      ? String(doc.ai?.status || "unknown").toLowerCase()
      : String(doc.ai_feedback_meta?.status || "unknown").toLowerCase();

    // Safety: don't re-trigger if already done (unless forced)
    if (currentStatus === "done" && !force) {
      return res.status(409).json({
        error: "AI feedback already completed",
        hint: "Add ?force=true to re-generate anyway",
        source,
        current_status: currentStatus,
      });
    }

    console.log(
      `🔄 Admin retry: ${source} result ${responseId} (was: ${currentStatus}, force: ${force}) by ${req.admin?.email || "admin"}`
    );

    if (source === "legacy") {
      // Legacy: run synchronously so admin gets immediate feedback
      try {
        await retryLegacyResult(doc);
        return res.json({
          message: "AI feedback regenerated successfully",
          source: "legacy (Result)",
          response_id: doc.response_id,
          quiz_name: doc.quiz_name,
          previous_status: currentStatus,
          new_status: "done",
        });
      } catch (retryErr) {
        return res.status(500).json({
          error: `Retry failed: ${retryErr.message}`,
          source: "legacy (Result)",
          response_id: doc.response_id,
          previous_status: currentStatus,
          new_status: "error",
        });
      }
    }

    // Native: also run synchronously for immediate feedback
    try {
      await retryNativeAttempt(doc);

      // Fetch fresh status
      const fresh = await QuizAttempt.findOne({ attempt_id: doc.attempt_id })
        .select("ai_feedback_meta.status")
        .lean();

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
        source: "native (QuizAttempt)",
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
   Re-trigger ALL failed/stuck results (both collections).

   Body (optional):
     { "source": "legacy",  "quiz_name": "Set2", "limit": 10 }
     { "source": "native",  "status": "error" }
     { }  ← retries everything that's failed, up to 50
   ═══════════════════════════════════════════════════════════════ */
router.post("/ai-feedback/retry-all", async (req, res) => {
  try {
    await connectDB();

    const sourceFilter = req.body?.source || "both";
    const quizNameFilter = req.body?.quiz_name;
    const statusFilter = req.body?.status;
    const limit = Math.min(parseInt(req.body?.limit) || MAX_BULK_RETRY, MAX_BULK_RETRY);

    const retried = [];
    const errors = [];

    // ── Legacy Results ──
    if (sourceFilter === "both" || sourceFilter === "legacy") {
      const legacyStatuses = statusFilter ? [statusFilter] : LEGACY_RETRIABLE;
      const query = { "ai.status": { $in: legacyStatuses } };
      if (quizNameFilter) query.quiz_name = { $regex: quizNameFilter, $options: "i" };

      const legacyDocs = await Result.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      for (const doc of legacyDocs) {
        const hasTB = doc.topicBreakdown && Object.keys(doc.topicBreakdown).length > 0;
        if (!hasTB) {
          errors.push({
            response_id: doc.response_id,
            source: "legacy",
            error: "No topic_breakdown",
          });
          continue;
        }

        try {
          await retryLegacyResult(doc);
          retried.push({
            response_id: doc.response_id,
            source: "legacy",
            quiz_name: doc.quiz_name,
            status: "done",
          });
        } catch (err) {
          errors.push({
            response_id: doc.response_id,
            source: "legacy",
            error: err.message,
          });
        }
      }
    }

    // ── Native QuizAttempts ──
    if (sourceFilter === "both" || sourceFilter === "native") {
      const nativeStatuses = statusFilter ? [statusFilter] : NATIVE_RETRIABLE;
      const query = {
        "ai_feedback_meta.status": { $in: nativeStatuses },
        status: { $in: ["scored", "ai_done", "submitted"] },
      };
      if (quizNameFilter) query.quiz_name = { $regex: quizNameFilter, $options: "i" };

      const nativeDocs = await QuizAttempt.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.max(1, limit - retried.length))
        .lean();

      for (const doc of nativeDocs) {
        const tb = doc.topic_breakdown;
        const hasTB = tb && (tb instanceof Map ? tb.size > 0 : Object.keys(tb).length > 0);
        if (!hasTB) {
          errors.push({
            response_id: doc.attempt_id,
            source: "native",
            error: "No topic_breakdown",
          });
          continue;
        }

        try {
          await retryNativeAttempt(doc);
          retried.push({
            response_id: doc.attempt_id,
            source: "native",
            quiz_name: doc.quiz_name,
            status: "done",
          });
        } catch (err) {
          errors.push({
            response_id: doc.attempt_id,
            source: "native",
            error: err.message,
          });
        }
      }
    }

    console.log(
      `🔄 Admin bulk retry by ${req.admin?.email || "admin"}: ${retried.length} succeeded, ${errors.length} failed`
    );

    res.json({
      message: `Retried ${retried.length} result(s), ${errors.length} failed`,
      retried,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("❌ admin/ai-feedback/retry-all:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
