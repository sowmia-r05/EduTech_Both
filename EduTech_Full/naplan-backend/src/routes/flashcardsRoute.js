/**
 * routes/flashcardsRoute.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Provides flashcard data from completed native quiz attempts.
 * Returns each question with the child's answer, correct answer,
 * and explanation — used for study/review in the child dashboard.
 * ═══════════════════════════════════════════════════════════════
 *
 * Mount in app.js:
 *   const flashcardsRoute = require("./routes/flashcardsRoute");
 *   app.use("/api", flashcardsRoute);
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Question = require("../models/question");

const router = express.Router();

// ═══════════════════════════════════════
// GET /api/attempts/:attemptId/flashcards
// Returns question-answer pairs for flashcard generation
// Includes the child's answer, correct answer, and explanation
// ═══════════════════════════════════════
router.get("/attempts/:attemptId/flashcards", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();

    const attempt = await QuizAttempt.findOne({
      attempt_id: req.params.attemptId,
    }).lean();

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    // Auth check: only the child who took it or their parent can view
    const isOwner = String(attempt.child_id) === String(req.user.childId);
    const isParent =
      req.user.role === "parent" &&
      String(attempt.parent_id) === String(req.user.parentId);
    if (!isOwner && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Fetch the questions for this quiz (WITH correct answers)
    const questions = await Question.find({ quiz_ids: attempt.quiz_id })
      .sort({ order: 1 })
      .lean();

    // Build flashcard data by matching questions to the child's answers
    const flashcards = questions.map((q) => {
      // Find the child's answer for this question
      const answer = (attempt.answers || []).find(
        (a) => a.question_id === q.question_id
      );

      // Find the correct option(s)
      const correctOptions = (q.options || []).filter((o) => o.correct);
      const correctOptionTexts = correctOptions.map((o) => o.text);

      // Find what the child selected
      let childAnswerText = null;
      if (answer) {
        if (answer.selected_option_ids && answer.selected_option_ids.length > 0) {
          // Multiple choice — map option IDs to text
          childAnswerText = answer.selected_option_ids
            .map((optId) => {
              const opt = (q.options || []).find((o) => o.option_id === optId);
              return opt ? opt.text : optId;
            })
            .join(", ");
        } else if (answer.text) {
          // Free text answer
          childAnswerText = answer.text;
        }
      }

      return {
        question_id: q.question_id,
        question_text: q.text,
        question_type: q.type,
        image_url: q.image_url || "",
        options: (q.options || []).map((o) => ({
          option_id: o.option_id,
          text: o.text,
          image_url: o.image_url || "",
          is_correct: o.correct || false,
        })),
        child_answer_text: childAnswerText,
        child_answer_option_ids: answer?.selected_option_ids || [],
        correct_answer_text: correctOptionTexts.join(", "),
        is_correct: answer?.is_correct || false,
        category: q.categories || [],
        explanation: q.explanation || "",
        points: q.points || 1,
        points_earned: answer?.points_earned || 0,
      };
    });

    // Also return summary stats
    const totalCorrect = flashcards.filter((f) => f.is_correct).length;
    const totalWrong = flashcards.filter((f) => !f.is_correct).length;

    res.json({
      attempt_id: attempt.attempt_id,
      quiz_name: attempt.quiz_name,
      subject: attempt.subject,
      year_level: attempt.year_level,
      total_questions: flashcards.length,
      total_correct: totalCorrect,
      total_wrong: totalWrong,
      flashcards,
      // Convenience: wrong-only for focused review
      wrong_only: flashcards.filter((f) => !f.is_correct),
    });
  } catch (err) {
    console.error("Flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/children/:childId/flashcards
// Returns flashcards from ALL completed attempts (wrong answers only)
// Great for a "Review Mistakes" feature on the dashboard
// ═══════════════════════════════════════
router.get("/children/:childId/flashcards", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();

    const childId = req.params.childId;
    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Optional query params
    const subject = req.query.subject; // filter by subject
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // max 50

    // Find recent completed attempts
    const attemptFilter = {
      child_id: childId,
      status: { $in: ["scored", "ai_done"] },
    };
    if (subject) attemptFilter.subject = subject;

    const attempts = await QuizAttempt.find(attemptFilter)
      .sort({ submitted_at: -1 })
      .limit(10) // last 10 attempts
      .lean();

    if (attempts.length === 0) {
      return res.json({ flashcards: [], total: 0 });
    }

    // Gather all quiz IDs from these attempts
    const quizIds = [...new Set(attempts.map((a) => a.quiz_id))];

    // Fetch all questions for these quizzes
    const questions = await Question.find({ quiz_ids: { $in: quizIds } }).lean();
    const questionMap = new Map(questions.map((q) => [q.question_id, q]));

    // Build wrong-answer flashcards across all attempts
    const allFlashcards = [];

    for (const attempt of attempts) {
      for (const answer of attempt.answers || []) {
        if (answer.is_correct) continue; // skip correct answers

        const q = questionMap.get(answer.question_id);
        if (!q) continue;

        const correctOptions = (q.options || []).filter((o) => o.correct);

        let childAnswerText = null;
        if (answer.selected_option_ids?.length > 0) {
          childAnswerText = answer.selected_option_ids
            .map((optId) => {
              const opt = (q.options || []).find((o) => o.option_id === optId);
              return opt ? opt.text : optId;
            })
            .join(", ");
        } else if (answer.text) {
          childAnswerText = answer.text;
        }

        allFlashcards.push({
          question_id: q.question_id,
          question_text: q.text,
          question_type: q.type,
          options: (q.options || []).map((o) => ({
            option_id: o.option_id,
            text: o.text,
            is_correct: o.correct || false,
          })),
          child_answer_text: childAnswerText,
          correct_answer_text: correctOptions.map((o) => o.text).join(", "),
          category: q.categories || [],
          explanation: q.explanation || "",
          quiz_name: attempt.quiz_name,
          subject: attempt.subject,
          attempt_date: attempt.submitted_at,
        });
      }
    }

    // Deduplicate by question_id (keep most recent occurrence)
    const seen = new Set();
    const deduped = [];
    for (const card of allFlashcards) {
      if (!seen.has(card.question_id)) {
        seen.add(card.question_id);
        deduped.push(card);
      }
    }

    // Apply limit
    const limited = deduped.slice(0, limit);

    res.json({
      flashcards: limited,
      total: deduped.length,
    });
  } catch (err) {
    console.error("Child flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
