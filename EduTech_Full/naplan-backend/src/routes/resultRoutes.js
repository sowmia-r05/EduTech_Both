// routes/resultRoutes.js
const express = require("express");
const router = express.Router();
const Result = require("../models/result");
const Writing = require("../models/writing");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

// ─── GET all results ───
router.get("/", async (req, res) => {
  try {
    const results = await Result.find().sort({ date_submitted: -1, createdAt: -1 });
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ─── Latest result ───
router.get("/latest", async (req, res) => {
  try {
    const doc = await Result.findOne().sort({ date_submitted: -1, createdAt: -1 });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result" });
  }
});

// ─── Latest result by email ───
router.get("/latest/by-email", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });
    const doc = await Result.findOne({ "user.email_address": email }).sort({ date_submitted: -1, createdAt: -1 });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result by email" });
  }
});

// ─── Latest result by user_id ───
router.get("/latest/by-userid", async (req, res) => {
  try {
    const userId = String(req.query.user_id || "").trim();
    if (!userId) return res.status(400).json({ error: "user_id required" });
    const doc = await Result.findOne({ "user.user_id": userId }).sort({ date_submitted: -1, createdAt: -1 });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result by user_id" });
  }
});

// ─── Latest result by username ───
router.get("/latest/by-username", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject = String(req.query.subject || "").trim();
    const q = { "user.user_name": username };
    if (quiz_name) q.quiz_name = quiz_name;
    if (subject && !quiz_name) {
      let results = await Result.find(q).sort({ date_submitted: -1, createdAt: -1 });
      results = results.filter((r) => inferSubjectFromQuizName(r.quiz_name) === subject);
      return res.json(results[0] || null);
    }
    const doc = await Result.findOne(q).sort({ date_submitted: -1, createdAt: -1 });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result by username" });
  }
});

// ─── Latest result by filters ───
router.get("/latest/by-filters", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const user_id = String(req.query.user_id || req.query.userid || "").trim();
    const year = String(req.query.year || "").trim();
    const subject = String(req.query.subject || "").trim();
    const quiz_name = String(req.query.quiz_name || req.query.test_name || "").trim();
    if (!email && !user_id) return res.status(400).json({ error: "email or user_id required" });
    const q = {};
    if (email) q["user.email_address"] = email;
    if (user_id) q["user.user_id"] = user_id;
    if (quiz_name) {
      q.quiz_name = quiz_name;
    } else if (year || subject) {
      const parts = [];
      if (year) parts.push(escapeRegex(year));
      if (subject) parts.push(escapeRegex(subject));
      q.quiz_name = { $regex: parts.join(".*"), $options: "i" };
    }
    const doc = await Result.findOne(q).sort({ date_submitted: -1, createdAt: -1 });
    return res.json(doc || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch latest result by filters" });
  }
});

// ─── All results by username ───
router.get("/by-username", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });
    const quiz_name = String(req.query.quiz_name || "").trim();
    const subject = String(req.query.subject || "").trim();
    const q = { "user.user_name": username };
    if (quiz_name) q.quiz_name = quiz_name;
    let results = await Result.find(q).sort({ date_submitted: -1, createdAt: -1 });
    if (subject && results.length > 0) {
      results = results.filter((r) => inferSubjectFromQuizName(r.quiz_name) === subject);
    }
    return res.json(results || []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results by username" });
  }
});

// ─── All results by email ───
router.get("/by-email", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const quiz_name = String(req.query.quiz_name || "").trim();
    if (!email) return res.status(400).json({ error: "email required" });
    const q = { "user.email_address": email };
    if (quiz_name) q.quiz_name = quiz_name;
    const results = await Result.find(q).sort({ date_submitted: -1, createdAt: -1 });
    return res.json(results || []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch results by email" });
  }
});

/**
 * ✅ Check if a quiz was submitted recently (used by QuizPlayer polling)
 *
 * GET /api/results/check-submission/:username?since=ISO&quiz_name=QUIZ_NAME
 *
 * Matching strategy (in order):
 *   1. user.user_name + quiz_name + since timestamp (best match)
 *   2. user.user_name + since timestamp (no quiz_name filter)
 *   3. quiz_name + since timestamp (handles null user_name from webhook)
 *   4. NEVER falls back to "any result" — that caused false positives
 *
 * MUST be BEFORE /:responseId
 */
