/**
 * quizAiRoutes.js
 *
 * Admin AI generation routes — NOW WITH SELECTIVE GENERATION.
 *
 *   POST /api/admin/quizzes/:quizId/generate-explanations
 *     Body (optional): { question_ids: ["q1", "q2", ...] }
 *     → If question_ids provided, generates only for those.
 *     → If omitted, generates for all questions.
 *
 *   POST /api/admin/quizzes/:quizId/generate-subtopics
 *     Body (optional): { question_ids: ["q1", "q2", ...] }
 *     → Same behavior as above.
 *
 *   GET  /api/admin/quizzes/:quizId/generate-explanations/status
 *   GET  /api/admin/quizzes/:quizId/generate-subtopics/status
 *
 * Mount in app.js:
 *   const quizAiRoutes = require("./routes/quizAiRoutes");
 *   app.use("/api/admin", quizAiRoutes);
 *
 * ⚠️ ROUTE COLLISION: adminRoutes.js ALSO defines
 *    POST/GET /quizzes/:quizId/generate-explanations on /api/admin, and
 *    quizExplanationsRoute.js defines a THIRD (Python) version. Only the first
 *    one mounted actually serves. Pick ONE and delete the duplicates.
 *
 * PROGRESS IS MONGO-BACKED (v2): explanation progress is read via
 * getExplanationProgress() so it works across >= 2 instances. Sub-topic
 * progress still uses the in-memory subtopic_progress — generateQuizSubTopics.js
 * needs the same migration.
 */

const express = require("express");
const router = express.Router();
const connectDB = require("../config/db");
const Question = require("../models/question");
const { requireAdmin } = require("../middleware/adminAuth");
const {
  generateQuizExplanations,
  getExplanationProgress,
} = require("../utils/generateQuizExplanations");
const {
  generateQuizSubTopics,
  subtopic_progress,
} = require("../utils/generateQuizSubTopics");

// ─── Helper: validate and normalize question_ids from request body ───
function extractQuestionIds(body) {
  if (!body || !Array.isArray(body.question_ids)) return null;
  const cleaned = body.question_ids
    .filter((id) => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  return cleaned.length > 0 ? cleaned : null;
}

// ═══════════════════════════════════════════════════════════════
// EXPLANATIONS
// ═══════════════════════════════════════════════════════════════

router.post(
  "/quizzes/:quizId/generate-explanations",
  requireAdmin,
  async (req, res) => {
    try {
      await connectDB();
      const { quizId } = req.params;
      const questionIds = extractQuestionIds(req.body);

      // Prevent double-runs (cross-instance via Mongo-backed progress)
      const existing = await getExplanationProgress(quizId);
      if (existing?.status === "running") {
        return res.json({
          success: true,
          message: "Already running",
          ...existing,
        });
      }

      // Sanity check that questions exist (respecting the scope)
      const filter = questionIds
        ? { quiz_ids: quizId, question_id: { $in: questionIds } }
        : { $or: [{ quiz_ids: quizId }, { quiz_id: quizId }] };
      const count = await Question.countDocuments(filter);

      if (count === 0) {
        return res.status(404).json({
          error: questionIds
            ? "No matching questions found for the provided IDs"
            : "No questions found for this quiz",
        });
      }

      // Fire in background
      generateQuizExplanations(quizId, { questionIds }).catch((err) =>
        console.error("❌ generateQuizExplanations error:", err)
      );

      return res.json({
        success: true,
        message: `Explanation generation started${questionIds ? ` for ${questionIds.length} selected` : " for all questions"}`,
        total: count,
        scope: questionIds ? "selected" : "all",
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  "/quizzes/:quizId/generate-explanations/status",
  requireAdmin,
  async (req, res) => {
    const progress = await getExplanationProgress(req.params.quizId);
    // getExplanationProgress already returns { status: "idle" } when absent.
    return res.json(progress);
  }
);

// ═══════════════════════════════════════════════════════════════
// SUB-TOPICS
// ═══════════════════════════════════════════════════════════════

router.post(
  "/quizzes/:quizId/generate-subtopics",
  requireAdmin,
  async (req, res) => {
    try {
      await connectDB();
      const { quizId } = req.params;
      const questionIds = extractQuestionIds(req.body);

      const existing = subtopic_progress[quizId];
      if (existing?.status === "running") {
        return res.json({
          success: true,
          message: "Already running",
          ...existing,
        });
      }

      const filter = questionIds
        ? { quiz_ids: quizId, question_id: { $in: questionIds } }
        : { $or: [{ quiz_ids: quizId }, { quiz_id: quizId }] };
      const count = await Question.countDocuments(filter);

      if (count === 0) {
        return res.status(404).json({
          error: questionIds
            ? "No matching questions found for the provided IDs"
            : "No questions found for this quiz",
        });
      }

      generateQuizSubTopics(quizId, { questionIds }).catch((err) =>
        console.error("❌ generateQuizSubTopics error:", err)
      );

      return res.json({
        success: true,
        message: `Sub-topic generation started${questionIds ? ` for ${questionIds.length} selected` : " for all questions"}`,
        total: count,
        scope: questionIds ? "selected" : "all",
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  "/quizzes/:quizId/generate-subtopics/status",
  requireAdmin,
  (req, res) => {
    const progress = subtopic_progress[req.params.quizId];
    if (!progress) return res.json({ status: "idle" });
    return res.json(progress);
  }
);

module.exports = router;