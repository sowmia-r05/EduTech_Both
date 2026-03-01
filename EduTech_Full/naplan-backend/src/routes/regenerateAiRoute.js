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
const Result = require("../models/result");
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

    // ── 1. Try legacy Result collection first ──
    const legacyDoc = await Result.findOne({
      $or: [{ response_id: responseId }, { responseId: responseId }],
    }).lean();

    if (legacyDoc) {
      return await handleLegacyRegeneration(legacyDoc, res);
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
 * Handle regeneration for legacy Result documents.
 * Uses runSubjectFeedbackPython (same as responseSubmitted.js).
 */
async function handleLegacyRegeneration(doc, res) {
  const resultId = doc._id;

  // Check topicBreakdown exists
  const hasTB =
    doc.topicBreakdown &&
    typeof doc.topicBreakdown === "object" &&
    Object.keys(doc.topicBreakdown).length > 0;

  if (!hasTB) {
    return res.status(422).json({
      error: "Cannot generate AI feedback — no topic data available for this quiz.",
      hint: "This quiz may not have been scored properly.",
    });
  }

  // Mark as generating
  await Result.updateOne(
    { _id: resultId },
    {
      $set: {
        "ai.status": "generating",
        "ai.message": "Regenerating feedback…",
        "ai.error": null,
      },
    }
  );

  try {
    const py = await runSubjectFeedbackPython({
      doc: {
        response_id: doc.response_id,
        quiz_name: doc.quiz_name,
        score: doc.score,
        topicBreakdown: doc.topicBreakdown,
        duration: doc.duration,
      },
    });

    if (!py || py.success !== true) {
      const errMsg = py?.error || "AI did not return feedback";
      await Result.updateOne(
        { _id: resultId },
        {
          $set: {
            "ai.status": "error",
            "ai.message": errMsg,
            "ai.error": errMsg,
            "ai.evaluated_at": new Date(),
          },
        }
      );
      return res.status(500).json({ error: errMsg });
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
          "ai.message": "Feedback ready",
          "ai.error": null,
          "ai.evaluated_at": new Date(),
        },
      }
    );

    return res.json({
      success: true,
      message: "AI feedback generated successfully",
      source: "legacy",
    });
  } catch (err) {
    await Result.updateOne(
      { _id: resultId },
      {
        $set: {
          "ai.status": "error",
          "ai.message": err.message,
          "ai.error": err.message,
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return res.status(500).json({ error: err.message });
  }
}

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
