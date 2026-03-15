/**
 * routes/resultRoutes.js
 *
 * SECURITY FIXES APPLIED:
 *   ✅ FIX-1: Removed duplicate unauthenticated GET / handler (was leaking ALL results)
 *   ✅ FIX-2: GET /:responseId — added verifyToken + requireAuth + ownership check
 *   ✅ FIX-3: GET /latest/by-username — added verifyToken + requireAuth + ownership check
 *   ✅ FIX-4: GET /latest/by-filters — added verifyToken + requireAuth + ownership check
 *   ✅ FIX-5: GET /check-submission/:username — added verifyToken + requireAuth + ownership check
 *   ✅ FIX-6: GET /quizzes — added verifyToken + requireAuth + ownership check
 *   ✅ FIX-7: GET /latest/by-userid (legacy) — kept as no-op, no data exposed
 */

const router      = require("express").Router();
const connectDB   = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Child       = require("../models/child");
const Writing     = require("../models/writing");
const { verifyToken, requireAuth, requireParent } = require("../middleware/auth");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferSubjectFromQuizName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("numer")) return "Numeracy";
  if (n.includes("read"))  return "Reading";
  if (n.includes("writ"))  return "Writing";
  if (n.includes("lang") || n.includes("convent")) return "Language Conventions";
  return null;
}

function normalizeQuizAttempt(attempt, child) {
  if (!attempt) return null;
  const metaStatus = attempt.ai_feedback_meta?.status || "pending";
  return {
    _id:         attempt._id,
    response_id: attempt.attempt_id,
    quiz_id:     attempt.quiz_id,
    quiz_name:   attempt.quiz_name || "Untitled Quiz",
    subject:     attempt.subject   || inferSubjectFromQuizName(attempt.quiz_name),
    year_level:  attempt.year_level || child?.year_level,
    child_id:    attempt.child_id,
    username:    child?.username    || attempt.username,
    display_name: child?.display_name,
    date_submitted: attempt.submitted_at || attempt.createdAt,
    score: attempt.score || null,
    duration: attempt.duration_sec || 0,
    answers:  attempt.answers || [],
    ai_feedback:      attempt.ai_feedback      || null,
    performance_analysis: attempt.performance_analysis || null,
    ai_feedback_meta: {
      status:       metaStatus === "done" ? "done" : metaStatus,
      message:      attempt.ai_feedback_meta?.status_message || (metaStatus === "done" ? "Feedback ready" : "Generating AI feedback..."),
      error:        metaStatus === "error" ? "AI feedback generation failed" : null,
      evaluated_at: attempt.ai_feedback_meta?.generated_at || null,
    },
    source:     "native",
  };
}