router.get("/check-submission/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "username required" });

    const quiz_name = String(req.query.quiz_name || "").trim();
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 10 * 60 * 1000);

    const timeFilter = {
      $or: [
        { date_submitted: { $gte: since } },
        { createdAt: { $gte: since } },
      ],
    };

    // Strategy 1: Match by username + quiz_name + time
    if (quiz_name) {
      const result = await Result.findOne({
        "user.user_name": username,
        quiz_name: quiz_name,
        ...timeFilter,
      }).sort({ date_submitted: -1, createdAt: -1 }).lean();

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
    }

    // Strategy 2: Match by username + time (no quiz_name filter)
    const result2 = await Result.findOne({
      "user.user_name": username,
      ...timeFilter,
    }).sort({ date_submitted: -1, createdAt: -1 }).lean();

    if (result2) {
      return res.json({
        submitted: true,
        result: {
          response_id: result2.response_id,
          quiz_name: result2.quiz_name,
          score: result2.score,
          grade: result2.score?.grade || "",
        },
      });
    }

    // Strategy 3: Match by quiz_name + time (handles null user_name)
    if (quiz_name) {
      const result3 = await Result.findOne({
        quiz_name: quiz_name,
        ...timeFilter,
      }).sort({ date_submitted: -1, createdAt: -1 }).lean();

      if (result3) {
        return res.json({
          submitted: true,
          result: {
            response_id: result3.response_id,
            quiz_name: result3.quiz_name,
            score: result3.score,
            grade: result3.score?.grade || "",
          },
        });
      }
    }

    // Strategy 4: Check Writing collection (same logic)
    const writingTimeFilter = {
      $or: [
        { submitted_at: { $gte: since } },
        { createdAt: { $gte: since } },
      ],
    };

    // Try username match first
    let writing = await Writing.findOne({
      "user.user_name": username,
      ...(quiz_name ? { quiz_name } : {}),
      ...writingTimeFilter,
    }).sort({ submitted_at: -1, createdAt: -1 }).lean();

    // Then quiz_name match (handles null user_name)
    if (!writing && quiz_name) {
      writing = await Writing.findOne({
        quiz_name: quiz_name,
        ...writingTimeFilter,
      }).sort({ submitted_at: -1, createdAt: -1 }).lean();
    }

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

/**
 * ✅ GET one result by response id
 * ⚠️ MUST be AFTER all named routes
 */
router.get("/:responseId", async (req, res) => {
  try {
    const id = String(req.params.responseId || "").trim();
    const result = await Result.findOne({
      $or: [{ response_id: id }, { responseId: id }],
    }).sort({ attempt: -1, date_submitted: -1, createdAt: -1 }).lean();
    return res.json(result || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch result" });
  }
});

/**
 * ✅ POST /webhook
 */
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("Results webhook hit!");
    const eventId = payload.eventId || payload.event_id || payload.eventID;
    const responseId = payload.responseId || payload.response_id || payload.responseID;
    const quizId = payload.quizId || payload.quiz_id || payload.quizID;
    const quizName = payload.quizName || payload.quiz_name;
    if (!eventId) return res.status(400).json({ error: "Missing field: eventId/event_id" });
    if (!responseId) return res.status(400).json({ error: "Missing field: responseId/response_id" });
    if (!quizId) return res.status(400).json({ error: "Missing field: quizId/quiz_id" });
    if (!quizName) return res.status(400).json({ error: "Missing field: quizName/quiz_name" });
    const topicBreakdown = payload.topicBreakdown;
    if (topicBreakdown && typeof topicBreakdown === "object") {
      for (const [topic, scoreObj] of Object.entries(topicBreakdown)) {
        if (!scoreObj || typeof scoreObj.scored !== "number" || typeof scoreObj.total !== "number") {
          return res.status(400).json({ error: `Invalid score for topic ${topic}` });
        }
      }
    }
    const result = new Result(payload);
    await result.save();
    return res.status(201).json({ message: "Result saved successfully", resultId: result._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
