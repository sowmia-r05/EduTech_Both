const mongoose = require("mongoose");

const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: { type: String, required: true, unique: true, index: true },
    bundle_name: { type: String, required: true },
    description: { type: String, default: "" },
    year_level: { type: Number, required: true, enum: [3, 5, 7, 9] },
    subjects: [{ type: String }], // ['Reading', 'Writing', 'Maths', 'Conventions']

    // ── Tier system ──
    tier: { type: String, enum: ["A", "B", "C"], default: null },

    // Quiz IDs that belong ONLY to this tier
    flexiquiz_quiz_ids: [{ type: String }],

    // Quiz IDs from ALL tiers up to and including this one (for standalone purchase)
    // e.g. Tier B's _with_lower = Tier A quizzes + Tier B quizzes
    flexiquiz_quiz_ids_with_lower: [{ type: String }],

    flexiquiz_group_id: { type: String, default: null }, // optional group-based assignment
    price_cents: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    trial_quiz_ids: [{ type: String }],
    stripe_price_id: { type: String, default: null }, // link to Stripe Price object

    // Computed counts (set by sync script)
    quiz_count: { type: Number, default: 0 },               // own tier only
    quiz_count_with_lower: { type: Number, default: 0 },     // including lower tiers
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);
