// routes/resultRoutes.js
const express = require("express");
const router = express.Router();
const Result = require("../models/result");

// Small helper to escape regex special chars
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ✅ NEW: Infer subject from quiz name (same logic as catalogRoutes.js)
function inferSubjectFromQuizName(quizName = "") {
  const s = String(quizName || "").toLowerCase();
  if (s.includes("calculator")) return "Numeracy_with_calculator";
  if (s.includes("language") || s.includes("convention") || s.includes("lang"))
    return "Language_convention";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (s.includes("numeracy")) return "Numeracy";
  return null;
}

/**
 * ✅ GET all results (stable sort)
 * - Prefer date_submitted (FlexiQuiz) then createdAt
 */
router.get("/", async (req, res) => {
  try {
    const results = await Result.find().sort({
      date_submitted: -1,
      createdAt: -1,
    });
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

/**
 * ✅ Latest result (quick testing)
 */
router.get("/latest", async (req, res) => {
  try {
    const doc = await Result.findOne().sort({
      date_submitted: -1,
      createdAt: -1,
    });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result" });
  }
});

/**
 * ✅ Latest result by email
 */
router.get("/latest/by-email", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });

    const doc = await Result.findOne({ "user.email_address": email }).sort({
      date_submitted: -1,
      createdAt: -1,
    });

    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to fetch latest result by email" });
  }
});

/**
 * ✅ Latest result by FlexiQuiz user_id
 */
router.get("/latest/by-userid", async (req, res) => {
  try {
    const userId = String(req.query.user_id || "").trim();
    if (!userId) return res.status(400).json({ error: "user_id required" });

    const doc = await Result.findOne({ "user.user_id": userId }).sort({
      date_submitted: -1,
      createdAt: -1,
    });

    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to fetch latest result by user_id" });
  }
});

/**
 * ✅ NEW: Latest result by username + optional filters
 * Query params:
 *   username (required) — child's unique FlexiQuiz user_name
 *   quiz_name (optional) — exact quiz name match
 *   subject (optional) — inferred subject filter
 */
router.get("/latest/by-username", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject = String(req.query.subject || "").trim();

    const q = { "user.user_name": username };
    if (quiz_name) q.quiz_name = quiz_name;

    // If subject but no quiz_name, filter in-memory
    if (subject && !quiz_name) {
      let results = await Result.find(q).sort({
        date_submitted: -1,
        createdAt: -1,
      });
      results = results.filter(
        (r) => inferSubjectFromQuizName(r.quiz_name) === subject,
      );
      return res.json(results[0] || null);
    }

    const doc = await Result.findOne(q).sort({
      date_submitted: -1,
      createdAt: -1,
    });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to fetch latest result by username" });
  }
});

/**
 * ✅ Latest (non-writing) result by email + user_id + optional filters
 * Query params:
 *   email, user_id (at least one required)
 *   year=Year3|Year5|Year7|Year9 (optional; inferred from quiz_name)
 *   subject=Numeracy|Reading|Language_convention|Numeracy_with_calculator (optional; inferred)
 *   quiz_name (optional; exact match)
 */
router.get("/latest/by-filters", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    const user_id = String(req.query.user_id || req.query.userid || "").trim();
    const year = String(req.query.year || "").trim();
    const subject = String(req.query.subject || "").trim();
    const quiz_name = String(
      req.query.quiz_name || req.query.test_name || "",
    ).trim();

    if (!email && !user_id)
      return res.status(400).json({ error: "email or user_id required" });

    const q = {};
    if (email) q["user.email_address"] = email;
    if (user_id) q["user.user_id"] = user_id;

    if (quiz_name) {
      q.quiz_name = quiz_name;
    } else if (year || subject) {
      const parts = [];
      if (year) parts.push(escapeRegex(year));
      if (subject) parts.push(escapeRegex(subject));
      const pattern = parts.join(".*");
      q.quiz_name = { $regex: pattern, $options: "i" };
    }

    const doc = await Result.findOne(q).sort({
      date_submitted: -1,
      createdAt: -1,
    });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result by filters" });
  }
});

/**
 * ✅ List distinct quiz names for an email (dropdown helper)
 */
router.get("/quizzes", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });

    const quizNames = await Result.distinct("quiz_name", {
      "user.email_address": email,
    });

    const cleaned = (quizNames || [])
      .filter((q) => q && String(q).trim())
      .map((q) => String(q).trim())
      .sort((a, b) => a.localeCompare(b));

    return res.json({ email, quizNames: cleaned });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

/**
 * ✅ NEW: Get ALL results by username (sibling-safe — doesn't mix children sharing same email)
 * Query params:
 *   username (required) — the child's unique FlexiQuiz user_name
 *   quiz_name (optional) — filter to a specific quiz
 *   subject (optional) — filter by inferred subject (e.g. "Reading", "Numeracy")
 */
