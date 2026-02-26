/**
 * scripts/seedBundles.js
 *
 * Run: node scripts/seedBundles.js
 *
 * Seeds the quiz_catalog collection with bundle definitions.
 * Update the flexiquiz_quiz_ids with your actual FlexiQuiz quiz IDs.
 *
 * Safe to run multiple times — uses upsert on bundle_id.
 *
 * ★ THIS MUST MATCH: naplan-frontend/src/app/data/bundleCatalog.js ★
 *   Keep bundle_id, bundle_name, subjects, price_cents, descriptions in sync.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const QuizCatalog = require("../src/models/quizCatalog");

const BUNDLES = [
  // ─── Year 3 ───
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 3,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 4900, // $49.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year3_maths",
    bundle_name: "Year 3 Maths Only",
    description: "Focused Maths practice — 6 full-length tests",
    year_level: 3,
    subjects: ["Maths"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 1900, // $19.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year3_english",
    bundle_name: "Year 3 English Pack",
    description: "Reading, Writing & Conventions combined",
    year_level: 3,
    subjects: ["Reading", "Writing", "Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 3500, // $35.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },

  // ─── Year 5 ───
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 5,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 5900, // $59.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year5_maths",
    bundle_name: "Year 5 Maths Only",
    description: "Focused Maths practice — 8 full-length tests",
    year_level: 5,
    subjects: ["Maths"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 2400, // $24.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },

  // ─── Year 7 ───
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 7,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 6900, // $69.00 AUD
    is_active: true,
    trial_quiz_ids: [],
  },

  // ─── Year 9 ───
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 9,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    flexiquiz_quiz_ids: [], // ← ADD YOUR FLEXIQUIZ QUIZ IDs HERE
    price_cents: 6900, // $69.00 AUD
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
    console.log(
      `  ${action}: ${bundle.bundle_name} ($${(bundle.price_cents / 100).toFixed(2)}) [${bundle.bundle_id}]`
    );
  }

  console.log(`\n✅ Done! Seeded ${BUNDLES.length} bundles.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});