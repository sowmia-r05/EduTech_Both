/**
 * routes/Tutorroutes.js  (v2 — SECRET SEPARATION + OWNERSHIP CONSISTENCY)
 *
 * Tutor-specific API routes. Tutors can only:
 *   - See their assigned quizzes
 *   - See questions in those quizzes
 *   - Verify/reject questions (approve/reject/pending)
 *   - Edit question content (resets verification to pending)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX-1 — SECRET. This file carried its OWN copy of the admin-token verify
 *   logic, reading `process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET` —
 *   the PARENT secret. Two consequences:
 *     (a) BROKEN. adminRoutes now signs tutor tokens with signAdmin() →
 *         ADMIN_JWT_SECRET. Verified with the parent secret, every tutor
 *         request would 401.
 *     (b) INSECURE. It was the exact hole config/jwt.js exists to close —
 *         whoever held the parent secret could forge a tutor token.
 *   The local copy is DELETED. requireAdmin (middleware/adminAuth.js) already
 *   admits both "admin" and "tutor". This was the THIRD copy of the same verify
 *   logic in the codebase, which is precisely how three files ended up with
 *   three different opinions about which secret to use.
 *
 *   Tutors now inherit everything admins got: token_version revocation, live
 *   status checks (a suspended tutor is locked out on their NEXT request, not
 *   whenever their token happens to expire), and role read from the DB.
 *
 * 🔴 FIX-2 — OWNERSHIP CHECKS DISAGREED WITH THE LISTING.
 *   GET /quizzes matched assigned quizzes by quiz_id OR _id.
 *   GET /quizzes/:quizId checked ONLY quiz_id.
 *   Result: a quiz assigned by Mongo _id appeared in the tutor's list, then 403'd
 *   the moment they clicked it. Both now go through isAssigned(), so there is one
 *   definition of "assigned".
 *
 * 🟡 FIX-3 — `account.assigned_quiz_ids` (no optional chain) threw a TypeError
 *   and returned 500 if the tutor account had been deleted mid-session. Now a
 *   clean 401.
 *
 * 🟡 FIX-4 — Removed the two `[tutor/quizzes]` debug console.logs that were
 *   marked "remove this" and still logging adminId on every request.
 *
 * 🟡 FIX-5 — Every handler re-fetched the Admin doc. loadAccount() does it once
 *   per request with an explicit .select(), instead of pulling the whole
 *   document (password_hash included) four different ways.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express   = require("express");
const mongoose  = require("mongoose");
const router    = express.Router();
const connectDB = require("../config/db");
const Admin     = require("../models/admin");
const Quiz      = require("../models/quiz");
const Question  = require("../models/question");

// ✅ FIX-1: single shared guard. Verifies against ADMIN_JWT_SECRET, checks
// token_version, re-reads status + role from the DB. Admits admin AND tutor.
const { requireAdmin } = require("../middleware/adminAuth");

/**
 * Thin alias so the handlers below can keep using `req.tutor`.
 * requireAdmin populates `req.admin`; nothing else changes.
 */
function requireTutor(req, res, next) {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    if (res.headersSent) return; // requireAdmin already responded 401/403
    req.tutor = req.admin;
    next();
  });
}

router.use(requireTutor);

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Load the caller's Admin row. Returns null if the account has vanished.
 * ✅ FIX-5: one place, one explicit projection — no accidental password_hash.
 */
async function loadAccount(req) {
  return Admin.findById(req.tutor.adminId)
    .select("email name role status assigned_quiz_ids last_login_at")
    .lean();
}

/**
 * ✅ FIX-2: THE single definition of "is this quiz assigned to this tutor".
 *
 * assigned_quiz_ids is a [String] that in practice holds a mix of business
 * quiz_ids AND Mongo _id strings, because the admin UI has written both over
 * time. The listing query already accounted for that; the per-quiz guards did
 * not. Both now call this, so they cannot disagree again.
 *
 * @param {string[]} assignedIds  account.assigned_quiz_ids
 * @param {object}   quiz         a Quiz doc (lean) — needs quiz_id and _id
 */
function isAssigned(assignedIds, quiz) {
  if (!quiz || !Array.isArray(assignedIds) || assignedIds.length === 0) return false;
  const ids = new Set(assignedIds.map(String));
  return ids.has(String(quiz.quiz_id)) || ids.has(String(quiz._id));
}

/** Find a quiz by business quiz_id, falling back to Mongo _id. */
async function findQuiz(quizIdOrObjectId) {
  const byQuizId = await Quiz.findOne({ quiz_id: quizIdOrObjectId }).lean();
  if (byQuizId) return byQuizId;
  if (mongoose.Types.ObjectId.isValid(quizIdOrObjectId)) {
    return Quiz.findById(quizIdOrObjectId).lean();
  }
  return null;
}

