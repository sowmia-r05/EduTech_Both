/**
 * src/models/quizCatalog.js
 *
 * Maps purchasable bundles to their FlexiQuiz quiz IDs.
 * Each bundle = one year level + one tier, with its OWN quiz IDs only.
 *
 * Seeded by: node scripts/seedBundles.js
 * Source of truth for quiz IDs: src/data/quizMap.js
 */

const mongoose = require("mongoose");

const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: { type: String, required: true, unique: true, index: true },
    // e.g. "year3_a", "year3_b", "year3_c"

    bundle_name: { type: String, required: true },
    // e.g. "Year 3 Full Tests"

    description: { type: String, default: "" },

    year_level: { type: Number, required: true, enum: [3, 5, 7, 9] },

    subjects: [{ type: String }],
    // e.g. ["Reading", "Writing", "Maths", "Conventions"]

    tier: { type: String, enum: ["A", "B", "C"], required: true },
    // A = Full Tests, B = Topic Standard, C = Topic Hard

    // This tier's quiz IDs ONLY — standalone, no cumulative arrays
    flexiquiz_quiz_ids: [{ type: String }],

    price_cents: { type: Number, required: true },
    // Price in AUD cents

    is_active: { type: Boolean, default: true },

    trial_quiz_ids: [{ type: String }],
    // Free sample quiz IDs (if any)

    stripe_price_id: { type: String, default: null },
    // Link to Stripe Price object (set manually or via script)

    quiz_count: { type: Number, default: 0 },
    // Number of quizzes in this tier
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);
