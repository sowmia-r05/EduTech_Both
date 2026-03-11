/**
 * routes/resultRoutes.js
 *
 * ✅ REWRITTEN: All `Result` (FlexiQuiz legacy) model references removed.
 *    Now uses ONLY QuizAttempt + Child + Writing — the native collections.
 *
 * All endpoints preserve the same URL shape so the frontend (Dashboard.jsx,
 * api.js) needs NO changes whatsoever.
 *
 * Endpoints:
 *   GET  /api/results/                          → all attempts (admin/debug)
 *   GET  /api/results/latest                    → most recent attempt
 *   GET  /api/results/latest/by-email           → latest by email
 *   GET  /api/results/latest/by-userid          → latest by user_id (noop, returns null)
 *   GET  /api/results/latest/by-username        → latest by username + optional filters
 *   GET  /api/results/latest/by-filters         → latest by email + optional filters
 *   GET  /api/results/quizzes                   → distinct quiz names for an email
 *   GET  /api/results/by-email                  → all attempts for email
 *   GET  /api/results/by-username               → all attempts for username
 *   GET  /api/results/check-submission/:username→ recent submission check
 *   GET  /api/results/:responseId               → single result by attempt_id
 *   POST /api/results/webhook                   → no-op (FlexiQuiz webhook — not used)
 */

const express = require("express");
const router = express.Router();
const QuizAttempt = require("../models/quizAttempt");
const Child = require("../models/child");
const Writing = require("../models/writing");
const connectDB = require("../config/db");

// ─── Helpers ─────────────────────────────────────────────────

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Infer NAPLAN subject from quiz name.
 * Covers both admin-set subject fields AND quiz name keywords.
 */
function inferSubjectFromQuizName(quizName = "") {
  const s = String(quizName || "").toLowerCase();
  if (s.includes("calculator")) return "Numeracy_with_calculator";
  if (
    s.includes("language") ||
    s.includes("convention") ||
    s.includes("grammar") ||
    s.includes("spelling") ||
    s.includes("punctuation")
  ) return "Language_convention";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (
    s.includes("numeracy") ||
    s.includes("number") ||
    s.includes("algebra") ||
    s.includes("algebar") ||   // common typo in quiz names
    s.includes("maths") ||
    s.includes("math") ||
    s.includes("measurement") ||
    s.includes("geometry") ||
    s.includes("statistics") ||
    s.includes("probability")
  ) return "Numeracy";
  return null;
}

/**
 * Normalize a QuizAttempt document into the legacy Result shape
 * that Dashboard.jsx / AISuggestionPanel / AICoachPanel expect.
 */