/**
 * Does the caller have access to at least one of the quizzes this question
 * belongs to? Same mixed quiz_id / _id tolerance as isAssigned().
 */
function hasQuestionAccess(assignedIds, question) {
  if (!Array.isArray(assignedIds) || assignedIds.length === 0) return false;
  const ids = new Set(assignedIds.map(String));
  return (question.quiz_ids || []).some((qid) => ids.has(String(qid)));
}

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/me — tutor profile + assigned quiz IDs
// ─────────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    await connectDB();
    const tutor = await loadAccount(req);
    if (!tutor) return res.status(401).json({ error: "Account no longer exists" });
    return res.json({ ok: true, tutor });
  } catch (err) {
    console.error("GET /api/tutor/me error:", err.message);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/quizzes — assigned quizzes with verification stats
// ─────────────────────────────────────────────────────────────
router.get("/quizzes", async (req, res) => {
  try {
    await connectDB();

    // ✅ FIX-3: the account is the authority, and it might be gone.
    const account = await loadAccount(req);
    if (!account) return res.status(401).json({ error: "Account no longer exists" });

    const assignedIds = account.assigned_quiz_ids || [];
    if (assignedIds.length === 0) return res.json([]);

    // assigned_quiz_ids may hold business quiz_ids, Mongo _ids, or both.
    const objectIds = assignedIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const quizzes = await Quiz.find({
      $or: [
        { quiz_id: { $in: assignedIds } },
        ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
      ],
    }).lean();

    // Verification stats — one query for ALL assigned quizzes, not one per quiz.
    const quizIds = quizzes.map((q) => q.quiz_id).filter(Boolean);

    const questions = await Question.find({ quiz_ids: { $in: quizIds } })
      .select("quiz_ids tutor_verification")
      .lean();

    const statsMap = {};
    for (const q of questions) {
      for (const qid of q.quiz_ids || []) {
        if (!statsMap[qid]) {
          statsMap[qid] = { total: 0, approved: 0, rejected: 0, pending: 0 };
        }
        statsMap[qid].total++;
        const s = q.tutor_verification?.status || "pending";
        statsMap[qid][s] = (statsMap[qid][s] || 0) + 1;
      }
    }

    return res.json(
      quizzes.map((qz) => ({
        ...qz,
        verification:
          statsMap[qz.quiz_id] || { total: 0, approved: 0, rejected: 0, pending: 0 },
      })),
    );
  } catch (err) {
    console.error("GET /api/tutor/quizzes error:", err.message);
    return res.status(500).json({ error: "Failed to load quizzes" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tutor/quizzes/:quizId — quiz detail with questions
// ─────────────────────────────────────────────────────────────
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();

    const account = await loadAccount(req);
    if (!account) return res.status(401).json({ error: "Account no longer exists" });

    // ✅ FIX-2: resolve the quiz FIRST, then check assignment against both its
    // quiz_id and its _id. The old code compared the URL param against
    // assigned_quiz_ids directly, so a quiz assigned by _id 403'd here even
    // though it appeared in GET /quizzes.
    const quiz = await findQuiz(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    if (!isAssigned(account.assigned_quiz_ids, quiz)) {
      return res.status(403).json({ error: "This quiz is not assigned to you" });
    }

    const questions = await Question.find({ quiz_ids: quiz.quiz_id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.json({
      ...quiz,
      questions,
      total_points: questions.reduce((s, q) => s + (q.points || 1), 0),
      question_count: questions.length,
    });
  } catch (err) {
    console.error("GET /api/tutor/quizzes/:quizId error:", err.message);
    return res.status(500).json({ error: "Failed to load quiz" });
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
      return res
        .status(400)
        .json({ error: "status must be 'approved', 'rejected', or 'pending'" });
    }
    if (status === "rejected" && !rejection_reason?.trim()) {
      return res
        .status(400)
        .json({ error: "rejection_reason is required when rejecting" });
    }

    const question = await Question.findOne({
      question_id: req.params.questionId,
    }).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    const account = await loadAccount(req);
    if (!account) return res.status(401).json({ error: "Account no longer exists" });

    if (!hasQuestionAccess(account.assigned_quiz_ids, question)) {
      return res
        .status(403)
        .json({ error: "You are not assigned to verify this question" });
    }

    const updated = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      {
        $set: {
          "tutor_verification.status": status,
          "tutor_verification.verified_by": req.tutor.email,
          "tutor_verification.verified_at": new Date(),
          "tutor_verification.rejection_reason":
            status === "rejected" ? rejection_reason.trim() : null,
        },
      },
      { new: true },
    ).lean();

    return res.json({ ok: true, question: updated });
  } catch (err) {
    console.error("PATCH /api/tutor/questions/:id/verify error:", err.message);
    return res.status(500).json({ error: "Failed to update verification" });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/tutor/questions/:questionId/edit — edit question content
//
// Saving ALWAYS resets tutor_verification.status → "pending", so an edited
// question goes back into the review queue rather than keeping a stale approval.
// ─────────────────────────────────────────────────────────────
router.patch("/questions/:questionId/edit", async (req, res) => {
  try {
    await connectDB();

    const question = await Question.findOne({
      question_id: req.params.questionId,
    }).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    const account = await loadAccount(req);
    if (!account) return res.status(401).json({ error: "Account no longer exists" });

    if (!hasQuestionAccess(account.assigned_quiz_ids, question)) {
      return res
        .status(403)
        .json({ error: "You are not assigned to edit this question" });
    }

    const { text, explanation, options, sub_topic } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Question text is required" });
    }

    const subTopicProvided = sub_topic !== undefined;
    const cleanSubTopic = subTopicProvided
      ? String(sub_topic || "").trim() || null
      : question.sub_topic;

    const set = {
      text: String(text).trim(),
      explanation: String(explanation || "").trim(),
      sub_topic: cleanSubTopic,

      // Editing invalidates any prior verification.
      "tutor_verification.status": "pending",
      "tutor_verification.verified_by": null,
      "tutor_verification.verified_at": null,
      "tutor_verification.rejection_reason": null,

      tutor_edited_by: req.tutor.email,
      tutor_edited_at: new Date(),
    };

    // Keep `categories` in sync with sub_topic so the admin dashboard, which
    // reads categories[0].name, doesn't show a stale value.
    if (subTopicProvided && cleanSubTopic) {
      if (question.categories && question.categories.length > 0) {
        set["categories.0.name"] = cleanSubTopic;
      } else {
        set.categories = [{ name: cleanSubTopic }];
      }
    }

    // Only touch options when a valid array is supplied. Merge against the
    // existing row so option_ids survive an edit.
    if (Array.isArray(options) && options.length > 0) {
      set.options = options.map((incoming, idx) => {
        const existing = (question.options || [])[idx] || {};
        return {
          option_id: incoming.option_id || existing.option_id,
          text: String(incoming.text || "").trim(),
          match: String(incoming.match ?? existing.match ?? "").trim(),
          image_url: incoming.image_url ?? existing.image_url ?? null,
          correct: Boolean(incoming.correct),
        };
      });
    }

    const updated = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      { $set: set },
      { new: true },
    ).lean();

    return res.json({ ok: true, question: updated });
  } catch (err) {
    console.error("PATCH /api/tutor/questions/:id/edit error:", err.message);
    return res.status(500).json({ error: "Failed to save question" });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/tutor/quizzes/:quizId/flag — flag / clear a whole quiz
// ─────────────────────────────────────────────────────────────
router.patch("/quizzes/:quizId/flag", async (req, res) => {
  try {
    await connectDB();

    const account = await loadAccount(req);
    if (!account) return res.status(401).json({ error: "Account no longer exists" });

    // ✅ FIX-2: same assignment rule as everywhere else.
    const quiz = await findQuiz(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    if (!isAssigned(account.assigned_quiz_ids, quiz)) {
      return res.status(403).json({ error: "This quiz is not assigned to you" });
    }

    const { comment, status } = req.body;
    if (!["flagged", "cleared"].includes(status)) {
      return res.status(400).json({ error: "status must be 'flagged' or 'cleared'" });
    }
    if (status === "flagged" && !comment?.trim()) {
      return res.status(400).json({ error: "A comment is required when flagging" });
    }

    const updated = await Quiz.findOneAndUpdate(
      { quiz_id: quiz.quiz_id },
      {
        $set: {
          "tutor_flag.status": status,
          "tutor_flag.comment": status === "flagged" ? comment.trim() : "",
          "tutor_flag.flagged_by": req.tutor.email,
          "tutor_flag.flagged_at": new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!updated) return res.status(404).json({ error: "Quiz not found" });
    return res.json({ ok: true, quiz: updated });
  } catch (err) {
    console.error("PATCH /api/tutor/quizzes/:id/flag error:", err.message);
    return res.status(500).json({ error: "Failed to update flag" });
  }
});

module.exports = router;