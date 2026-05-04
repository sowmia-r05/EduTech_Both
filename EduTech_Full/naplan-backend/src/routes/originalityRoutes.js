/**
 * originalityRoutes.js
 *
 * Admin routes for the originality system:
 *
 *   POST  /api/admin/originality/check/:questionId
 *         → run a fresh check on a specific question and persist results
 *
 *   POST  /api/admin/originality/check-quiz/:quizId
 *         → batch-check every question in a quiz (background job)
 *
 *   GET   /api/admin/originality/audit
 *         → list all questions whose status != "clean"
 *           query params: status, quiz_id, limit, skip
 *
 *   GET   /api/admin/originality/stats
 *         → counts by status across the whole bank
 *
 *   GET   /api/admin/originality/corpus/stats
 *         → corpus_items counts by publisher / subject / year_level
 *
 * Place at: src/routes/originalityRoutes.js
 *
 * Mount in app.js:
 *   const originalityRoutes = require("./routes/originalityRoutes");
 *   app.use("/api/admin/originality", originalityRoutes);
 */

const express = require("express");
const router  = express.Router();

const connectDB  = require("../config/db");
const Question   = require("../models/question");
const CorpusItem = require("../models/corpusItem");
const { requireAdmin } = require("../middleware/adminAuth");
const { checkOriginality } = require("../utils/originalityCheck");

router.use(requireAdmin);

// ═══════════════════════════════════════════════════════════════
// Helper: run check + persist result on the Question doc
// ═══════════════════════════════════════════════════════════════

async function runAndPersist(question) {
  const result = await checkOriginality(
    { text: question.text, options: question.options },
    {
      excludeQuestionId: question.question_id,
      yearLevel:         question.year_level,
      subject:           question.subject,
    }
  );

  await Question.updateOne(
    { question_id: question.question_id },
    {
      $set: {
        "originality.status":             result.status,
        "originality.exact_hash":         result.fingerprints.exact_hash,
        "originality.structural_hash":    result.fingerprints.structural_hash,
        "originality.embedding":          result.embedding,
        "originality.embedding_model":    process.env.EMBEDDING_MODEL || null,
        "originality.layers":             result.layers,
        "originality.last_checked_at":    result.checked_at,
      },
    }
  );

  return result;
}

// ═══════════════════════════════════════════════════════════════
// POST /check/:questionId — single question
// ═══════════════════════════════════════════════════════════════

router.post("/check/:questionId", async (req, res) => {
  try {
    await connectDB();
    const q = await Question.findOne({ question_id: req.params.questionId }).lean();
    if (!q) return res.status(404).json({ error: "Question not found" });

    const result = await runAndPersist(q);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("originality/check error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /check-quiz/:quizId — batch over a whole quiz
// (runs in background; client polls /audit?quiz_id= for progress)
// ═══════════════════════════════════════════════════════════════

const quizCheckProgress = {}; // quizId → { status, total, done, failed, started_at }

router.post("/check-quiz/:quizId", async (req, res) => {
  try {
    await connectDB();
    const { quizId } = req.params;

    if (quizCheckProgress[quizId]?.status === "running") {
      return res.json({ ok: true, message: "Already running", ...quizCheckProgress[quizId] });
    }

    const questions = await Question.find({ quiz_ids: quizId })
      .select("question_id text options year_level subject")
      .lean();

    if (questions.length === 0) {
      return res.status(404).json({ error: "No questions found for this quiz" });
    }

    quizCheckProgress[quizId] = {
      status: "running",
      total: questions.length,
      done: 0,
      failed: 0,
      started_at: new Date(),
    };

    // Fire and forget — client polls /audit
    (async () => {
      for (const q of questions) {
        try {
          await runAndPersist(q);
          quizCheckProgress[quizId].done++;
        } catch (err) {
          console.error(`check-quiz ${q.question_id}:`, err.message);
          quizCheckProgress[quizId].failed++;
        }
      }
      quizCheckProgress[quizId].status = "done";
      quizCheckProgress[quizId].finished_at = new Date();
    })();

    return res.json({
      ok: true,
      message: `Checking ${questions.length} questions in background`,
      ...quizCheckProgress[quizId],
    });
  } catch (err) {
    console.error("originality/check-quiz error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/check-quiz/:quizId/status", (req, res) => {
  const p = quizCheckProgress[req.params.quizId];
  if (!p) return res.status(404).json({ error: "No check running for this quiz" });
  return res.json({ ok: true, ...p });
});

// ═══════════════════════════════════════════════════════════════
// GET /audit — list flagged questions for the tutor UI
// ═══════════════════════════════════════════════════════════════

router.get("/audit", async (req, res) => {
  try {
    await connectDB();
    const {
      status,           // "clean" | "review_semantic" | "blocked_*" | "any_flag"
      quiz_id,
      limit = 50,
      skip  = 0,
    } = req.query;

    const filter = {};
    if (quiz_id) filter.quiz_ids = quiz_id;

    if (status === "any_flag") {
      filter["originality.status"] = { $ne: "clean", $exists: true };
    } else if (status) {
      filter["originality.status"] = status;
    }

    const [items, total] = await Promise.all([
      Question.find(filter)
        .select("question_id text quiz_ids originality")
        .sort({ "originality.last_checked_at": -1 })
        .skip(Number(skip))
        .limit(Math.min(Number(limit), 200))
        .lean(),
      Question.countDocuments(filter),
    ]);

    return res.json({ ok: true, total, items });
  } catch (err) {
    console.error("originality/audit error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /stats — counts by status
// ═══════════════════════════════════════════════════════════════

router.get("/stats", async (req, res) => {
  try {
    await connectDB();
    const agg = await Question.aggregate([
      { $group: { _id: { $ifNull: ["$originality.status", "unchecked"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const stats = Object.fromEntries(agg.map((row) => [row._id, row.count]));
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    return res.json({ ok: true, total, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /corpus/stats — corpus_items breakdown
// ═══════════════════════════════════════════════════════════════

router.get("/corpus/stats", async (req, res) => {
  try {
    await connectDB();
    const [byPublisher, bySubject, byYear, total, withEmbedding] = await Promise.all([
      CorpusItem.aggregate([
        { $group: { _id: "$source.publisher", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      CorpusItem.aggregate([
        { $group: { _id: "$source.subject", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      CorpusItem.aggregate([
        { $group: { _id: "$source.year_level", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      CorpusItem.countDocuments({}),
      CorpusItem.countDocuments({ embedding: { $exists: true, $ne: null } }),
    ]);

    return res.json({
      ok: true,
      total,
      with_embedding: withEmbedding,
      missing_embedding: total - withEmbedding,
      by_publisher: byPublisher,
      by_subject: bySubject,
      by_year_level: byYear,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;