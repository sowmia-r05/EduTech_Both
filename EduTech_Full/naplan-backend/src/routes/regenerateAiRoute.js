/**
 * routes/regenerateAiRoute.js
 *
 * Simple endpoint to regenerate AI feedback for any quiz result.
 * Works with BOTH legacy Result and native QuizAttempt collections.
 *
 * No admin auth needed — uses the same auth as the dashboard.
 * The user just clicks a button on the dashboard and this handles the rest.
 *
 * Mount in app.js:
 *   const regenerateAiRoute = require("./routes/regenerateAiRoute");
 *   app.use("/api/results", secureLegacyResults, regenerateAiRoute);
 */

const express = require("express");
const connectDB = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");
const { runSubjectFeedbackPython } = require("../services/subjectFeedbackService");
const { triggerAiFeedback } = require("../services/aiFeedbackService");


const router = express.Router();

/**
 * POST /api/results/:responseId/regenerate-ai
 *
 * Regenerate AI feedback for a quiz result.
 * Automatically detects whether it's a legacy Result or native QuizAttempt.
 *
 * Called from the Dashboard "Generate AI Insights" button.
 */
router.post("/:responseId/regenerate-ai", async (req, res) => {
  try {
    await connectDB();

    const responseId = String(req.params.responseId || "").trim();
    if (!responseId) {
      return res.status(400).json({ error: "responseId is required" });
    }


    // ── 2. Try native QuizAttempt collection ──
    const nativeDoc = await QuizAttempt.findOne({
      attempt_id: responseId,
    }).lean();

    if (nativeDoc) {
      return await handleNativeRegeneration(nativeDoc, res);
    }

    // ── 3. Not found ──
    return res.status(404).json({ error: "Result not found" });
  } catch (err) {
    console.error("❌ regenerate-ai error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});



/**
 * Handle regeneration for native QuizAttempt documents.
 * Uses triggerAiFeedback (same as quiz submit flow).
 */
async function handleNativeRegeneration(doc, res) {
  const tb = doc.topic_breakdown;
  const hasTB =
    tb && (tb instanceof Map ? tb.size > 0 : Object.keys(tb).length > 0);

  if (!hasTB) {
    return res.status(422).json({
      error: "Cannot generate AI feedback — no topic data available for this quiz.",
      hint: "This quiz may not have been scored properly.",
    });
  }

  const isWriting = String(doc.subject || "").toLowerCase() === "writing";

  try {
    await triggerAiFeedback({
      attemptId: doc.attempt_id,
      quizId: doc.quiz_id,
      subject: doc.subject,
      isWriting,
      scoredAnswers: doc.answers || [],
      topicBreakdown: doc.topic_breakdown,
      score: doc.score,
      yearLevel: doc.year_level,
      quizName: doc.quiz_name,
      childId: doc.child_id,
      duration: doc.duration_sec,
    });

    return res.json({
      success: true,
      message: "AI feedback generated successfully",
      source: "native",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = router;
