/**
 * scripts/seedBundles.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Seeds the quiz_catalog collection from the hardcoded quizMap.
 * ═══════════════════════════════════════════════════════════════
 *
 * This replaces the old syncFlexiQuizzes.js. Instead of fetching
 * from FlexiQuiz API and parsing quiz names, we use a hardcoded
 * map of quiz IDs organized by year + tier.
 *
 * Run:  node scripts/seedBundles.js
 * When: After adding new quizzes to src/data/quizMap.js
 *
 * What it does:
 *   1. Reads QUIZ_MAP from src/data/quizMap.js
 *   2. For each year + tier combo, creates/updates a bundle in quiz_catalog
 *   3. Each bundle stores ONLY its own tier's quiz IDs (standalone, no stacking)
 *
 * ENV required: MONGODB_URI
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

// Import the hardcoded quiz map
const { QUIZ_MAP } = require(path.join(__dirname, "..", "src", "data", "quizMap"));

// Import the model
const QuizCatalog = require(path.join(__dirname, "..", "src", "models", "quizCatalog"));

// ═══════════════════════════════════════════════════════════════
// Pricing (AUD cents) — per year, per tier
// ═══════════════════════════════════════════════════════════════

const PRICING = {
  3: { A: 1900, B: 2500, C: 2500 },
  5: { A: 2400, B: 3000, C: 3000 },
  7: { A: 2900, B: 3500, C: 3500 },
  9: { A: 2900, B: 3500, C: 3500 },
};

const TIER_NAMES = {
  A: "Full Tests",
  B: "Topic Quizzes — Standard",
  C: "Topic Quizzes — Hard",
};

const TIER_DESCRIPTIONS = {
  A: "Full-length NAPLAN practice tests across all subjects",
  B: "Standard and medium difficulty topic-wise quizzes for targeted practice",
  C: "Hard topic quizzes for advanced preparation and challenge",
};

// ═══════════════════════════════════════════════════════════════
// Seed Logic
// ═══════════════════════════════════════════════════════════════

async function seedBundles() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB\n");

  const yearLevels = Object.keys(QUIZ_MAP).map(Number).sort((a, b) => a - b);
  const tiers = ["A", "B", "C"];
  let bundleCount = 0;
  let totalQuizzes = 0;

  for (const year of yearLevels) {
    const yearData = QUIZ_MAP[year];
    if (!yearData) continue;

    for (const tier of tiers) {
      const quizzes = yearData[tier] || [];

      // Skip empty tiers (e.g. Year 5/7/9 not yet populated)
      if (quizzes.length === 0) {
        console.log(`  ⏭️  year${year}_${tier.toLowerCase()}: No quizzes — skipping`);
        continue;
      }

      const quizIds = quizzes.map((q) => q.quiz_id);
      const subjects = [...new Set(quizzes.map((q) => q.subject).filter(Boolean))].sort();
      const bundleId = `year${year}_${tier.toLowerCase()}`;
      const pricing = PRICING[year] || PRICING[3];

      await QuizCatalog.updateOne(
        { bundle_id: bundleId },
        {
          $set: {
            bundle_id: bundleId,
            bundle_name: `Year ${year} ${TIER_NAMES[tier]}`,
            description: TIER_DESCRIPTIONS[tier],
            year_level: year,
            subjects,
            tier,
            flexiquiz_quiz_ids: quizIds,
            price_cents: pricing[tier],
            is_active: true,
            quiz_count: quizIds.length,
          },
        },
        { upsert: true }
      );

      console.log(
        `  ✅ ${bundleId}: ${TIER_NAMES[tier]} — ${quizIds.length} quizzes, ` +
        `$${(pricing[tier] / 100).toFixed(2)} [${subjects.join(", ")}]`
      );
      bundleCount++;
      totalQuizzes += quizIds.length;
    }

    console.log(""); // blank line between years
  }

  // Summary
  console.log("═══════════════════════════════════════");
  console.log(`✅ Seed complete!`);
  console.log(`   Bundles created/updated: ${bundleCount}`);
  console.log(`   Total quizzes mapped:    ${totalQuizzes}`);
  console.log("═══════════════════════════════════════\n");

  await mongoose.disconnect();
}

seedBundles().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});