const router = require("express").Router();
const Writing = require("../models/writing");

/**
 * Writing routes (MongoDB)
 *
 * Base path mounted in app.js:
 *   /api/writing
 *
 * Endpoints used by frontend:
 *   GET /api/writing/quizzes?email=...
 *   GET /api/writing/latest?email=...&quiz=...
 */

// ✅ List distinct quiz names for an email (dropdown)
router.get("/quizzes", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });

  const quizNames = await Writing.distinct("quiz_name", { "user.email_address": email });
  // Remove empty/null + sort for stable dropdown
  const cleaned = (quizNames || [])
    .filter((q) => q && String(q).trim())
    .map((q) => String(q).trim())
    .sort((a, b) => a.localeCompare(b));

  return res.json({ email, quizNames: cleaned });
});

// ✅ Latest writing submission by email + quiz name
router.get("/latest", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  const quiz = String(req.query.quiz || "").trim();

  if (!email) return res.status(400).json({ error: "email required" });
  if (!quiz) return res.status(400).json({ error: "quiz required" });

  const doc = await Writing.findOne({ "user.email_address": email, quiz_name: quiz }).sort({
    submitted_at: -1,
    date_submitted: -1,
    date_created: -1,
    createdAt: -1,
  });

  return res.json(doc || null);
});

// ✅ Latest writing submission by email (optional helper)
router.get("/latest/by-email", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });

  const doc = await Writing.findOne({ "user.email_address": email }).sort({
    submitted_at: -1,
    date_submitted: -1,
    date_created: -1,
    createdAt: -1,
  });

  return res.json(doc || null);
});

// ✅ Get all writing submissions (latest first)
router.get("/", async (req, res) => {
  const results = await Writing.find().sort({ submitted_at: -1, date_submitted: -1, createdAt: -1 });
  res.json(results);
});

// ✅ Get all attempts by email + quiz This is for Writing
router.get("/by-email-and-quiz", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  const quiz = String(req.query.quiz || "").trim();

  if (!email) return res.status(400).json({ error: "email required" });
  if (!quiz) return res.status(400).json({ error: "quiz required" });

  const results = await Writing.find({
    "user.email_address": email,
    quiz_name: quiz,
  })
    .sort({ submitted_at: -1 })
    .select("submitted_at ai.evaluated_at response_id attempt");

  res.json(results);
});

// ✅ Get one writing submission by response_id
// ✅ Get latest writing submission by response_id (latest attempt)
router.get("/:responseId", async (req, res) => {
  const id = String(req.params.responseId || "").trim();
  if (!id) return res.status(400).json({ error: "responseId required" });

  const result = await Writing.findOne({ response_id: id }).sort({
    attempt: -1,          // ✅ latest attempt first
    submitted_at: -1,     // ✅ newest submission first
    date_submitted: -1,
    date_created: -1,
    createdAt: -1,
    _id: -1,              // ✅ final fallback
  });

  res.json(result || null);
});


module.exports = router;