// ─── Helper: assert the requesting user owns this child ───────────────────────
async function assertResultOwnership(req, childId) {
  if (!childId) return false;
  if (req.user.role === "child") {
    return String(req.user.childId) === String(childId);
  }
  if (req.user.role === "parent") {
    const parentId = req.user.parentId || req.user.parent_id;
    const child = await Child.findOne({ _id: childId, parent_id: parentId }).lean();
    return !!child;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/
// ✅ FIX-1: Single authenticated handler — scoped to requesting user's children.
//    The old duplicate unauthenticated handler has been REMOVED entirely.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const childId  = req.user.childId;

    let query = { status: { $in: ["scored", "ai_done", "submitted"] } };

    if (req.user.role === "parent") {
      const children = await Child.find({ parent_id: parentId }).select("_id").lean();
      query.child_id = { $in: children.map((c) => c._id) };
    } else if (req.user.role === "child") {
      query.child_id = childId;
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const attempts = await QuizAttempt.find(query)
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    const childIds = [...new Set(attempts.map((a) => String(a.child_id)))];
    const childDocs = await Child.find({ _id: { $in: childIds } }).lean();
    const childMap  = Object.fromEntries(childDocs.map((c) => [String(c._id), c]));

    return res.json(attempts.map((a) => normalizeQuizAttempt(a, childMap[String(a.child_id)])));
  } catch (err) {
    console.error("GET /api/results/ error:", err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/latest
// ─────────────────────────────────────────────────────────────────────────────
router.get("/latest", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const childId  = req.user.childId;

    let query = { status: { $in: ["scored", "ai_done", "submitted"] } };

    if (req.user.role === "parent") {
      const children = await Child.find({ parent_id: parentId }).select("_id").lean();
      query.child_id = { $in: children.map((c) => c._id) };
    } else if (req.user.role === "child") {
      query.child_id = childId;
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const attempt = await QuizAttempt.findOne(query)
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    if (!attempt) return res.json(null);
    const child = await Child.findById(attempt.child_id).lean();
    return res.json(normalizeQuizAttempt(attempt, child));
  } catch (err) {
    console.error("GET /api/results/latest error:", err);
    return res.status(500).json({ error: "Failed to fetch latest result" });
  }
});

// GET /api/results/latest/by-userid (legacy no-op — safe stub)
router.get("/latest/by-userid", (req, res) => res.json(null));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/latest/by-username
// ✅ FIX-3: Added verifyToken + requireAuth + ownership check
// ─────────────────────────────────────────────────────────────────────────────
router.get("/latest/by-username", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || "").trim();
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();

    if (!username) return res.status(400).json({ error: "username required" });

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json(null);

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const q = {
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quiz_name) q.quiz_name = quiz_name;
    if (subject)   q.subject   = subject;

    let attempts = await QuizAttempt.find(q).sort({ submitted_at: -1 }).lean();

    if (subject && !quiz_name) {
      attempts = attempts.filter(
        (a) => a.subject === subject || inferSubjectFromQuizName(a.quiz_name) === subject
      );
    }

    if (!attempts.length) return res.json(null);
    return res.json(normalizeQuizAttempt(attempts[0], child));
  } catch (err) {
    console.error("GET /api/results/latest/by-username error:", err);
    return res.status(500).json({ error: "Failed to fetch latest result by username" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/latest/by-filters
// ✅ FIX-4: Added verifyToken + requireAuth + ownership check
// ─────────────────────────────────────────────────────────────────────────────
router.get("/latest/by-filters", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || req.query.email || "").trim();
    const quiz_name = String(req.query.quiz_name || req.query.test_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();

    if (!username) return res.json(null);

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json(null);

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const q = {
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quiz_name) q.quiz_name = quiz_name;

    let attempts = await QuizAttempt.find(q).sort({ submitted_at: -1 }).lean();

    if (subject && !quiz_name) {
      attempts = attempts.filter(
        (a) => a.subject === subject || inferSubjectFromQuizName(a.quiz_name) === subject
      );
    }

    if (!attempts.length) return res.json(null);
    return res.json(normalizeQuizAttempt(attempts[0], child));
  } catch (err) {
    console.error("GET /api/results/latest/by-filters error:", err);
    return res.status(500).json({ error: "Failed to fetch result by filters" });
  }
});

// GET /api/results/by-email (legacy — returns [])
router.get("/by-email", (req, res) => res.json([]));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/by-username
// ─────────────────────────────────────────────────────────────────────────────
router.get("/by-username", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || "").trim();
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();

    if (!username) return res.status(400).json({ error: "username required" });

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json([]);

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const q = {
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quiz_name) q.quiz_name = quiz_name;

    let attempts = await QuizAttempt.find(q).sort({ submitted_at: -1 }).lean();

    if (subject && !quiz_name) {
      attempts = attempts.filter(
        (a) => a.subject === subject || inferSubjectFromQuizName(a.quiz_name) === subject
      );
    }

    return res.json(attempts.map((a) => normalizeQuizAttempt(a, child)));
  } catch (err) {
    console.error("GET /api/results/by-username error:", err);
    return res.status(500).json({ error: "Failed to fetch results by username" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/quizzes
// ✅ FIX-6: Added verifyToken + requireAuth + ownership check
// ─────────────────────────────────────────────────────────────────────────────
router.get("/quizzes", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const username = String(req.query.username || "").trim();

    let child = null;
    if (username) {
      child = await Child.findOne({ username: username.toLowerCase() }).lean();
    }

    if (!child) return res.json({ quizNames: [] });

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const quizNames = await QuizAttempt.distinct("quiz_name", {
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    });

    const cleaned = (quizNames || [])
      .filter((q) => q && String(q).trim())
      .map((q) => String(q).trim())
      .sort((a, b) => a.localeCompare(b));

    return res.json({ quizNames: cleaned });
  } catch (err) {
    console.error("GET /api/results/quizzes error:", err);
    return res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/check-submission/:username
// ✅ FIX-5: Added verifyToken + requireAuth + ownership check
// ─────────────────────────────────────────────────────────────────────────────
router.get("/check-submission/:username", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 10 * 60 * 1000);

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json({ submitted: false });

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const attempt = await QuizAttempt.findOne({
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
      submitted_at: { $gte: since },
    }).sort({ submitted_at: -1 }).lean();

    if (attempt) {
      return res.json({
        submitted: true,
        result: {
          response_id: attempt.attempt_id,
          quiz_name:   attempt.quiz_name,
          score:       attempt.score,
          grade:       attempt.score?.grade || "",
        },
      });
    }

    const writing = await Writing.findOne({
      child_id: child._id,
      submitted_at: { $gte: since },
    }).sort({ submitted_at: -1 }).lean();

    if (writing) {
      return res.json({
        submitted: true,
        result: {
          response_id: writing.response_id,
          quiz_name:   writing.quiz_name,
          score:       null,
          grade:       "",
          isWriting:   true,
        },
      });
    }

    return res.json({ submitted: false });
  } catch (err) {
    console.error("GET /api/results/check-submission error:", err);
    return res.status(500).json({ error: "Failed to check submission" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/:responseId
// ✅ FIX-2: Added verifyToken + requireAuth + ownership check.
//    Previously had ZERO auth — any anonymous request returned full child data.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:responseId", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const id = String(req.params.responseId || "").trim();
    if (!id) return res.status(400).json({ error: "responseId required" });

    const attempt = await QuizAttempt.findOne({
      attempt_id: id,
      status: { $ne: "in_progress" },
    }).lean();

    if (!attempt) return res.json(null);

    // ✅ Ownership check
    const owned = await assertResultOwnership(req, attempt.child_id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const child = await Child.findById(attempt.child_id).lean();
    return res.json(normalizeQuizAttempt(attempt, child));
  } catch (err) {
    console.error("GET /api/results/:responseId error:", err);
    return res.status(500).json({ error: "Failed to fetch result" });
  }
});

// POST /api/results/webhook — legacy FlexiQuiz no-op
router.post("/webhook", (req, res) => {
  console.log("⚠️ Legacy FlexiQuiz webhook hit — ignored");
  return res.status(200).json({ message: "Received — native quiz system active" });
});

module.exports = router;
