/**
 * originalityRoutes.js  (v5 — adds POST /web-verdict/:questionId)
 *
 * CHANGES FROM v4:
 *   ✅ Added POST /web-verdict/:questionId — saves manual Google-search verdicts
 *      Body: { verdict: "clean" | "suspicious" | "confirmed_copy" | "reset", note? }
 *      Saves to question.originality.web_verdict
 *
 * Existing endpoints kept exactly as before:
 *   POST  /check/:questionId
 *   POST  /check-quiz/:quizId
 *   GET   /check-quiz/:quizId/status
 *   POST  /check-quizzes
 *   GET   /check-quizzes/status
 *   POST  /scan-all
 *   GET   /audit
 *   POST  /web-verdict/:questionId   ← NEW
 *   GET   /stats
 *   GET   /corpus/stats
 */

const express = require("express");
const router  = express.Router();

const connectDB  = require("../config/db");
const Question   = require("../models/question");
const CorpusItem = require("../models/corpusItem");
const Quiz       = require("../models/quiz");
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
// ═══════════════════════════════════════════════════════════════

const quizCheckProgress = {};

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
      flagged: 0,
      started_at: new Date(),
    };

    (async () => {
      for (const q of questions) {
        try {
          const result = await runAndPersist(q);
          quizCheckProgress[quizId].done++;
          if (result?.status && result.status !== "clean") {
            quizCheckProgress[quizId].flagged++;
          }
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
// POST /check-quizzes — bulk multi-quiz check
// ═══════════════════════════════════════════════════════════════

const bulkProgress = { status: "idle" };

router.post("/check-quizzes", async (req, res) => {
  try {
    await connectDB();
    const quizIds = Array.isArray(req.body?.quiz_ids)
      ? req.body.quiz_ids.filter((id) => typeof id === "string" && id.trim())
      : [];

    if (quizIds.length === 0) {
      return res.status(400).json({ error: "quiz_ids array is required" });
    }
    if (quizIds.length > 200) {
      return res.status(400).json({
        error: "Too many quizzes — max 200 per bulk run. Split into smaller batches.",
      });
    }

    if (bulkProgress.status === "running") {
      return res.json({
        ok: true,
        message: "Bulk check already running",
        ...bulkProgress,
      });
    }

    const quizDocs = await Quiz.find({ quiz_id: { $in: quizIds } })
      .select({ quiz_id: 1, quiz_name: 1 })
      .lean();
    const nameMap = Object.fromEntries(
      quizDocs.map((q) => [q.quiz_id, q.quiz_name || q.quiz_id])
    );

    Object.assign(bulkProgress, {
      status: "running",
      started_at: new Date(),
      total_quizzes: quizIds.length,
      current_quiz_index: 0,
      current_quiz_id: quizIds[0],
      current_quiz_name: nameMap[quizIds[0]] || quizIds[0],
      current_quiz_progress: { done: 0, total: 0, flagged: 0, failed: 0 },
      completed_quizzes: [],
    });

    runBulkCheck(quizIds, nameMap).catch((err) => {
      console.error("❌ runBulkCheck error:", err);
      bulkProgress.status = "error";
      bulkProgress.error = err.message;
    });

    return res.json({
      ok: true,
      message: `Started bulk check for ${quizIds.length} quizzes`,
      ...bulkProgress,
    });
  } catch (err) {
    console.error("originality/check-quizzes error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/check-quizzes/status", (req, res) => {
  return res.json(bulkProgress);
});

// ═══════════════════════════════════════════════════════════════
// POST /scan-all — sweep ALL unchecked quizzes
// ═══════════════════════════════════════════════════════════════

router.post("/scan-all", async (req, res) => {
  try {
    await connectDB();

    const onlyUnchecked = req.body?.onlyUnchecked !== false;
    const limit = Math.min(parseInt(req.body?.limit || "5000", 10), 10000);

    if (bulkProgress.status === "running") {
      return res.json({
        ok: true,
        message: "Bulk check already running",
        ...bulkProgress,
      });
    }

    const questionFilter = onlyUnchecked
      ? {
          $or: [
            { "originality.status": { $exists: false } },
            { "originality.status": null },
            { "originality.status": "unchecked" },
          ],
        }
      : {};

    const quizIdsAgg = await Question.aggregate([
      { $match: questionFilter },
      { $unwind: "$quiz_ids" },
      { $group: { _id: "$quiz_ids" } },
      { $limit: limit },
    ]);

    const quizIds = quizIdsAgg.map((r) => r._id).filter(Boolean);

    if (quizIds.length === 0) {
      return res.json({
        ok: true,
        message: onlyUnchecked
          ? "Nothing to scan — every question has been checked already."
          : "No quizzes found.",
        quiz_count: 0,
      });
    }

    const quizDocs = await Quiz.find({ quiz_id: { $in: quizIds } })
      .select({ quiz_id: 1, quiz_name: 1 })
      .lean();
    const nameMap = Object.fromEntries(
      quizDocs.map((q) => [q.quiz_id, q.quiz_name || q.quiz_id])
    );

    Object.assign(bulkProgress, {
      status: "running",
      started_at: new Date(),
      total_quizzes: quizIds.length,
      current_quiz_index: 0,
      current_quiz_id: quizIds[0],
      current_quiz_name: nameMap[quizIds[0]] || quizIds[0],
      current_quiz_progress: { done: 0, total: 0, flagged: 0, failed: 0 },
      completed_quizzes: [],
      job_kind: "scan_all",
    });

    runBulkCheck(quizIds, nameMap).catch((err) => {
      console.error("❌ scan-all crashed:", err);
      bulkProgress.status = "error";
      bulkProgress.error = err.message;
    });

    return res.json({
      ok: true,
      message: `Started ${onlyUnchecked ? "unchecked-only" : "full"} scan on ${quizIds.length} quizzes`,
      quiz_count: quizIds.length,
      ...bulkProgress,
    });
  } catch (err) {
    console.error("originality/scan-all error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Background runner — sequential, uses runAndPersist for each question
async function runBulkCheck(quizIds, nameMap) {
  console.log(`🛡️  Bulk originality check: ${quizIds.length} quizzes`);

  for (let i = 0; i < quizIds.length; i++) {
    const quizId = quizIds[i];

    bulkProgress.current_quiz_index    = i;
    bulkProgress.current_quiz_id       = quizId;
    bulkProgress.current_quiz_name     = nameMap[quizId] || quizId;
    bulkProgress.current_quiz_progress = { done: 0, total: 0, flagged: 0, failed: 0 };

    try {
      const questions = await Question.find({ quiz_ids: quizId })
        .select("question_id text options year_level subject")
        .lean();

      bulkProgress.current_quiz_progress.total = questions.length;

      let done = 0, flagged = 0, failed = 0;

      for (const q of questions) {
        try {
          const result = await runAndPersist(q);
          done++;
          if (result?.status && result.status !== "clean") flagged++;
        } catch (err) {
          console.warn(`  ⚠️  ${q.question_id} failed: ${err.message?.slice(0, 200)}`);
          failed++;
        }

        bulkProgress.current_quiz_progress = {
          total: questions.length, done, flagged, failed,
        };
      }

      bulkProgress.completed_quizzes.push({
        quiz_id:   quizId,
        quiz_name: nameMap[quizId] || quizId,
        total:     questions.length,
        done,
        flagged,
        failed,
      });

      console.log(
        `  🏁 [${i + 1}/${quizIds.length}] ${nameMap[quizId]} — ` +
          `${done}/${questions.length} done, ${flagged} flagged`
      );
    } catch (err) {
      console.warn(`  ⚠️  Quiz ${quizId} failed:`, err.message);
      bulkProgress.completed_quizzes.push({
        quiz_id:   quizId,
        quiz_name: nameMap[quizId] || quizId,
        error:     err.message,
      });
    }
  }

  bulkProgress.status      = "done";
  bulkProgress.finished_at = new Date();

  setTimeout(() => {
    if (bulkProgress.status === "done") {
      Object.keys(bulkProgress).forEach((k) => delete bulkProgress[k]);
      bulkProgress.status = "idle";
    }
  }, 5 * 60 * 1000);

  console.log(
    `🏁 Bulk check complete. ${bulkProgress.completed_quizzes.length} quizzes processed.`
  );
}

// ═══════════════════════════════════════════════════════════════
// GET /audit — list flagged questions with quiz info
// ═══════════════════════════════════════════════════════════════

router.get("/audit", async (req, res) => {
  try {
    await connectDB();
    const {
      status,
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
        .select("question_id text quiz_ids subject year_level originality")
        .sort({ "originality.last_checked_at": -1 })
        .skip(Number(skip))
        .limit(Math.min(Number(limit), 200))
        .lean(),
      Question.countDocuments(filter),
    ]);

    const matchedQuestionIds = new Set();
    for (const item of items) {
      const layers = item.originality?.layers || {};
      const matchedId =
        layers.exact?.internal_match?.question_id ||
        layers.structural?.internal_match?.question_id ||
        (layers.semantic?.top_matches || []).find((m) => m.source_type !== "corpus")?.id;
      if (matchedId) matchedQuestionIds.add(matchedId);
    }

    const matchedDocs = matchedQuestionIds.size
      ? await Question.find({ question_id: { $in: [...matchedQuestionIds] } })
          .select("question_id text quiz_ids")
          .lean()
      : [];

    const allQuizIds = new Set();
    for (const item of items) {
      (item.quiz_ids || []).forEach((id) => id && allQuizIds.add(id));
    }
    for (const m of matchedDocs) {
      (m.quiz_ids || []).forEach((id) => id && allQuizIds.add(id));
    }

    const quizDocs = allQuizIds.size
      ? await Quiz.find({ quiz_id: { $in: [...allQuizIds] } })
          .select("quiz_id quiz_name subject year_level")
          .lean()
      : [];
    const quizMap = Object.fromEntries(quizDocs.map((q) => [q.quiz_id, q]));

    const matchedMap = Object.fromEntries(
      matchedDocs.map((q) => [q.question_id, q])
    );

    const enriched = items.map((item) => {
      const sourceQuizId = (item.quiz_ids || [])[0];
      const sourceQuiz = quizMap[sourceQuizId] || null;

      const layers = item.originality?.layers || {};
      const matchedId =
        layers.exact?.internal_match?.question_id ||
        layers.structural?.internal_match?.question_id ||
        (layers.semantic?.top_matches || []).find((m) => m.source_type !== "corpus")?.id;

      let matchInfo = null;
      if (matchedId && matchedMap[matchedId]) {
        const m = matchedMap[matchedId];
        const mQuizId = (m.quiz_ids || [])[0];
        const mQuiz = quizMap[mQuizId] || null;
        matchInfo = {
          question_id: m.question_id,
          text:        m.text,
          quiz_id:     mQuizId,
          quiz_name:   mQuiz?.quiz_name || mQuizId || "—",
          subject:     mQuiz?.subject || null,
          year_level:  mQuiz?.year_level || null,
        };
      }

      return {
        ...item,
        source_quiz: sourceQuiz
          ? {
              quiz_id:    sourceQuiz.quiz_id,
              quiz_name:  sourceQuiz.quiz_name,
              subject:    sourceQuiz.subject,
              year_level: sourceQuiz.year_level,
            }
          : null,
        match_info: matchInfo,
      };
    });

    return res.json({ ok: true, total, items: enriched });
  } catch (err) {
    console.error("originality/audit error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: POST /web-verdict/:questionId
// Saves admin's manual Google-search verdict to question.originality.web_verdict
//
// Body:
//   { verdict: "clean" | "suspicious" | "confirmed_copy" | "reset", note? }
//
// "reset" clears the verdict.
// ═══════════════════════════════════════════════════════════════

router.post("/web-verdict/:questionId", async (req, res) => {
  try {
    await connectDB();
    const { questionId } = req.params;
    const { verdict, note } = req.body || {};

    const VALID = ["clean", "suspicious", "confirmed_copy", "reset"];
    if (!VALID.includes(verdict)) {
      return res.status(400).json({
        error: `verdict must be one of: ${VALID.join(", ")}`,
      });
    }

    const q = await Question.findOne({ question_id: questionId }).lean();
    if (!q) return res.status(404).json({ error: "Question not found" });

    if (verdict === "reset") {
      await Question.updateOne(
        { question_id: questionId },
        { $unset: { "originality.web_verdict": "" } }
      );
      return res.json({ ok: true, cleared: true });
    }

    const adminEmail = req.adminUser?.email || req.user?.email || "admin";

    await Question.updateOne(
      { question_id: questionId },
      {
        $set: {
          "originality.web_verdict": {
            status:      verdict,
            note:        (note || "").slice(0, 500),
            verified_by: adminEmail,
            verified_at: new Date(),
          },
        },
      }
    );

    return res.json({
      ok: true,
      verdict: {
        status:      verdict,
        note:        note || "",
        verified_by: adminEmail,
        verified_at: new Date(),
      },
    });
  } catch (err) {
    console.error("originality/web-verdict error:", err);
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