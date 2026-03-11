/**
 * routes/adminCumulativeFeedbackRoutes.js
 *
 * Admin endpoints to manage cumulative feedback backfilling.
 *
 * Mount in app.js:
 *   const adminCumulativeFeedbackRoutes = require("./routes/adminCumulativeFeedbackRoutes");
 *   app.use("/api/admin", adminCumulativeFeedbackRoutes);
 *
 * Endpoints:
 *
 *   GET  /api/admin/cumulative-feedback/status
 *     → Summary of how many children have/don't have cumulative feedback.
 *
 *   POST /api/admin/cumulative-feedback/backfill
 *     → Kick off cumulative feedback generation for ALL children missing it.
 *       Body (optional): { forceAll: true }  — regenerate even for already-done children
 *       Responds 202 immediately. Progress visible in server logs.
 *
 *   POST /api/admin/cumulative-feedback/backfill/:childId
 *     → Regenerate cumulative feedback for one specific child.
 *
 * Auth: requireAdmin
 */

const express = require("express");
const mongoose = require("mongoose");
const { requireAdmin } = require("../middleware/adminAuth");
const connectDB = require("../config/db");

const Child = require("../models/child");
const QuizAttempt = require("../models/quizAttempt");
const Result = require("../models/result");
const CumulativeFeedback = require("../models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
} = require("../services/cumulativeFeedbackService");

const router = express.Router();
router.use(requireAdmin);

// ─── In-memory flag: prevent concurrent backfill runs ─────────
let backfillRunning = false;

// ─── Helper ───────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function childHasQuizData(child) {
  const childId = child._id;

 // ✅ CORRECT
    const nativeCount = await QuizAttempt.countDocuments({
      child_id: childId,
      status: { $in: ["scored", "ai_done"] },
    });
  if (nativeCount > 0) return true;

  if (child.flexiquiz_user_id || child.username) {
    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };
    const legacyCount = await Result.countDocuments(matchQuery);
    if (legacyCount > 0) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/cumulative-feedback/status
// ─────────────────────────────────────────────────────────────
router.get("/cumulative-feedback/status", async (req, res) => {
  try {
    await connectDB();

    const allChildren = await Child.find({}).select("_id display_name username").lean();

    const rows = [];

    for (const child of allChildren) {
      const hasData = await childHasQuizData(child);

      const doneDocs = await CumulativeFeedback.countDocuments({
        child_id: child._id,
        status: "done",
      });
      const totalDocs = await CumulativeFeedback.countDocuments({
        child_id: child._id,
      });

      rows.push({
        childId: child._id,
        name: child.display_name || child.username,
        hasQuizData: hasData,
        cumulativeDocsDone: doneDocs,
        cumulativeDocsTotal: totalDocs,
        needsBackfill: hasData && doneDocs === 0,
      });
    }

    const needsBackfill = rows.filter((r) => r.needsBackfill).length;
    const alreadyDone = rows.filter((r) => r.cumulativeDocsDone > 0).length;
    const noData = rows.filter((r) => !r.hasQuizData).length;

    return res.json({
      ok: true,
      summary: {
        totalChildren: allChildren.length,
        needsBackfill,
        alreadyDone,
        noQuizData: noData,
        backfillRunning,
      },
      children: rows,
    });
  } catch (err) {
    console.error("GET cumulative-feedback/status error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/cumulative-feedback/backfill
// Body: { forceAll?: boolean, delayMs?: number }
// ─────────────────────────────────────────────────────────────
router.post("/cumulative-feedback/backfill", async (req, res) => {
  if (backfillRunning) {
    return res.status(409).json({
      ok: false,
      error: "Backfill already running. Check server logs for progress.",
    });
  }

  const forceAll = req.body?.forceAll === true;
  const delayMs = parseInt(req.body?.delayMs || "3000", 10);

  // Respond immediately — backfill runs async
  res.status(202).json({
    ok: true,
    message: `Backfill started (forceAll=${forceAll}). Check server logs for progress.`,
  });

  // ── Run async ──────────────────────────────────────────────
  backfillRunning = true;
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  try {
    await connectDB();
    const allChildren = await Child.find({}).lean();
    console.log(`\n🔄 ADMIN BACKFILL STARTED — ${allChildren.length} children, forceAll=${forceAll}`);

    for (const child of allChildren) {
      const childId = child._id;
      const name = child.display_name || child.username;

      const hasData = await childHasQuizData(child);
      if (!hasData) {
        console.log(`  ⏭️  ${name} — no quiz data, skipping`);
        skippedCount++;
        continue;
      }

      if (!forceAll) {
        const doneDocs = await CumulativeFeedback.countDocuments({
          child_id: childId,
          status: "done",
        });
        if (doneDocs > 0) {
          console.log(`  ✅  ${name} — already has ${doneDocs} done doc(s), skipping`);
          skippedCount++;
          continue;
        }
      }

      try {
        console.log(`  🤖  Generating for: ${name} (${childId})`);
        await triggerCumulativeFeedback(childId);
        console.log(`  ✅  Done: ${name}`);
        successCount++;
      } catch (err) {
        console.error(`  ❌  Failed: ${name} — ${err.message}`);
        failCount++;
      }

      await sleep(delayMs);
    }

    console.log(`
═══════════════════════════════════════════════
✅ ADMIN BACKFILL COMPLETE
   Succeeded : ${successCount}
   Failed    : ${failCount}
   Skipped   : ${skippedCount}
═══════════════════════════════════════════════
    `);
  } catch (err) {
    console.error("❌ Backfill loop crashed:", err.message);
  } finally {
    backfillRunning = false;
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/cumulative-feedback/backfill/:childId
// Regenerate for ONE specific child
// ─────────────────────────────────────────────────────────────
router.post("/cumulative-feedback/backfill/:childId", async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid childId" });
    }

    await connectDB();
    const child = await Child.findById(childId).lean();
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    const hasData = await childHasQuizData(child);
    if (!hasData) {
      return res.status(422).json({
        ok: false,
        error: "Child has no quiz data — nothing to generate feedback from.",
      });
    }

    // Respond 202 immediately, run async
    res.status(202).json({
      ok: true,
      message: `Cumulative feedback generation started for child ${child.display_name || child.username}`,
    });

    setImmediate(async () => {
      try {
        await triggerCumulativeFeedback(childId);
        console.log(`✅ Admin single-child backfill done: ${child.display_name || child.username}`);
      } catch (err) {
        console.error(`❌ Admin single-child backfill failed: ${err.message}`);
      }
    });

  } catch (err) {
    console.error("POST cumulative-feedback/backfill/:childId error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;