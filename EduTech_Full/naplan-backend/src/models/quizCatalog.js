/**
 * src/models/quizCatalog.js
 *
 * Maps purchasable bundles to their FlexiQuiz quiz IDs.
 * Each bundle = one year level + one tier, with its OWN quiz IDs only.
 *
 * IMPORTANT: FlexiQuiz has TWO different IDs per quiz:
 *   - flexiquiz_quiz_ids     = embed IDs (for iframe display)
 *   - flexiquiz_api_quiz_ids = API quiz IDs (for assign/unassign API calls)
 *
 * Seeded by: node scripts/seedBundles.js
 * API IDs synced by: node scripts/syncQuizIds.js
 */

const mongoose = require("mongoose");

const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: { type: String, required: true, unique: true, index: true },
    bundle_name: { type: String, required: true },
    description: { type: String, default: "" },
    year_level: { type: Number, required: true, enum: [3, 5, 7, 9] },
    subjects: [{ type: String }],
    tier: { type: String, enum: ["A", "B", "C"], required: true },

    // Embed IDs → used by frontend for iframe embedding + child entitlement display
    flexiquiz_quiz_ids: [{ type: String }],

    // API Quiz IDs → used by provisioningService for fqAssignQuiz() calls
    flexiquiz_api_quiz_ids: [{ type: String }],

    price_cents: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    trial_quiz_ids: [{ type: String }],
    stripe_price_id: { type: String, default: null },
    quiz_count: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);
