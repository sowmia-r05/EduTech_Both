/**
 * scripts/backfillCumulativeFeedback.js
 *
 * ONE-TIME backfill: generates cumulative feedback for all children
 * who have quiz data but no (or incomplete) cumulative feedback docs.
 *
 * Run from the backend root:
 *   node scripts/backfillCumulativeFeedback.js
 *
 * Options (env vars):
 *   ONLY_MISSING=true   — only process children with zero "done" docs (default: true)
 *   FORCE_ALL=true      — regenerate for ALL children, even those already done
 *   CHILD_ID=<id>       — process a single child only (for targeted re-gen)
 *   DRY_RUN=true        — print which children would be processed, without running AI
 *   DELAY_MS=3000       — pause between children (default 3000ms) to avoid Gemini rate limits
 */

require("dotenv").config();
const connectDB = require("../src/config/db");
const Child = require("../src/models/child");
const QuizAttempt = require("../src/models/quizAttempt");
const Result = require("../src/models/result");
const CumulativeFeedback = require("../src/models/cumulativeFeedback");
const {
  triggerCumulativeFeedback,
  fetchAllTestsForChild,
} = require("../src/services/cumulativeFeedbackService");

// ─── Config ───────────────────────────────────────────────────
const ONLY_MISSING = process.env.FORCE_ALL !== "true";   // default: skip already-done children
const FORCE_ALL    = process.env.FORCE_ALL === "true";
const SINGLE_CHILD = process.env.CHILD_ID || null;
const DRY_RUN      = process.env.DRY_RUN === "true";
const DELAY_MS     = parseInt(process.env.DELAY_MS || "3000", 10);

// ─── Helpers ──────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmt(n, total) {
  return `[${String(n).padStart(String(total).length, " ")}/${total}]`;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await connectDB();
  console.log("✅ Connected\n");

  // ── 1. Find children to process ──────────────────────────────
  let children;

  if (SINGLE_CHILD) {
    const child = await Child.findById(SINGLE_CHILD).lean();
    if (!child) {
      console.error(`❌ Child not found: ${SINGLE_CHILD}`);
      process.exit(1);
    }
    children = [child];
    console.log(`🎯 Single-child mode: ${child.display_name || child.username} (${child._id})\n`);
  } else {
    children = await Child.find({}).lean();
    console.log(`👶 Found ${children.length} total children\n`);
  }

  // ── 2. Filter: skip children with no quiz data ────────────────
  console.log("🔍 Checking which children have quiz data…");

  const childrenWithData = [];

  for (const child of children) {
    const childId = child._id;

    // Check native QuizAttempts
    const nativeCount = await QuizAttempt.countDocuments({
      child_id: childId,
      status: "submitted",
    });

    // Check legacy Results
    let legacyCount = 0;
    if (child.flexiquiz_user_id || child.username) {
      const matchQuery = child.flexiquiz_user_id
        ? { "user.user_id": child.flexiquiz_user_id }
        : { "user.user_name": child.username };
      legacyCount = await Result.countDocuments(matchQuery);
    }

    const totalTests = nativeCount + legacyCount;

    if (totalTests === 0) {
      console.log(`  ⏭️  ${child.display_name || child.username} — no quiz data, skipping`);
      continue;
    }

    // Check existing cumulative feedback
    const existingDone = await CumulativeFeedback.countDocuments({
      child_id: childId,
      status: "done",
    });

    if (ONLY_MISSING && existingDone > 0 && !FORCE_ALL) {
      console.log(
        `  ✅  ${child.display_name || child.username} — already has ${existingDone} done doc(s), skipping`
      );
      continue;
    }

    childrenWithData.push({
      child,
      totalTests,
      existingDone,
    });

    console.log(
      `  📋  ${child.display_name || child.username} — ${totalTests} test(s), ${existingDone} cumulative doc(s) done`
    );
  }

  console.log(
    `\n📊 Summary: ${childrenWithData.length} children to process out of ${children.length} total\n`
  );

  if (DRY_RUN) {
    console.log("🏃 DRY RUN — no AI calls made. Set DRY_RUN=false to run for real.");
    process.exit(0);
  }

  if (childrenWithData.length === 0) {
    console.log("🎉 Nothing to do — all children already have cumulative feedback!");
    process.exit(0);
  }

  // ── 3. Generate cumulative feedback for each child ────────────
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < childrenWithData.length; i++) {
    const { child, totalTests } = childrenWithData[i];
    const childId = child._id;
    const name = child.display_name || child.username;
    const prefix = fmt(i + 1, childrenWithData.length);

    console.log(`\n${prefix} 🤖 Processing: ${name} (${childId}) — ${totalTests} test(s)`);

    try {
      await triggerCumulativeFeedback(childId);
      console.log(`${prefix} ✅ Done: ${name}`);
      successCount++;
    } catch (err) {
      console.error(`${prefix} ❌ Failed: ${name} — ${err.message}`);
      failCount++;
    }

    // Throttle between children to avoid Gemini rate limits
    if (i < childrenWithData.length - 1) {
      console.log(`  ⏳ Waiting ${DELAY_MS}ms before next child…`);
      await sleep(DELAY_MS);
    }
  }

  // ── 4. Final report ──────────────────────────────────────────
  console.log(`
═══════════════════════════════════════════════
✅ Backfill complete!
   Processed : ${childrenWithData.length}
   Succeeded : ${successCount}
   Failed    : ${failCount}
═══════════════════════════════════════════════
  `);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Unhandled error:", err);
  process.exit(1);
});