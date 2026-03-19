/**
 * routes/flashcardsRoute.js
 *
 * SECURITY FIXES APPLIED:
 *   ✅ FIX-1: GET /children/:childId/flashcards — added subscription gate.
 *             Trial children were able to access flashcards (paid feature) freely.
 *             Now returns 403 TRIAL_LIMIT if child.status !== "active".
 *   ✅ FIX-2: GET /children/:childId/flashcards — added parent ownership check.
 *             Previously only checked req.user.role === "parent" but didn't
 *             verify the child actually belongs to that parent.
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB   = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Question    = require("../models/question");
const Child       = require("../models/child");

const router = express.Router();

// ═══════════════════════════════════════
// GET /api/attempts/:attemptId/flashcards
// Returns question-answer pairs for a single attempt
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
    const isOwner  = String(attempt.child_id) === String(req.user.childId);
    const isParent =
      req.user.role === "parent" &&
      String(attempt.parent_id) === String(req.user.parentId || req.user.parent_id);

    if (!isOwner && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    const questions = await Question.find({ quiz_ids: attempt.quiz_id })
      .sort({ order: 1 })
      .lean();

    const flashcards = questions.map((q) => {
      const answer = (attempt.answers || []).find(
        (a) => a.question_id === q.question_id
      );

      const correctOptions     = (q.options || []).filter((o) => o.correct);
      const correctOptionTexts = correctOptions.map((o) => o.text);

      let childAnswerText = null;
      if (answer) {
        if (answer.selected_option_ids && answer.selected_option_ids.length > 0) {
          childAnswerText = answer.selected_option_ids
            .map((optId) => {
              const opt = (q.options || []).find((o) => o.option_id === optId);
              return opt ? opt.text : optId;
            })
            .join(", ");
        } else if (answer.free_text) {
          childAnswerText = answer.free_text;
        }
      }

     return {
        question_id:       q.question_id,
        question_text:     q.question_text || q.text || "",
        passage:           q.passage || null,
        correct_answers:   correctOptionTexts,
        child_answer:      childAnswerText,
        is_correct:        answer?.is_correct ?? false,
        explanation:       q.explanation || null,
        difficulty:        q.difficulty || null,
        topic:             q.topic || q.strand || null,
        image_url:         q.image_url || null,        // ✅ ADD
        image_width:       q.image_width || null,      // ✅ ADD
        image_height:      q.image_height || null,     // ✅ ADD
        type:              q.type || null,              // ✅ ADD
        options:           (q.options || []).map((o) => ({  // ✅ ADD (for picture_choice)
          option_id: o.option_id,
          text:      o.text,
          image_url: o.image_url || null,
          correct:   o.correct,
        })),
      };
    });

    const totalCorrect = flashcards.filter((f) => f.is_correct).length;
    const totalWrong   = flashcards.length - totalCorrect;

    return res.json({
      attempt_id:      attempt.attempt_id,
      quiz_name:       attempt.quiz_name,
      subject:         attempt.subject,
      year_level:      attempt.year_level,
      total_questions: flashcards.length,
      total_correct:   totalCorrect,
      total_wrong:     totalWrong,
      flashcards,
      wrong_only: flashcards.filter((f) => !f.is_correct),
    });
  } catch (err) {
    console.error("GET /api/attempts/:attemptId/flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/children/:childId/flashcards
// Returns wrong-answer flashcards from ALL completed attempts
//
// ✅ FIX-1: Subscription gate — trial children cannot access flashcards
// ✅ FIX-2: Parent ownership check — parent must own this child
// ═══════════════════════════════════════
router.get("/children/:childId/flashcards", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();

    const { childId } = req.params;

    // ── Auth check ───────────────────────────────────────────────────────────
    const isChild  = req.user.role === "child"  && String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";

    if (!isChild && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ── Fetch child — needed for ownership + subscription gate ───────────────
    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // ✅ FIX-2: Parent ownership check
    if (isParent) {
      const parentId = req.user.parentId || req.user.parent_id;
      if (String(child.parent_id) !== String(parentId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // ✅ FIX-1: Subscription gate — same pattern as cumulativeFeedbackRoutes.js
    if (child.status !== "active") {
      return res.status(403).json({
        error:   "Upgrade required",
        code:    "TRIAL_LIMIT",
        message: "Flashcard review is only available with a full access subscription.",
      });
    }

    // ── Query ────────────────────────────────────────────────────────────────
    const subject = req.query.subject;
    const limit   = Math.min(parseInt(req.query.limit) || 20, 50);

    const attemptFilter = {
      child_id: childId,
      status: { $in: ["scored", "ai_done"] },
    };
    if (subject) attemptFilter.subject = subject;

    const attempts = await QuizAttempt.find(attemptFilter)
      .sort({ submitted_at: -1 })
      .limit(10)
      .lean();

    if (attempts.length === 0) {
      return res.json({ flashcards: [], total: 0 });
    }

    const quizIds   = [...new Set(attempts.map((a) => a.quiz_id))];
    const questions = await Question.find({ quiz_ids: { $in: quizIds } }).lean();
    const questionMap = new Map(questions.map((q) => [q.question_id, q]));

    const allFlashcards = [];

    for (const attempt of attempts) {
      for (const answer of attempt.answers || []) {
        if (answer.is_correct) continue;

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
        }

       allFlashcards.push({
          question_id:    q.question_id,
          question_text:  q.question_text || q.text || "",
          passage:        q.passage || null,
          correct_answers: correctOptions.map((o) => o.text),
          child_answer:   childAnswerText,
          is_correct:     false,
          explanation:    q.explanation || null,
          topic:          q.topic || q.strand || null,
          subject:        attempt.subject,
          quiz_name:      attempt.quiz_name,
          attempt_id:     attempt.attempt_id,
          image_url:      q.image_url || null,        // ✅ ADD
          image_width:    q.image_width || null,      // ✅ ADD
          image_height:   q.image_height || null,     // ✅ ADD
          type:           q.type || null,             // ✅ ADD
          options:        (q.options || []).map((o) => ({  // ✅ ADD
            option_id: o.option_id,
            text:      o.text,
            image_url: o.image_url || null,
            correct:   o.correct,
          })),
        });
        if (allFlashcards.length >= limit) break;
      }
      if (allFlashcards.length >= limit) break;
    }

    return res.json({ flashcards: allFlashcards, total: allFlashcards.length });
  } catch (err) {
    console.error("GET /api/children/:childId/flashcards error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
