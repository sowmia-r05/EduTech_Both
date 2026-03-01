/**
 * routes/quizRoutes.js  (v3 — ALL GAPS FILLED + RANDOMIZE + MEDIA)
 *
 * Quiz-taking API routes for children (and parents viewing results).
 *
 * CHANGES FROM v1:
 *   ✅ Gap 1: Entitlement check on /start (trial + paid quiz validation)
 *   ✅ Gap 2: AI feedback trigger wired to existing Gemini pipeline
 *   ✅ Gap 3: connectDB() added to ensure MongoDB connection
 *   ✅ Gap 4: Writing quiz status transitions (submitted → scored → ai_done)
 *   ✅ Gap 5: Max attempts enforcement (configurable per quiz, default 5)
 *   ✅ Gap 6: Server-side timer with expires_at enforcement
 *   ✅ Gap 7: Resume quiz flow (GET /api/quizzes/:quizId/resume + GET /api/children/:childId/in-progress)
 *   ✅ NEW: Randomize questions and options (Fisher-Yates shuffle)
 *   ✅ NEW: Voice/video media URLs returned with questions
 *   ✅ FIX: Closed missing try-catch block on GET /questions route
 *
 * Mount in app.js:
 *   const quizRoutes = require("./routes/quizRoutes");
 *   app.use("/api", quizRoutes);
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db"); // ✅ Gap 3
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");
const { triggerAiFeedback } = require("../services/aiFeedbackService"); // ✅ Gap 2

const router = express.Router();

// ─── Constants ───
const MAX_ATTEMPTS_DEFAULT = 5; // ✅ Gap 5: default max attempts per quiz
const TIMER_GRACE_PERIOD_SEC = 60; // 1 minute grace for network latency

// All routes require authentication
router.use(verifyToken, requireAuth);

// ═══════════════════════════════════════
// GET /api/quizzes/:quizId
// Quiz metadata (no questions)
// ═══════════════════════════════════════
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB(); // ✅ Gap 3
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

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
    await connectDB(); // ✅ Gap 3

    const { childId, parentId } = req.user;
    if (!childId) return res.status(403).json({ error: "Child login required to take quizzes" });

    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // ═══════════════════════════════════════
    // ✅ Gap 1: ENTITLEMENT CHECK
    // Validates child has access to this quiz
    // ═══════════════════════════════════════
    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child profile not found" });

    const isTrialQuiz = quiz.is_trial === true;
    const childEntitledQuizIds = child.entitled_quiz_ids || [];
    const childEntitledBundleIds = child.entitled_bundle_ids || [];

    if (!isTrialQuiz) {
      // For paid quizzes, check if child has this quiz in their entitlements
      // We check both the native quiz_id AND the quiz catalog bundle approach
      const hasDirectEntitlement = childEntitledQuizIds.includes(quiz.quiz_id);

      if (!hasDirectEntitlement) {
        // Also check if child's status is "active" (they purchased something)
        // and the quiz matches their year level (basic access check)
        const hasActiveStatus = child.status === "active";
        const matchesYearLevel = quiz.year_level === child.year_level;

        if (!(hasActiveStatus && matchesYearLevel)) {
          return res.status(403).json({
            error: "You don't have access to this quiz. Ask your parent to purchase a bundle.",
            code: "NOT_ENTITLED",
          });
        }
      }
    }
    // Trial quizzes are always accessible — no check needed

    // ═══════════════════════════════════════
    // ✅ Gap 5: MAX ATTEMPTS CHECK
    // ═══════════════════════════════════════
    const maxAttempts = quiz.max_attempts || MAX_ATTEMPTS_DEFAULT;
    const completedAttempts = await QuizAttempt.countDocuments({
      child_id: childId,
      quiz_id: quiz.quiz_id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    });

    if (completedAttempts >= maxAttempts) {
      return res.status(403).json({
        error: `Maximum attempts reached (${maxAttempts}). You've completed this quiz ${completedAttempts} time(s).`,
        code: "MAX_ATTEMPTS_REACHED",
        completed: completedAttempts,
        max: maxAttempts,
      });
    }

    // ═══════════════════════════════════════
    // ✅ Gap 7: CHECK FOR EXISTING IN-PROGRESS ATTEMPT
    // If child already has an in_progress attempt, return that instead
    // ═══════════════════════════════════════
    const existingAttempt = await QuizAttempt.findOne({
      child_id: childId,
      quiz_id: quiz.quiz_id,
      status: "in_progress",
    }).lean();

    if (existingAttempt) {
      // Check if the existing attempt has expired server-side
      if (existingAttempt.expires_at && new Date() > new Date(existingAttempt.expires_at)) {
        // Auto-expire the stale attempt
        await QuizAttempt.updateOne(
          { _id: existingAttempt._id },
          {
            $set: {
              status: "expired",
              submitted_at: new Date(),
              duration_sec: Math.round((Date.now() - new Date(existingAttempt.started_at).getTime()) / 1000),
            },
          }
        );
        // Fall through to create a new attempt
      } else {
        // Return the existing attempt for resuming
        return res.status(200).json({
          attempt_id: existingAttempt.attempt_id,
          resumed: true,
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
      }
    }

    // Count ALL previous attempts (including expired) for attempt_number
    const prevAttempts = await QuizAttempt.countDocuments({
      child_id: childId,
      quiz_id: quiz.quiz_id,
    });

    // ═══════════════════════════════════════
    // ✅ Gap 6: SERVER-SIDE TIMER (expires_at)
    // ═══════════════════════════════════════
    const now = new Date();
    let expiresAt = null;
    if (quiz.time_limit_minutes) {
      const totalSeconds = quiz.time_limit_minutes * 60 + TIMER_GRACE_PERIOD_SEC;
      expiresAt = new Date(now.getTime() + totalSeconds * 1000);
    }

    const attempt = await QuizAttempt.create({
      child_id: childId,
      parent_id: parentId,
      quiz_id: quiz.quiz_id,
      quiz_name: quiz.quiz_name,
      subject: quiz.subject,
      year_level: quiz.year_level,
      status: "in_progress",
      started_at: now,
      expires_at: expiresAt, // ✅ Gap 6
      attempt_number: prevAttempts + 1,
    });

    res.status(201).json({
      attempt_id: attempt.attempt_id,
      resumed: false,
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
// ✅ Supports randomization + voice/video media
// ═══════════════════════════════════════
router.get("/quizzes/:quizId/questions", async (req, res) => {
  try {
    await connectDB(); // ✅ Gap 3
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

    // ✅ Randomize question order if enabled
    if (quiz.randomize_questions) {
      for (let i = safeQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [safeQuestions[i], safeQuestions[j]] = [safeQuestions[j], safeQuestions[i]];
      }
    }

    // ✅ Randomize option order — checks BOTH quiz-level AND per-question setting
    // Build a lookup for per-question shuffle_options from the original DB questions
    const shuffleMap = {};
    for (const q of questions) {
      shuffleMap[q.question_id] = !!q.shuffle_options;
    }

    for (const q of safeQuestions) {
      // Shuffle if quiz-level randomize_options is ON, or this specific question has shuffle_options ON
      const shouldShuffle = quiz.randomize_options || shuffleMap[q.question_id];
      if (shouldShuffle && q.options && q.options.length > 1) {
        for (let i = q.options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
        }
      }
    }

    res.json({
      questions: safeQuestions,
      // ✅ Include media URLs so the player can show them
      voice_url: quiz.voice_url || null,
      video_url: quiz.video_url || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// ✅ Gap 7: GET /api/quizzes/:quizId/resume
// Get saved answers for an in-progress attempt
// ═══════════════════════════════════════
router.get("/quizzes/:quizId/resume", async (req, res) => {
  try {
    await connectDB();
    const { childId } = req.user;
    if (!childId) return res.status(403).json({ error: "Child login required" });

    const attempt = await QuizAttempt.findOne({
      child_id: childId,
      quiz_id: req.params.quizId,
      status: "in_progress",
    }).lean();

    if (!attempt) {
      return res.status(404).json({ error: "No in-progress attempt found" });
    }

    // Check server-side expiry
    if (attempt.expires_at && new Date() > new Date(attempt.expires_at)) {
      await QuizAttempt.updateOne(
        { _id: attempt._id },
        {
          $set: {
            status: "expired",
            submitted_at: new Date(),
            duration_sec: Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
          },
        }
      );
      return res.status(410).json({ error: "This attempt has expired", code: "ATTEMPT_EXPIRED" });
    }

    // Calculate remaining time
    let timeRemainingSeconds = null;
    if (attempt.expires_at) {
      timeRemainingSeconds = Math.max(
        0,
        Math.round((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)
      );
    }

    res.json({
      attempt_id: attempt.attempt_id,
      started_at: attempt.started_at,
      time_remaining_seconds: timeRemainingSeconds,
      saved_answers: (attempt.answers || []).map((a) => ({
        question_id: a.question_id,
        selected_option_ids: a.selected_option_ids || [],
        text_answer: a.text_answer || "",
      })),
    });
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
    await connectDB(); // ✅ Gap 3
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.child_id) !== String(req.user.childId)) {
      return res.status(403).json({ error: "Not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Attempt already submitted" });
    }

    // ✅ Gap 6: Server-side expiry check on autosave
    if (attempt.expires_at && new Date() > new Date(attempt.expires_at)) {
      attempt.status = "expired";
      attempt.submitted_at = new Date();
      attempt.duration_sec = Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
      await attempt.save();
      return res.status(410).json({ error: "Time expired", code: "ATTEMPT_EXPIRED" });
    }

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
    await connectDB(); // ✅ Gap 3

    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.child_id) !== String(req.user.childId)) {
      return res.status(403).json({ error: "Not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Already submitted" });
    }

    // ═══════════════════════════════════════
    // ✅ Gap 6: Server-side timer enforcement on submit
    // Allow submission even if slightly past expiry (grace period is built into expires_at)
    // but flag it
    // ═══════════════════════════════════════
    let timerExpired = false;
    if (attempt.expires_at && new Date() > new Date(attempt.expires_at)) {
      timerExpired = true;
      // Still allow submission — the answers they had are valid
      // Just note it was a forced/late submission
      console.log(`⏰ Late submission: attempt=${attempt.attempt_id} (expired at ${attempt.expires_at})`);
    }

    const { answers, proctoring } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "answers array required" });
    }

    // Fetch questions WITH correct answers (server-side only)
    const questions = await Question.find({ quiz_ids: attempt.quiz_id })
      .sort({ order: 1 })
      .lean();

    const questionMap = {};
    for (const q of questions) questionMap[q.question_id] = q;

    const isWriting = (attempt.subject || "").toLowerCase() === "writing";

    // ─── Score MCQ questions ───
    let totalPoints = 0;
    let totalAvailable = 0;
    const topicBreakdown = {};

    const scoredAnswers = answers.map((ans) => {
      const question = questionMap[ans.question_id];
      if (!question) {
        return {
          question_id: ans.question_id,
          selected_option_ids: [],
          text_answer: "",
          points_scored: 0,
          points_available: 0,
        };
      }

      let pointsScored = 0;
      const pointsAvailable = question.points || 1;

      if (question.type !== "free_text") {
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
    attempt.timer_expired = timerExpired; // ✅ Gap 6: track if timer ran out

    // Store proctoring data if provided
    if (proctoring) {
      attempt.proctoring = {
        violations: proctoring.violations || 0,
        fullscreen_enforced: proctoring.fullscreen_enforced || false,
      };
    }

    if (!isWriting) {
      attempt.score = {
        points: totalPoints,
        available: totalAvailable,
        percentage,
        grade,
        pass: percentage >= 50,
      };
    }

    // Set initial AI feedback status
    attempt.ai_feedback_meta = {
      status: "queued",
      status_message: "Generating AI feedback...",
      subject: attempt.subject,
    };

    await attempt.save();

    console.log(
      `✅ Quiz submitted: attempt=${attempt.attempt_id}, score=${percentage}%, grade=${grade}${timerExpired ? " (timer expired)" : ""}`
    );

    // ═══════════════════════════════════════
    // ✅ Gap 2 + Gap 4: TRIGGER AI FEEDBACK (non-blocking)
    // Runs async — frontend polls GET /api/attempts/:id/result
    // ═══════════════════════════════════════
    triggerAiFeedback({
      attemptId: attempt.attempt_id,
      quizId: attempt.quiz_id,
      subject: attempt.subject,
      isWriting,
      scoredAnswers,
      topicBreakdown,
      score: attempt.score,
      yearLevel: attempt.year_level,
      quizName: attempt.quiz_name,
      childId: attempt.child_id,
      duration: attempt.duration_sec,
    }).catch((err) => {
      console.error(`❌ AI feedback trigger failed for attempt ${attempt.attempt_id}:`, err.message);
    });

    res.json({
      attempt_id: attempt.attempt_id,
      is_writing: isWriting,
      ai_status: "queued",
      timer_expired: timerExpired,
      score: attempt.score,
      topic_breakdown: Object.fromEntries(
        attempt.topic_breakdown instanceof Map
          ? attempt.topic_breakdown
          : Object.entries(topicBreakdown)
      ),
    });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/attempts/:attemptId/result
// Get scored result with feedback (polls for AI completion)
// ═══════════════════════════════════════
router.get("/attempts/:attemptId/result", async (req, res) => {
  try {
    await connectDB(); // ✅ Gap 3
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId }).lean();
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const isOwner = String(attempt.child_id) === String(req.user.childId);
    const isParent = String(attempt.parent_id) === String(req.user.parentId);
    if (!isOwner && !isParent) return res.status(403).json({ error: "Access denied" });

    res.json(attempt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// ✅ Gap 7: GET /api/children/:childId/in-progress
// List all in-progress attempts for a child (for "Resume Quiz" banner)
// ═══════════════════════════════════════
router.get("/children/:childId/in-progress", async (req, res) => {
  try {
    await connectDB();
    const childId = req.params.childId;

    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) return res.status(403).json({ error: "Access denied" });

    // Find all in-progress attempts, check expiry
    const attempts = await QuizAttempt.find({
      child_id: childId,
      status: "in_progress",
    })
      .sort({ started_at: -1 })
      .select("attempt_id quiz_id quiz_name subject year_level started_at expires_at attempt_number")
      .lean();

    const now = new Date();
    const active = [];
    const expiredIds = [];

    for (const a of attempts) {
      if (a.expires_at && now > new Date(a.expires_at)) {
        expiredIds.push(a._id);
      } else {
        active.push({
          ...a,
          time_remaining_seconds: a.expires_at
            ? Math.max(0, Math.round((new Date(a.expires_at).getTime() - now.getTime()) / 1000))
            : null,
        });
      }
    }

    // Clean up expired attempts in background
    if (expiredIds.length > 0) {
      QuizAttempt.updateMany(
        { _id: { $in: expiredIds } },
        { $set: { status: "expired", submitted_at: now } }
      ).catch((err) => console.error("Failed to expire stale attempts:", err));
    }

    res.json(active);
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
    await connectDB(); // ✅ Gap 3
    const childId = req.params.childId;

    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) return res.status(403).json({ error: "Access denied" });

    const attempts = await QuizAttempt.find({ child_id: childId })
      .sort({ submitted_at: -1 })
      .select(
        "attempt_id quiz_id quiz_name subject year_level status score.percentage score.grade submitted_at duration_sec attempt_number ai_feedback_meta.status"
      )
      .lean();

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;