router.get("/by-username", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject = String(req.query.subject || "").trim();

    const q = { "user.user_name": username };
    if (quiz_name) q.quiz_name = quiz_name;

    let results = await Result.find(q).sort({
      date_submitted: -1,
      createdAt: -1,
    });

    // Filter by inferred subject in-memory
    if (subject && results.length > 0) {
      results = results.filter(
        (r) => inferSubjectFromQuizName(r.quiz_name) === subject,
      );
    }

    return res.json(results || []);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to fetch results by username" });
  }
});

/**
 * ✅ Get ALL results by email (for dashboard filtering)
 */
router.get("/by-email", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    const quiz_name = String(req.query.quiz_name || "").trim();

    if (!email) return res.status(400).json({ error: "email required" });

    const q = { "user.email_address": email };

    if (quiz_name) {
      q.quiz_name = quiz_name;
    }

    const results = await Result.find(q).sort({
      date_submitted: -1,
      createdAt: -1,
    });

    return res.json(results || []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results by email" });
  }
});

/**
 * ✅ GET one result by response id
 * - supports both response_id and responseId
 */
router.get("/:responseId", async (req, res) => {
  try {
    const id = String(req.params.responseId || "").trim();

    // FlexiQuiz can reuse the same response_id across attempts (attempt=1,2,3...)
    // so we must sort and return the latest attempt.
    const result = await Result.findOne({
      $or: [{ response_id: id }, { responseId: id }],
    })
      .sort({ attempt: -1, date_submitted: -1, createdAt: -1 })
      .lean();

    return res.json(result || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result" });
  }
});

/**
 * ✅ POST /webhook
 * Accept BOTH payload styles:
 * 1) FlexiQuiz-ish (snake_case): event_id, response_id, quiz_id, quiz_name, user, points, score...
 * 2) Your custom (camelCase): eventId, responseId, quizId, quizName, student, score, topicBreakdown...
 */
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("Results webhook hit!");

    // Normalize required identifiers (support both formats)
    const eventId = payload.eventId || payload.event_id || payload.eventID;
    const responseId =
      payload.responseId || payload.response_id || payload.responseID;
    const quizId = payload.quizId || payload.quiz_id || payload.quizID;
    const quizName = payload.quizName || payload.quiz_name;

    if (!eventId)
      return res.status(400).json({ error: "Missing field: eventId/event_id" });
    if (!responseId)
      return res
        .status(400)
        .json({ error: "Missing field: responseId/response_id" });
    if (!quizId)
      return res.status(400).json({ error: "Missing field: quizId/quiz_id" });
    if (!quizName)
      return res
        .status(400)
        .json({ error: "Missing field: quizName/quiz_name" });

    // If topicBreakdown exists, validate it (your second code expects this)
    const topicBreakdown = payload.topicBreakdown;
    if (topicBreakdown && typeof topicBreakdown === "object") {
      for (const [topic, scoreObj] of Object.entries(topicBreakdown)) {
        if (
          !scoreObj ||
          typeof scoreObj.scored !== "number" ||
          typeof scoreObj.total !== "number"
        ) {
          return res
            .status(400)
            .json({ error: `Invalid score for topic ${topic}` });
        }
      }
    }

    const result = new Result(payload);
    await result.save();

    return res.status(201).json({
      message: "Result saved successfully",
      resultId: result._id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});
router.get("/check-submission/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    // "since" = ISO timestamp of when the quiz started (so we only find NEW submissions)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 10 * 60 * 1000); // default: last 10 min

    const result = await Result.findOne({
      "user.user_name": username,
      $or: [
        { date_submitted: { $gte: since } },
        { createdAt: { $gte: since } },
      ],
    })
      .sort({ date_submitted: -1, createdAt: -1 })
      .lean();

    if (result) {
      return res.json({
        submitted: true,
        result: {
          response_id: result.response_id,
          quiz_name: result.quiz_name,
          score: result.score,
          grade: result.score?.grade || "",
        },
      });
    }

    // Also check Writing collection
    const writing = await Writing.findOne({
      "user.user_name": username,
      $or: [
        { submitted_at: { $gte: since } },
        { createdAt: { $gte: since } },
      ],
    })
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    if (writing) {
      return res.json({
        submitted: true,
        result: {
          response_id: writing.response_id,
          quiz_name: writing.quiz_name,
          score: null,
          grade: "",
          isWriting: true,
        },
      });
    }

    return res.json({ submitted: false });
  } catch (err) {
    console.error("check-submission error:", err);
    return res.status(500).json({ error: "Failed to check submission" });
  }
});

module.exports = router;
