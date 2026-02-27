/**
 * routes/quizRoutes.js
 * 
 * Quiz-taking API routes for children (and parents viewing results).
 * 
 * Mount in server.js:
 *   const quizRoutes = require("./routes/quizRoutes");
 *   app.use("/api", quizRoutes);
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizAttempt = require("../models/quizAttempt");

const router = express.Router();

// All routes require authentication
router.use(verifyToken, requireAuth);

// ═══════════════════════════════════════
// GET /api/quizzes/:quizId
// Quiz metadata (no questions)
// ═══════════════════════════════════════
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Don't expose question_ids to client
    const { question_ids, ...safe } = quiz;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /api/quizzes/:quizId/start
// Start a new attempt — returns attempt_id + quiz meta
// ═══════════════════════════════════════
router.post("/quizzes/:quizId/start", async (req, res) => {
  try {
    const { childId, parentId } = req.user;
    if (!childId) return res.status(403).json({ error: "Child login required to take quizzes" });

    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // TODO: Check child entitlements (entitled_bundle_ids) against quiz_catalog
    // For now, allow all quizzes for simplicity

    // Count previous attempts for attempt_number
    const prevAttempts = await QuizAttempt.countDocuments({
      child_id: childId,
      quiz_id: quiz.quiz_id,
    });

    const attempt = await QuizAttempt.create({
      child_id: childId,
      parent_id: parentId,
      quiz_id: quiz.quiz_id,
      quiz_name: quiz.quiz_name,
      subject: quiz.subject,
      year_level: quiz.year_level,
      status: "in_progress",
      started_at: new Date(),
      attempt_number: prevAttempts + 1,
    });

    res.status(201).json({
      attempt_id: attempt.attempt_id,
      quiz: {
        quiz_id: quiz.quiz_id,
        quiz_name: quiz.quiz_name,
        subject: quiz.subject,
        year_level: quiz.year_level,
        question_count: quiz.question_count,
        time_limit_minutes: quiz.time_limit_minutes,
        total_points: quiz.total_points,
      },
    });
  } catch (err) {
    console.error("Start quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/quizzes/:quizId/questions
// Returns questions WITHOUT correct answers
// ═══════════════════════════════════════
router.get("/quizzes/:quizId/questions", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.find({ quiz_ids: quiz.quiz_id })
      .sort({ order: 1 })
      .lean();

    // CRITICAL: Strip correct answer flags before sending to client
    const safeQuestions = questions.map((q) => ({
      question_id: q.question_id,
      type: q.type,
      text: q.text,
      options: q.options.map((opt) => ({
        option_id: opt.option_id,
        text: opt.text,
        image_url: opt.image_url,
        // ⚠️ NO correct field sent to client
      })),
      points: q.points,
      categories: q.categories,
      image_url: q.image_url,
      order: q.order,
    }));

    res.json({ questions: safeQuestions, total: safeQuestions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// PATCH /api/attempts/:attemptId/autosave
// Auto-save answers (progress preservation)
// ═══════════════════════════════════════
router.patch("/attempts/:attemptId/autosave", async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.child_id) !== String(req.user.childId)) {
      return res.status(403).json({ error: "Not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Attempt already submitted" });
    }

    // Save answers without scoring
    const { answers } = req.body;
    if (Array.isArray(answers)) {
      attempt.answers = answers.map((a) => ({
        question_id: a.question_id,
        selected_option_ids: a.selected_option_ids || [],
        text_answer: a.text_answer || "",
      }));
      await attempt.save();
    }

    res.json({ message: "Auto-saved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// POST /api/attempts/:attemptId/submit
// Submit answers, score MCQs, trigger AI for writing
// ═══════════════════════════════════════
router.post("/attempts/:attemptId/submit", async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.child_id) !== String(req.user.childId)) {
      return res.status(403).json({ error: "Not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Already submitted" });
    }

    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "answers array required" });
    }

    // Fetch questions WITH correct answers (server-side only)
    const questions = await Question.find({ quiz_ids: attempt.quiz_id })
      .sort({ order: 1 })
      .lean();

    const questionMap = {};
    for (const q of questions) questionMap[q.question_id] = q;

    const isWriting = attempt.subject === "Writing";

    // ─── Score MCQ questions ───
    let totalPoints = 0;
    let totalAvailable = 0;
    const topicBreakdown = {};

    const scoredAnswers = answers.map((ans) => {
      const question = questionMap[ans.question_id];
      if (!question) {
        return { question_id: ans.question_id, selected_option_ids: [], text_answer: "", points_scored: 0, points_available: 0 };
      }

      let pointsScored = 0;
      const pointsAvailable = question.points || 1;

      if (question.type !== "free_text") {
        // Compare selected options against correct ones
        const correctIds = question.options
          .filter((o) => o.correct)
          .map((o) => o.option_id)
          .sort();
        const selectedIds = (ans.selected_option_ids || []).sort();

        const isCorrect =
          correctIds.length === selectedIds.length &&
          correctIds.every((id, i) => id === selectedIds[i]);

        pointsScored = isCorrect ? pointsAvailable : 0;
      }

      totalPoints += pointsScored;
      totalAvailable += pointsAvailable;

      // Build topic breakdown
      for (const cat of question.categories || []) {
        if (!topicBreakdown[cat.name]) topicBreakdown[cat.name] = { scored: 0, total: 0 };
        topicBreakdown[cat.name].scored += pointsScored;
        topicBreakdown[cat.name].total += pointsAvailable;
      }

      return {
        question_id: ans.question_id,
        selected_option_ids: ans.selected_option_ids || [],
        text_answer: ans.text_answer || "",
        points_scored: pointsScored,
        points_available: pointsAvailable,
      };
    });

    // ─── Calculate grade ───
    const percentage = totalAvailable > 0 ? Math.round((totalPoints / totalAvailable) * 100) : 0;
    let grade = "F";
    if (percentage >= 90) grade = "A";
    else if (percentage >= 75) grade = "B";
    else if (percentage >= 60) grade = "C";
    else if (percentage >= 50) grade = "D";

    // ─── Update attempt ───
    attempt.answers = scoredAnswers;
    attempt.submitted_at = new Date();
    attempt.duration_sec = Math.round((attempt.submitted_at - attempt.started_at) / 1000);
    attempt.status = isWriting ? "submitted" : "scored";
    attempt.topic_breakdown = topicBreakdown;

    if (!isWriting) {
      attempt.score = {
        points: totalPoints,
        available: totalAvailable,
        percentage,
        grade,
        pass: percentage >= 50,
      };
    }

    await attempt.save();

    // ─── Trigger AI feedback (non-blocking) ───
    // TODO: Call your existing Gemini feedback pipeline here
    // For MCQ: spawn the subject feedback process
    // For Writing: spawn the writing evaluator
    // This runs async — frontend will poll for completion

    console.log(`✅ Quiz submitted: attempt=${attempt.attempt_id}, score=${percentage}%, grade=${grade}`);

    res.json({
      attempt_id: attempt.attempt_id,
      is_writing: isWriting,
      ai_status: isWriting ? "pending" : "pending",
      score: attempt.score,
      topic_breakdown: Object.fromEntries(attempt.topic_breakdown),
    });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/attempts/:attemptId/result
// Get scored result with feedback
// ═══════════════════════════════════════
router.get("/attempts/:attemptId/result", async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId }).lean();
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    // Allow child or parent to view
    const isOwner = String(attempt.child_id) === String(req.user.childId);
    const isParent = String(attempt.parent_id) === String(req.user.parentId);
    if (!isOwner && !isParent) return res.status(403).json({ error: "Access denied" });

    res.json(attempt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/children/:childId/attempts
// List all attempts for a child (dashboard)
// ═══════════════════════════════════════
router.get("/children/:childId/attempts", async (req, res) => {
  try {
    const childId = req.params.childId;

    // Authorization: child can see their own, parent can see their children's
    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) return res.status(403).json({ error: "Access denied" });

    const attempts = await QuizAttempt.find({ child_id: childId })
      .sort({ submitted_at: -1 })
      .select("attempt_id quiz_id quiz_name subject year_level status score.percentage score.grade submitted_at duration_sec attempt_number")
      .lean();

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
