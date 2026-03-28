#!/usr/bin/env node

/**
 * Seed Script: Populate quiz_catalog with placeholder bundles.
 *
 * USAGE:
 *   node src/scripts/seedCatalog.js
 *
 * Run this once to set up your bundle catalog.
 * Safe to re-run — uses upsert (updates existing, inserts new).
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const QuizCatalog = require("../models/quizCatalog");

const BUNDLES = [
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "Complete NAPLAN preparation for Year 3 — Reading, Writing, Numeracy, and Language Conventions.",
    year_level: 3,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [], // TODO: Add real FlexiQuiz quiz IDs
    price_cents: 2999, // $29.99 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "Complete NAPLAN preparation for Year 5 — Reading, Writing, Numeracy, and Language Conventions.",
    year_level: 5,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [],
    price_cents: 3499, // $34.99 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "Complete NAPLAN preparation for Year 7 — Reading, Writing, Numeracy, and Language Conventions.",
    year_level: 7,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [],
    price_cents: 3999, // $39.99 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "Complete NAPLAN preparation for Year 9 — Reading, Writing, Numeracy, and Language Conventions.",
    year_level: 9,
    subjects: ["Reading", "Writing", "Numeracy", "Language Conventions"],
    flexiquiz_quiz_ids: [],
    price_cents: 4499, // $44.99 AUD
    is_active: true,
    trial_quiz_ids: [],
  },
];

async function seed() {
  await connectDB();
  console.log("Connected to MongoDB\n");

  for (const bundle of BUNDLES) {
    const result = await QuizCatalog.findOneAndUpdate(
      { bundle_id: bundle.bundle_id },
      { $set: bundle },
      { upsert: true, new: true }
    );
    console.log(`  ✅ ${result.bundle_name} — $${(result.price_cents / 100).toFixed(2)} AUD`);
  }

  console.log(`\nSeeded ${BUNDLES.length} bundles.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
