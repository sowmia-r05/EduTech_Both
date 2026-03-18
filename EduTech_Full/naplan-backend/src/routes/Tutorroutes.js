/**
 * routes/tutorRoutes.js
 *
 * Tutor-specific API routes.
 * Tutors can only:
 *   - See their assigned quizzes
 *   - See questions in those quizzes
 *   - Verify/reject questions (approve/reject/pending)
 *   - Edit question content (resets verification to pending)
 *
 * ✅ NEW: PATCH /questions/:questionId/edit
 *         Allows tutor to edit text, options, explanation.
 *         Automatically resets tutor_verification.status → "pending".
 */

const express    = require("express");
const jwt        = require("jsonwebtoken");
const router     = express.Router();
const connectDB  = require("../config/db");
const Admin      = require("../models/admin");
const Quiz       = require("../models/quiz");
const Question   = require("../models/question");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

// ─── Middleware: require tutor or admin token ─────────────────────────────────
function requireTutor(req, res, next) {
  const header = req.headers.authorization || "";
  const rawFromHeader = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const fromHeader =
    rawFromHeader && rawFromHeader !== "null" && rawFromHeader !== "undefined"
      ? rawFromHeader
      : null;
  const fromCookie = req.cookies?.admin_token || null;
  const token = fromHeader || fromCookie;

  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!["admin", "tutor"].includes(decoded.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    req.tutor = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

router.use(requireTutor);

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/me — tutor profile + assigned quiz IDs
// ─────────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    await connectDB();
    const tutor = await Admin.findById(req.tutor.adminId)
      .select("email name role status assigned_quiz_ids last_login_at")
      .lean();
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    return res.json({ ok: true, tutor });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/quizzes — list assigned quizzes with verification stats
// ─────────────────────────────────────────────────────────────
router.get("/quizzes", async (req, res) => {
  try {
    await connectDB();

    // Always look up this user's assigned_quiz_ids from DB
    const account = await Admin.findById(req.tutor.adminId).lean();
    const assignedIds = account?.assigned_quiz_ids || [];

    if (assignedIds.length === 0) return res.json([]);

    const quizzes = await Quiz.find({
      $or: [
        { quiz_id: { $in: assignedIds } },
        { _id:     { $in: assignedIds } },
      ],
    }).lean();

    // Build verification stats per quiz
    const quizIds = quizzes.map((q) => q.quiz_id).filter(Boolean);
    const questions = await Question.find({ quiz_ids: { $in: quizIds } })
      .select("quiz_ids tutor_verification")
      .lean();

    const statsMap = {};
    for (const q of questions) {
      for (const qid of (q.quiz_ids || [])) {
        if (!statsMap[qid]) statsMap[qid] = { total: 0, approved: 0, rejected: 0, pending: 0 };
        statsMap[qid].total++;
        const s = q.tutor_verification?.status || "pending";
        statsMap[qid][s] = (statsMap[qid][s] || 0) + 1;
      }
    }

    return res.json(
      quizzes.map((qz) => ({
        ...qz,
        verification: statsMap[qz.quiz_id] || { total: 0, approved: 0, rejected: 0, pending: 0 },
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/quizzes/:quizId — quiz detail with questions
// ─────────────────────────────────────────────────────────────
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();

    const account = await Admin.findById(req.tutor.adminId).lean();
    const assignedIds = account?.assigned_quiz_ids || [];

    if (!assignedIds.includes(req.params.quizId)) {
      return res.status(403).json({ error: "This quiz is not assigned to you" });
    }

    let quiz = await Quiz.findOne({ quiz_id: req.params.quizId }).lean();
    if (!quiz) quiz = await Quiz.findById(req.params.quizId).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.find({
      $or: [
        { quiz_ids: req.params.quizId },
        { quiz_ids: quiz.quiz_id },
      ],
    }).sort({ createdAt: 1 }).lean();

    return res.json({
      ...quiz,
      questions,
      total_points:   questions.reduce((s, q) => s + (q.points || 1), 0),
      question_count: questions.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/tutor/questions/:questionId/verify — approve / reject / reset
// ─────────────────────────────────────────────────────────────
router.patch("/questions/:questionId/verify", async (req, res) => {
  try {
    await connectDB();

    const { status, rejection_reason } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved', 'rejected', or 'pending'" });
    }
    if (status === "rejected" && !rejection_reason?.trim()) {
      return res.status(400).json({ error: "rejection_reason is required when rejecting" });
    }

    const question = await Question.findOne({ question_id: req.params.questionId }).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Check tutor is assigned to this question's quiz
    const account = await Admin.findById(req.tutor.adminId).lean();
    const questionQuizIds = question.quiz_ids || [];
    const hasAccess = questionQuizIds.some((qid) =>
      (account.assigned_quiz_ids || []).includes(qid)
    );
    if (!hasAccess) {
      return res.status(403).json({ error: "You are not assigned to verify this question" });
    }

    const updated = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      {
        $set: {
          "tutor_verification.status":           status,
          "tutor_verification.verified_by":      req.tutor.email,
          "tutor_verification.verified_at":      new Date(),
          "tutor_verification.rejection_reason": status === "rejected" ? rejection_reason.trim() : null,
        },
      },
      { new: true }
    ).lean();

    return res.json({ ok: true, question: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/tutor/questions/:questionId/edit — edit question content
//
// ✅ NEW: Tutor can fix question text, options, and explanation.
//         Saving ALWAYS resets tutor_verification.status → "pending"
//         so the question goes back into the review queue.
// ─────────────────────────────────────────────────────────────
router.patch("/questions/:questionId/edit", async (req, res) => {
  try {
    await connectDB();

    const question = await Question.findOne({ question_id: req.params.questionId }).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Verify tutor is assigned to this question's quiz
    const account = await Admin.findById(req.tutor.adminId).lean();
    const questionQuizIds = question.quiz_ids || [];
    const hasAccess = questionQuizIds.some((qid) =>
      (account.assigned_quiz_ids || []).includes(qid)
    );
    if (!hasAccess) {
      return res.status(403).json({ error: "You are not assigned to edit this question" });
    }

    const { text, explanation, options } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Question text is required" });
    }

    // Build the update object
    const update = {
      $set: {
        text:        String(text).trim(),
        explanation: String(explanation || "").trim(),
        // Reset verification to pending whenever content changes
        "tutor_verification.status":           "pending",
        "tutor_verification.verified_by":      null,
        "tutor_verification.verified_at":      null,
        "tutor_verification.rejection_reason": null,
      },
    };

    // Only update options if provided and valid
    if (Array.isArray(options) && options.length > 0) {
      // Merge incoming option changes with existing option_ids
      const mergedOptions = options.map((incoming, idx) => {
        const existing = (question.options || [])[idx] || {};
        return {
          option_id: incoming.option_id || existing.option_id,
          text:      String(incoming.text || "").trim(),
          image_url: incoming.image_url ?? existing.image_url ?? null,
          correct:   Boolean(incoming.correct),
        };
      });
      update.$set.options = mergedOptions;
    }

    const updated = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      update,
      { new: true }
    ).lean();

    return res.json({ ok: true, question: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;