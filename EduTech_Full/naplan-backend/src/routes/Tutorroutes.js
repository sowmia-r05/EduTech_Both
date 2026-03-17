/**
 * routes/tutorRoutes.js
 *
 * Tutor-specific API routes.
 * Tutors can only:
 *   - See their assigned quizzes
 *   - See questions in those quizzes
 *   - Verify/reject questions (approve/reject/pending)
 *
 * All routes require a valid tutor JWT.
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
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
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

    // Admins see all quizzes; tutors see only their assigned ones
    let quizIds = null;
    if (req.tutor.role === "tutor") {
      const tutor = await Admin.findById(req.tutor.adminId).lean();
      if (!tutor) return res.status(404).json({ error: "Tutor not found" });
      quizIds = tutor.assigned_quiz_ids || [];
      if (quizIds.length === 0) return res.json([]);
    }

    const query = quizIds ? { quiz_id: { $in: quizIds } } : {};
    const quizzes = await Quiz.find(query)
      .select("quiz_id quiz_name year_level subject tier question_count is_active")
      .sort({ createdAt: -1 })
      .lean();

    // Attach verification stats per quiz
    const stats = await Question.aggregate([
      {
        $match: quizIds
          ? { quiz_ids: { $in: quizIds } }
          : {},
      },
      {
        $group: {
          _id: {
            quiz_id: { $arrayElemAt: ["$quiz_ids", 0] },
            status:  "$tutor_verification.status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id:      "$_id.quiz_id",
          statuses: { $push: { status: "$_id.status", count: "$count" } },
          total:    { $sum: "$count" },
        },
      },
    ]);

    const statsMap = {};
    for (const row of stats) {
      if (!row._id) continue;
      const entry = { total: row.total, approved: 0, rejected: 0, pending: 0 };
      for (const s of row.statuses) {
        entry[s.status || "pending"] = s.count;
      }
      statsMap[row._id] = entry;
    }

    const enriched = quizzes.map((q) => ({
      ...q,
      verification: statsMap[q.quiz_id] || { total: q.question_count || 0, approved: 0, rejected: 0, pending: q.question_count || 0 },
    }));

    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/quizzes/:quizId — quiz detail with all questions
// Only accessible if tutor is assigned to this quiz
// ─────────────────────────────────────────────────────────────
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();

    // Check tutor is assigned to this quiz
    if (req.tutor.role === "tutor") {
      const tutor = await Admin.findById(req.tutor.adminId).lean();
      if (!tutor) return res.status(404).json({ error: "Tutor not found" });
      if (!tutor.assigned_quiz_ids.includes(req.params.quizId)) {
        return res.status(403).json({ error: "This quiz is not assigned to you" });
      }
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
// PATCH /api/tutor/questions/:questionId/verify — verify a question
// Tutor must be assigned to the quiz that contains this question
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

    // Check tutor is assigned to the quiz containing this question
    if (req.tutor.role === "tutor") {
      const tutor = await Admin.findById(req.tutor.adminId).lean();
      const questionQuizIds = question.quiz_ids || [];
      const hasAccess = questionQuizIds.some((qid) =>
        tutor.assigned_quiz_ids.includes(qid)
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "You are not assigned to verify this question" });
      }
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

module.exports = router;