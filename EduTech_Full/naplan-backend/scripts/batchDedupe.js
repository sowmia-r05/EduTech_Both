/**
 * batchDedupe.js
 *
 * One-off cleanup: walks the entire Question collection, computes fingerprints,
 * groups questions into duplicate clusters, and cross-checks against the
 * corpus_items collection.
 *
 * Place at: scripts/batchDedupe.js
 *
 * Output: ./dedupe_report.json with three buckets:
 *   - exact_duplicate_clusters       (verbatim duplicates within your bank)
 *   - structural_duplicate_clusters  (numbers/dates swapped within your bank)
 *   - corpus_infringements           (matches against corpus_items)
 *
 * Modes:
 *   node scripts/batchDedupe.js           # dry run, just produces the report
 *   node scripts/batchDedupe.js --apply   # ALSO stamp originality.* fields on Questions
 *
 * Tip: run --apply once to backfill, then the per-insert hook keeps things current.
 */

const fs = require("fs");
require("dotenv").config();

const connectDB  = require("../src/config/db");
const Question   = require("../src/models/question");
const CorpusItem = require("../src/models/corpusItem");
const { fingerprintQuestion } = require("../src/utils/originalityFingerprints");

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  // ─── Load all questions ─────────────────────────────────────
  console.log("🔎 Scanning Question collection…");
  const questions = await Question.find({})
    .select("question_id text options quiz_ids originality")
    .lean();
  console.log(`   ${questions.length} questions loaded`);

  // ─── Compute (or reuse) fingerprints ───────────────────────
  const enriched = questions.map((q) => {
    const fp = q.originality?.exact_hash
      ? {
          exact_hash:      q.originality.exact_hash,
          structural_hash: q.originality.structural_hash,
        }
      : fingerprintQuestion({ text: q.text, options: q.options });
    return { ...q, _fp: fp };
  });

  // ─── Cluster by exact + structural hashes ──────────────────
  const exactGroups  = new Map();
  const structGroups = new Map();

  for (const q of enriched) {
    if (q._fp.exact_hash) {
      const list = exactGroups.get(q._fp.exact_hash) || [];
      list.push(q);
      exactGroups.set(q._fp.exact_hash, list);
    }
    if (q._fp.structural_hash) {
      const list = structGroups.get(q._fp.structural_hash) || [];
      list.push(q);
      structGroups.set(q._fp.structural_hash, list);
    }
  }

  const exactDups = [...exactGroups.values()].filter((g) => g.length > 1);

  // Structural clusters are only "interesting" if they contain at least
  // two questions with DIFFERENT exact hashes (otherwise it's just an
  // exact-duplicate cluster reported twice).
  const structDups = [...structGroups.values()]
    .filter((g) => g.length > 1)
    .filter((g) => new Set(g.map((q) => q._fp.exact_hash)).size > 1);

  console.log(`   Exact duplicate clusters:       ${exactDups.length}`);
  console.log(`   Structural duplicate clusters:  ${structDups.length}`);

  // ─── Cross-check against corpus ─────────────────────────────
  console.log("🔎 Cross-checking against corpus_items…");
  const corpusInfringements = [];
  let scanned = 0;
  for (const q of enriched) {
    const hit = await CorpusItem.findOne({
      $or: [
        { exact_hash:      q._fp.exact_hash },
        { structural_hash: q._fp.structural_hash },
      ],
    }).lean();
    if (hit) {
      corpusInfringements.push({
        question_id: q.question_id,
        quiz_ids:    q.quiz_ids,
        text:        q.text,
        match: {
          source:       hit.source,
          matched_id:   hit._id,
          matched_text: hit.text,
          match_type:   hit.exact_hash === q._fp.exact_hash ? "exact" : "structural",
        },
      });
    }
    scanned++;
    if (scanned % 200 === 0) console.log(`   ... ${scanned}/${enriched.length}`);
  }
  console.log(`   Corpus infringements: ${corpusInfringements.length}`);

  // ─── Write report ───────────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_questions:               questions.length,
      exact_duplicate_clusters:      exactDups.length,
      structural_duplicate_clusters: structDups.length,
      corpus_infringements:          corpusInfringements.length,
    },
    exact_duplicate_clusters: exactDups.map((g) =>
      g.map((q) => ({
        question_id: q.question_id,
        quiz_ids:    q.quiz_ids,
        text:        (q.text || "").slice(0, 200),
      }))
    ),
    structural_duplicate_clusters: structDups.map((g) =>
      g.map((q) => ({
        question_id: q.question_id,
        quiz_ids:    q.quiz_ids,
        text:        (q.text || "").slice(0, 200),
      }))
    ),
    corpus_infringements: corpusInfringements,
  };

  fs.writeFileSync("./dedupe_report.json", JSON.stringify(report, null, 2));
  console.log("📝 Report written to ./dedupe_report.json");

  // ─── Apply mode: stamp fingerprints onto Question docs ──────
  if (apply) {
    console.log("✏️  Applying originality fields to Question docs…");
    let updated = 0;
    for (const q of enriched) {
      await Question.updateOne(
        { question_id: q.question_id },
        {
          $set: {
            "originality.exact_hash":      q._fp.exact_hash,
            "originality.structural_hash": q._fp.structural_hash,
            "originality.last_checked_at": new Date(),
          },
        }
      );
      updated++;
      if (updated % 100 === 0) console.log(`   ... ${updated} updated`);
    }
    console.log(`   ✅ ${updated} questions stamped`);
  }

  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });