/**
 * scripts/seedBundles.js
 *
 * Run: node scripts/seedBundles.js
 *
 * Seeds the quiz_catalog collection with bundle definitions.
 * Update the flexiquiz_quiz_ids with your actual FlexiQuiz quiz IDs.
 *
 * Safe to run multiple times — uses upsert on bundle_id.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const QuizCatalog = require("../src/models/quizCatalog");

const BUNDLES = [
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "Complete NAPLAN prep for Year 3 — all subjects included",
    year_level: 3,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 4900, // $49.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "Complete NAPLAN prep for Year 5 — all subjects included",
    year_level: 5,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 4900,
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "Complete NAPLAN prep for Year 7 — all subjects included",
    year_level: 7,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 5900,
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "Complete NAPLAN prep for Year 9 — all subjects included",
    year_level: 9,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 5900,
    is_active: true,
    trial_quiz_ids: [],
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  for (const bundle of BUNDLES) {
    const result = await QuizCatalog.updateOne(
      { bundle_id: bundle.bundle_id },
      { $set: bundle },
      { upsert: true }
    );
    const action = result.upsertedCount ? "Created" : "Updated";
    console.log(`${action}: ${bundle.bundle_name} ($${(bundle.price_cents / 100).toFixed(2)})`);
  }

  console.log("\n✅ Done! Seeded", BUNDLES.length, "bundles.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});