#!/usr/bin/env node
/**
 * scripts/backfillFingerprints.js
 *
 * One-time script: walks every Question in the bank and computes its
 * originality fingerprints (exact_hash, structural_hash, embedding) so
 * that subsequent duplicate checks have something to compare against.
 *
 * Without this, even after running "duplicate check" the system has no
 * fingerprints stored and finds nothing.
 *
 * Run from the backend folder:
 *   node scripts/backfillFingerprints.js
 *
 * Options:
 *   --skip-embeddings    Only do hashes (fast, 30 seconds, free)
 *   --only-missing       Skip questions that already have an exact_hash
 *   --batch-size 50      How many to process before logging progress
 *
 * Cost (with embeddings):
 *   ~3000 questions × $0.0001 per embedding = ~$0.30 in Gemini API
 *
 * Cost (without embeddings, --skip-embeddings):
 *   $0
 *
 * Time:
 *   ~10 minutes for 3000 questions with embeddings
 *   ~30 seconds without
 */

require("dotenv").config();
const mongoose = require("mongoose");

const args = process.argv.slice(2);
const SKIP_EMBEDDINGS = args.includes("--skip-embeddings");
const ONLY_MISSING    = args.includes("--only-missing");
const batchIdx = args.indexOf("--batch-size");
const BATCH_SIZE = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) || 50 : 50;

async function main() {
  console.log("\n🛡️  Originality Backfill\n" + "─".repeat(40));
  console.log(`  Skip embeddings: ${SKIP_EMBEDDINGS}`);
  console.log(`  Only missing:    ${ONLY_MISSING}`);
  console.log(`  Batch size:      ${BATCH_SIZE}`);
  console.log("─".repeat(40) + "\n");

  // ─── Connect to MongoDB ────────────────────────────────────────
  const connectDB = require("../src/config/db");
  await connectDB();

  const Question = require("../src/models/question");

  // ─── Lazy-load helpers that may live in different paths ────────
  let computeFingerprints, embedText;

  // Try the new structure first (utils/plagiarism/), fall back to old
  try {
    const checker = require("../src/utils/originalityCheck");
    if (checker.checkOriginality) {
      // We'll call this for each question — it returns fingerprints
      computeFingerprints = async (q) => {
        const result = await checker.checkOriginality(
          { text: q.text, options: q.options },
          {
            excludeQuestionId: q.question_id,
            yearLevel: q.year_level,
            subject: q.subject,
            skipEmbedding: SKIP_EMBEDDINGS,
          }
        );
        return {
          exact_hash:      result.fingerprints?.exact_hash,
          structural_hash: result.fingerprints?.structural_hash,
          embedding:       SKIP_EMBEDDINGS ? null : result.embedding,
        };
      };
    }
  } catch (err) {
    console.error("❌ Couldn't load originalityCheck.js:", err.message);
    console.error("   Make sure src/utils/originalityCheck.js exists.");
    process.exit(1);
  }

  // ─── Build the filter ──────────────────────────────────────────
  const filter = ONLY_MISSING
    ? {
        $or: [
          { "originality.exact_hash": { $exists: false } },
          { "originality.exact_hash": null },
          { "originality.exact_hash": "" },
        ],
      }
    : {};

  const total = await Question.countDocuments(filter);
  console.log(`📊 ${total} questions to process\n`);

  if (total === 0) {
    console.log("✅ Nothing to do. Exiting.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // ─── Process in batches ────────────────────────────────────────
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  while (processed < total) {
    const batch = await Question.find(filter)
      .skip(processed)
      .limit(BATCH_SIZE)
      .select({ question_id: 1, text: 1, options: 1, year_level: 1, subject: 1 })
      .lean();

    if (batch.length === 0) break;

    for (const q of batch) {
      try {
        if (!q.text || q.text.trim().length < 5) {
          skipped++;
          continue;
        }

        const fp = await computeFingerprints(q);

        const setObj = {
          "originality.exact_hash":      fp.exact_hash,
          "originality.structural_hash": fp.structural_hash,
          "originality.last_checked_at": new Date(),
          // Default status: "unchecked" until full check runs
          "originality.status": "unchecked",
        };
        if (fp.embedding && Array.isArray(fp.embedding)) {
          setObj["originality.embedding"] = fp.embedding;
        }

        await Question.updateOne(
          { question_id: q.question_id },
          { $set: setObj }
        );
        updated++;
      } catch (err) {
        failed++;
        if (failed <= 5) {
          console.warn(`  ⚠️  ${q.question_id}: ${err.message?.slice(0, 100)}`);
        }
      }
    }

    processed += batch.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = rate > 0 ? Math.round((total - processed) / rate) : 0;
    process.stdout.write(
      `\r  Progress: ${processed}/${total} ` +
      `(${Math.round((processed / total) * 100)}%)  ` +
      `· ${rate.toFixed(1)}/s · ETA ${eta}s   `
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n");
  console.log("─".repeat(40));
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}  (empty text)`);
  console.log(`   Failed:  ${failed}`);
  console.log("─".repeat(40));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ Fatal error:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});