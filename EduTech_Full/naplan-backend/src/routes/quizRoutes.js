/**
 * routes/quizRoutes.js  (v6 — fixed topic_breakdown not persisting)
 *
 * ✅ FIX in v5:
 *   Removed premature `syncWritingAttempt` call from the submit handler.
 *   It was creating a Writing doc with ai.status="error" (AI hadn't run yet)
 *   and then DELETING the QuizAttempt — causing triggerAiFeedback to exit early
 *   and never actually generate AI feedback.
 *   triggerAiFeedback handles 100% of the writing pipeline correctly.
 *
 * ✅ FIX in v6:
 *   Added `attempt.markModified('topic_breakdown')` after assigning topicBreakdown.
 *   topic_breakdown is a Mongoose Map type — assigning a plain JS object to it
 *   does NOT get tracked as a change by Mongoose, so it was silently skipped on save().
 *   markModified() forces Mongoose to include it in the next save().
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");
const { triggerAiFeedback } = require("../services/aiFeedbackService"); // ✅ removed syncWritingAttempt
const { sendQuizCompletionEmail, checkNotificationEligibility } = require("../services/emailNotifications");
const QuizCatalog = require("../models/quizCatalog");
const Writing = require("../models/writing");
const router = express.Router();

// ─── Constants ───
const MAX_ATTEMPTS_DEFAULT = 5;
const TIMER_GRACE_PERIOD_SEC = 60;

// All routes require authentication
router.use(verifyToken, requireAuth);

// ═══════════════════════════════════════
// GET /api/quizzes/:quizId
// ═══════════════════════════════════════
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();
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
// ═══════════════════════════════════════
router.post("/quizzes/:quizId/start", async (req, res) => {
  try {
    await connectDB();

    const { childId: tokenChildId, parentId, role } = req.user;

    let childId = tokenChildId;
    if (!childId && role === "parent") {
      childId = req.body.childId;
    }
    if (!childId) return res.status(403).json({ error: "Child login required to take quizzes" });

    if (role === "parent" && !tokenChildId) {
      const ownerCheck = await Child.findById(childId).lean();
      if (!ownerCheck || String(ownerCheck.parent_id) !== String(parentId)) {
        return res.status(403).json({ error: "Access denied — not your child" });
      }
    }

    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId, is_active: true }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child profile not found" });

    const isTrialQuiz = quiz.is_trial === true;

    if (!isTrialQuiz) {
      const childBundleIds = child.entitled_bundle_ids || [];
      let hasEntitlement = false;
      if (childBundleIds.length > 0) {
        const bundleWithQuiz = await QuizCatalog.findOne({
          bundle_id: { $in: childBundleIds },
          $or: [
            { quiz_ids: quiz.quiz_id },
          ],
        }).lean();
        hasEntitlement = !!bundleWithQuiz;
      }
      if (!hasEntitlement) {
        return res.status(403).json({
          error: "You don't have access to this quiz. Ask your parent to purchase a bundle.",
          code: "NOT_ENTITLED",
        });
      }
    }

    if (!quiz.attempts_enabled) {
      // Retakes disabled
    }

    const maxAttempts = (() => {
      if (quiz.max_attempts !== null && quiz.max_attempts > 1) {
        return quiz.max_attempts; // admin explicitly set a limit
      }
      if (quiz.attempts_enabled) {
        return Infinity; // retakes enabled, no limit set
      }
      return 1; // default: one attempt only
    })();


    const isWritingQuizCheck = /writing/i.test(quiz.subject || quiz.quiz_name || "");

    const [mcqCompleted, writingCompleted] = await Promise.all([
      QuizAttempt.countDocuments({
        child_id: childId,
        quiz_id: quiz.quiz_id,
        status: { $in: ["scored", "ai_done", "submitted"] },
      }),
      isWritingQuizCheck
        ? Writing.countDocuments({ child_id: childId, quiz_id: quiz.quiz_id })
        : Promise.resolve(0),
    ]);

    const completedAttempts = mcqCompleted + writingCompleted;

    if (completedAttempts >= maxAttempts) {
      return res.status(403).json({
        error: `Maximum attempts reached (${maxAttempts}). You've completed this quiz ${completedAttempts} time(s).`,
        code: "MAX_ATTEMPTS_REACHED",
        completed: completedAttempts,
        max: maxAttempts,
      });
    }

    const existingAttempt = await QuizAttempt.findOne({
      child_id: childId,
      quiz_id: quiz.quiz_id,
      status: "in_progress",
    }).lean();

    if (existingAttempt) {
      if (existingAttempt.expires_at && new Date() > new Date(existingAttempt.expires_at)) {
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
      } else {
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

    const isWritingQuiz = /writing/i.test(quiz.subject || quiz.quiz_name || "");

    const [prevQuizAttempts, prevWritingAttempts] = await Promise.all([
      QuizAttempt.countDocuments({ child_id: childId, quiz_id: quiz.quiz_id }),
      isWritingQuiz
        ? Writing.countDocuments({ child_id: childId, quiz_id: quiz.quiz_id })
        : Promise.resolve(0),
    ]);

    const prevAttempts = prevQuizAttempts + prevWritingAttempts;

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
      expires_at: expiresAt,
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
// ═══════════════════════════════════════
router.get("/quizzes/:quizId/questions", async (req, res) => {
  try {
    await connectDB();
    const quiz = await Quiz.findOne({
      quiz_id: req.params.quizId,
      is_active: true,
    }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.find({ quiz_ids: quiz.quiz_id })
      .sort({ order: 1 })
      .lean();

    // AFTER
    const safeQuestions = questions.map((q) => ({
      question_id: q.question_id,
      type: q.type,
      text: q.text,
      options: q.options.map((opt) => ({
        option_id: opt.option_id,
        text: opt.text,
        image_url: opt.image_url || null,
      })),
      points: q.points,
      categories: q.categories,
      image_url: q.image_url || null,
      image_width: q.image_width || null, // ← ADD
      image_height: q.image_height || null, // ← ADD
      image_size: q.image_size || "medium", // ← ADD
      order: q.order,
      voice_url: q.voice_url || null,
      video_url: q.video_url || null,
      text_font_size:      q.text_font_size      || null,
      text_font_family:    q.text_font_family     || null,
      text_font_weight:    q.text_font_weight     || null,
      text_align:          q.text_align           || null,
      text_line_height:    q.text_line_height     || null,
      text_letter_spacing: q.text_letter_spacing  || null,
      text_color:          q.text_color           || null,
      max_length:          q.max_length           || null,
      text_style_scope:    q.text_style_scope     || "question",
    }));

    if (quiz.randomize_questions) {
      for (let i = safeQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [safeQuestions[i], safeQuestions[j]] = [
          safeQuestions[j],
          safeQuestions[i],
        ];
      }
    }

    const shuffleMap = {};
    for (const q of questions) {
      shuffleMap[q.question_id] = !!q.shuffle_options;
    }

    for (const q of safeQuestions) {
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
      voice_url: quiz.voice_url || null,
      video_url: quiz.video_url || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/quizzes/:quizId/resume
// ═══════════════════════════════════════
router.get("/quizzes/:quizId/resume", async (req, res) => {
  try {
    await connectDB();
    const { childId: tokenChildId, parentId, role } = req.user;
    let childId = tokenChildId;
    if (!childId && role === "parent") childId = req.query.childId;
    if (!childId) return res.status(403).json({ error: "Child login required" });

    const attempt = await QuizAttempt.findOne({
      child_id: childId,
      quiz_id: req.params.quizId,
      status: "in_progress",
    }).lean();

    if (!attempt) return res.status(404).json({ error: "No in-progress attempt found" });

    if (attempt.expires_at && new Date() > new Date(attempt.expires_at)) {
      await QuizAttempt.updateOne(
        { _id: attempt._id },
        { $set: { status: "expired", submitted_at: new Date(), duration_sec: Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000) } }
      );
      return res.status(410).json({ error: "This attempt has expired", code: "ATTEMPT_EXPIRED" });
    }

    let timeRemainingSeconds = null;
    if (attempt.expires_at) {
      timeRemainingSeconds = Math.max(0, Math.round((new Date(attempt.expires_at).getTime() - Date.now()) / 1000));
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
// ═══════════════════════════════════════
router.patch("/attempts/:attemptId/autosave", async (req, res) => {
  try {
    await connectDB();
    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const isChildOwner = String(attempt.child_id) === String(req.user.childId);
    const isParentOwner = req.user.role === "parent" && String(attempt.parent_id) === String(req.user.parentId);
    if (!isChildOwner && !isParentOwner) return res.status(403).json({ error: "Not your attempt" });
    if (attempt.status !== "in_progress") return res.status(400).json({ error: "Attempt already submitted" });

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
// ═══════════════════════════════════════
router.post("/attempts/:attemptId/submit", async (req, res) => {
  try {
    await connectDB();

    const attempt = await QuizAttempt.findOne({ attempt_id: req.params.attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const isChildOwner = String(attempt.child_id) === String(req.user.childId);
    const isParentOwner = req.user.role === "parent" && String(attempt.parent_id) === String(req.user.parentId);
    if (!isChildOwner && !isParentOwner) return res.status(403).json({ error: "Not your attempt" });
    if (attempt.status !== "in_progress") return res.status(400).json({ error: "Already submitted" });

    let timerExpired = false;
    if (attempt.expires_at && new Date() > new Date(attempt.expires_at)) {
      timerExpired = true;
      console.log(`⏰ Late submission: attempt=${attempt.attempt_id} (expired at ${attempt.expires_at})`);
    }

    const { answers, proctoring } = req.body;
    if (!Array.isArray(answers)) return res.status(400).json({ error: "answers array required" });

    const questions = await Question.find({ quiz_ids: attempt.quiz_id }).sort({ order: 1 }).lean();
    const questionMap = {};
    for (const q of questions) questionMap[q.question_id] = q;

    // ✅ NEW — matches the same logic as the start route
    const isWriting = /writing/i.test(attempt.subject || attempt.quiz_name || "");

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
        const correctIds = question.options.filter((o) => o.correct).map((o) => o.option_id).sort();
        const selectedIds = (ans.selected_option_ids || []).sort();
        const isCorrect = correctIds.length === selectedIds.length && correctIds.every((id, i) => id === selectedIds[i]);
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
        is_correct: pointsScored > 0,
      };
    });

    const percentage = totalAvailable > 0 ? Math.round((totalPoints / totalAvailable) * 100) : 0;
    let grade = "F";
    if (percentage >= 90) grade = "A";
    else if (percentage >= 75) grade = "B";
    else if (percentage >= 60) grade = "C";
    else if (percentage >= 50) grade = "D";

    attempt.answers = scoredAnswers;
    attempt.submitted_at = new Date();
    attempt.duration_sec = Math.round((attempt.submitted_at - attempt.started_at) / 1000);
    attempt.status = isWriting ? "submitted" : "scored";
    attempt.topic_breakdown = topicBreakdown;
    attempt.markModified("topic_breakdown"); // ✅ FIX v6: Forces Mongoose to persist the Map field
    attempt.timer_expired = timerExpired;

    if (proctoring) {
      attempt.proctoring = {
        violations: proctoring.violations || 0,
        fullscreen_enforced: proctoring.fullscreen_enforced || false,
      };
    }

    if (!isWriting) {
      attempt.score = { points: totalPoints, available: totalAvailable, percentage, grade, pass: percentage >= 50 };
    }

    attempt.ai_feedback_meta = {
      status: "queued",
      status_message: "Generating AI feedback...",
      subject: attempt.subject,
    };

    await attempt.save();

    console.log(`✅ Quiz submitted: attempt=${attempt.attempt_id}, score=${percentage}%, grade=${grade}${timerExpired ? " (timer expired)" : ""}`);

    // ✅ FIX: Removed premature syncWritingAttempt() call that was here.
    // It was creating a Writing doc with ai.status="error" (before AI ran),
    // deleting the QuizAttempt, then triggerAiFeedback found nothing and exited.
    // triggerAiFeedback handles the full writing pipeline on its own.

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

    (async () => {
      try {
        const eligibility = await checkNotificationEligibility(attempt.child_id);
        if (!eligibility.shouldSend) return;
        const tbObj = attempt.topic_breakdown instanceof Map ? Object.fromEntries(attempt.topic_breakdown) : topicBreakdown;
        await sendQuizCompletionEmail({
          parentEmail: eligibility.parentEmail,
          childName: eligibility.childName,
          quizName: attempt.quiz_name || "Practice Quiz",
          score: attempt.score,
          topicBreakdown: tbObj,
          duration: attempt.duration_sec,
          subject: attempt.subject,
        });
        console.log(`📧 Quiz completion email sent to ${eligibility.parentEmail} for ${eligibility.childName}`);
      } catch (emailErr) {
        console.error(`⚠️ Failed to send quiz completion email:`, emailErr.message);
      }
    })();

    res.json({
      attempt_id: attempt.attempt_id,
      quiz_name: attempt.quiz_name,
      subject: attempt.subject,
      is_writing: isWriting,
      ai_status: "queued",
      timer_expired: timerExpired,
      score: attempt.score,
      topic_breakdown: Object.fromEntries(
        attempt.topic_breakdown instanceof Map ? attempt.topic_breakdown : Object.entries(topicBreakdown)
      ),
      proctoring: attempt.proctoring || {violations: 0},
    });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/attempts/:attemptId/result
// ═══════════════════════════════════════
router.get("/attempts/:attemptId/result", async (req, res) => {
  try {
    await connectDB();
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
// GET /api/attempts/:attemptId/ai-status
// Lightweight poll — QuizResult.jsx calls this every 5s
// to detect when writing AI feedback finishes.
// Checks Writing collection first (writing moves there after AI),
// falls back to QuizAttempt for in-progress status.
// ═══════════════════════════════════════
router.get("/attempts/:attemptId/ai-status", async (req, res) => {
  try {
    await connectDB();
    const { attemptId } = req.params;

    // Writing quizzes: after AI runs, the record lives in Writing collection
    const writing = await Writing.findOne({
      $or: [{ response_id: attemptId }, { attempt_id: attemptId }],
    })
      .select("ai")
      .lean();

    if (writing) {
      const status = writing?.ai?.status || "pending";
      return res.json({ ai_status: status });
    }

    // Not in Writing yet — check QuizAttempt (still processing)
    const attempt = await QuizAttempt.findOne({ attempt_id: attemptId })
      .select("ai_feedback_meta")
      .lean();

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    const status = attempt?.ai_feedback_meta?.status || "queued";
    return res.json({ ai_status: status });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// GET /api/children/:childId/in-progress
// ═══════════════════════════════════════
router.get("/children/:childId/in-progress", async (req, res) => {
  try {
    await connectDB();
    const childId = req.params.childId;

    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) return res.status(403).json({ error: "Access denied" });

    const attempts = await QuizAttempt.find({ child_id: childId, status: "in_progress" })
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
// ═══════════════════════════════════════
router.get("/children/:childId/attempts", async (req, res) => {
  try {
    await connectDB();
    const childId = req.params.childId;

    const isChild = String(req.user.childId) === childId;
    const isParent = req.user.role === "parent";
    if (!isChild && !isParent) return res.status(403).json({ error: "Access denied" });

    const attempts = await QuizAttempt.find({ child_id: childId })
      .sort({ submitted_at: -1 })
      .select("attempt_id quiz_id quiz_name subject year_level status score.percentage score.grade submitted_at duration_sec attempt_number ai_feedback_meta.status")
      .lean();

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;