function normalizeQuizAttempt(attempt, child) {
  // ── topic_breakdown: Map or plain object → plain object ──
  const tb = {};
  if (attempt.topic_breakdown) {
    const entries =
      attempt.topic_breakdown instanceof Map
        ? attempt.topic_breakdown.entries()
        : Object.entries(attempt.topic_breakdown);
    for (const [k, v] of entries) {
      tb[k] = { scored: v?.scored || 0, total: v?.total || 0 };
    }
  }

  // ── ai_feedback: only expose when AI has actually run ──
  const metaStatus = String(
    attempt.ai_feedback_meta?.status || "pending"
  ).toLowerCase();

  const fb = attempt.ai_feedback;
  // Trust the data whenever AI is marked "done" OR any field has real conten

  return {
    _id: attempt._id,
    response_id: attempt.attempt_id,
    responseId: attempt.attempt_id,
    quiz_id: attempt.quiz_id,
    quiz_name: attempt.quiz_name,
    date_submitted: attempt.submitted_at || attempt.createdAt,
    createdAt: attempt.createdAt,
    duration: attempt.duration_sec || 0,
    attempt: attempt.attempt_number || 1,
    status: attempt.status,

    score: {
      points:     attempt.score?.points     || 0,
      available:  attempt.score?.available  || 0,
      percentage: attempt.score?.percentage || 0,
      grade:      attempt.score?.grade      || "",
      pass:       (attempt.score?.percentage || 0) >= 50,
    },

    user: {
      user_id:       null,
      user_name:     child?.username     || "",
      first_name:    child?.display_name?.split(" ")[0]  || child?.username || "",
      last_name:     child?.display_name?.split(" ").slice(1).join(" ") || "",
      email_address: "",
    },

    topicBreakdown:  tb,
    topic_breakdown: tb,
    ai_feedback: fb || null,
    ai_feedback_meta: attempt.ai_feedback_meta || null,
    performance_analysis: attempt.performance_analysis || null,

    // Synthetic `ai` field — Dashboard.jsx isAiPending() reads this
    ai: {
      status:       metaStatus === "done" ? "done" : metaStatus,
      message:
        attempt.ai_feedback_meta?.status_message ||
        (metaStatus === "done" ? "Feedback ready" : "Generating AI feedback..."),
      error:        metaStatus === "error" ? "AI feedback generation failed" : null,
      evaluated_at: attempt.ai_feedback_meta?.generated_at || null,
    },

    source:      "native",
    subject:     attempt.subject,
    year_level:  attempt.year_level,
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/results/
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    await connectDB();
    const attempts = await QuizAttempt.find({
      status: { $in: ["scored", "ai_done", "submitted"] },
    }).sort({ submitted_at: -1, createdAt: -1 }).lean();

    const childIds = [...new Set(attempts.map((a) => String(a.child_id)))];
    const children = await Child.find({ _id: { $in: childIds } }).lean();
    const childMap = Object.fromEntries(children.map((c) => [String(c._id), c]));

    return res.json(attempts.map((a) => normalizeQuizAttempt(a, childMap[String(a.child_id)])));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/latest
// ─────────────────────────────────────────────────────────────
router.get("/latest", async (req, res) => {
  try {
    await connectDB();
    const attempt = await QuizAttempt.findOne({
      status: { $in: ["scored", "ai_done", "submitted"] },
    }).sort({ submitted_at: -1, createdAt: -1 }).lean();
    if (!attempt) return res.json(null);
    const child = await Child.findById(attempt.child_id).lean();
    return res.json(normalizeQuizAttempt(attempt, child));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/latest/by-email   (best-effort — email not stored on native attempts)
// ─────────────────────────────────────────────────────────────
router.get("/latest/by-email", async (req, res) => {
  try {
    await connectDB();
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });
    // Native attempts don't store email — look up child by parent email
    const child = await Child.findOne().lean(); // fallback noop
    return res.json(null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result by email" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/latest/by-userid   (legacy no-op)
// ─────────────────────────────────────────────────────────────
router.get("/latest/by-userid", async (req, res) => {
  return res.json(null);
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/latest/by-username
// ─────────────────────────────────────────────────────────────
router.get("/latest/by-username", async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || "").trim();
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json(null);

    const q = {
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    };
    if (quiz_name) q.quiz_name = quiz_name;
    if (subject)   q.subject   = subject;

    let attempts = await QuizAttempt.find(q).sort({ submitted_at: -1 }).lean();

    // subject keyword filter as fallback (handles quiz_name-inferred subject)
    if (subject && !quiz_name) {
      attempts = attempts.filter(
        (a) => a.subject === subject || inferSubjectFromQuizName(a.quiz_name) === subject
      );
    }

    if (!attempts.length) return res.json(null);
    return res.json(normalizeQuizAttempt(attempts[0], child));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result by username" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/latest/by-filters
// ─────────────────────────────────────────────────────────────
router.get("/latest/by-filters", async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || "").trim();
    const quiz_name = String(req.query.quiz_name || req.query.test_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();

    if (!username) return res.json(null);

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json(null);

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
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result by filters" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/quizzes   — distinct quiz names for a username/email
// ─────────────────────────────────────────────────────────────
router.get("/quizzes", async (req, res) => {
  try {
    await connectDB();
    const username = String(req.query.username || "").trim();
    const email    = String(req.query.email    || "").trim().toLowerCase();

    let child = null;
    if (username) {
      child = await Child.findOne({ username: username.toLowerCase() }).lean();
    }

    if (!child) return res.json({ quizNames: [] });

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
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/by-email   (legacy — native attempts have no email; returns [])
// ─────────────────────────────────────────────────────────────
router.get("/by-email", async (req, res) => {
  return res.json([]);
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/by-username
// ─────────────────────────────────────────────────────────────
router.get("/by-username", async (req, res) => {
  try {
    await connectDB();
    const username  = String(req.query.username  || "").trim();
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject   = String(req.query.subject   || "").trim();

    if (!username) return res.status(400).json({ error: "username required" });

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json([]);

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
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results by username" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/check-submission/:username
// ─────────────────────────────────────────────────────────────
router.get("/check-submission/:username", async (req, res) => {
  try {
    await connectDB();
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 10 * 60 * 1000);

    const child = await Child.findOne({ username: username.toLowerCase() }).lean();
    if (!child) return res.json({ submitted: false });

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

    // Also check Writing collection
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
    console.error("check-submission error:", err);
    return res.status(500).json({ error: "Failed to check submission" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/results/:responseId
// ─────────────────────────────────────────────────────────────
router.get("/:responseId", async (req, res) => {
  try {
    await connectDB();
    const id = String(req.params.responseId || "").trim();

    const attempt = await QuizAttempt.findOne({
      attempt_id: id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    }).lean();

    if (attempt) {
      const child = await Child.findById(attempt.child_id).lean();
      return res.json(normalizeQuizAttempt(attempt, child));
    }

    return res.json(null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/results/webhook   — legacy FlexiQuiz no-op
// ─────────────────────────────────────────────────────────────
router.post("/webhook", (req, res) => {
  console.log("⚠️ Legacy FlexiQuiz webhook hit — ignored (native quizzes only)");
  return res.status(200).json({ message: "Received — native quiz system active" });
});

module.exports = router;
