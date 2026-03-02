/**
 * UPDATED: models/quizCatalog.js
 *
 * ═══════════════════════════════════════════════════════════════
 * CHANGES FROM ORIGINAL:
 *   ✅ Added `currency` field (aud, inr, usd) — default "aud" for backward compat
 *   ✅ Added `distribution_mode` field ("standard" | "swap") — default "standard"
 *   ✅ Added `swap_eligible_from` array — bundle_ids this bundle can absorb quizzes from
 *   ✅ Added `max_quiz_count` — admin-defined max quizzes allowed in bundle
 *   ✅ Added `questions_per_quiz` — number of questions per quiz in this bundle
 *   Everything else is IDENTICAL to the original.
 * ═══════════════════════════════════════════════════════════════
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

    // ── FlexiQuiz IDs (legacy — for iframe embedding) ──
    flexiquiz_quiz_ids: [{ type: String }],
    flexiquiz_api_quiz_ids: [{ type: String }],

    // ── Native Quiz IDs (admin-uploaded quizzes) ──
    quiz_ids: [{ type: String }],

    price_cents: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    trial_quiz_ids: [{ type: String }],
    stripe_price_id: { type: String, default: null },
    quiz_count: { type: Number, default: 0 },

    // ═══════════════════════════════════════════════
    // ✅ NEW FIELDS — Bundle Manager Enhancement
    // ═══════════════════════════════════════════════

    // Multi-currency support: "aud" (default), "inr", "usd"
    currency: {
      type: String,
      enum: ["aud", "inr", "usd"],
      default: "aud",
    },

    // Max quizzes this bundle should hold (admin-defined cap)
    max_quiz_count: { type: Number, default: 0 },

    // Number of questions per quiz in this bundle
    questions_per_quiz: { type: Number, default: 0 },

    // Distribution logic: "standard" = no sharing, "swap" = cascade from lower bundles
    distribution_mode: {
      type: String,
      enum: ["standard", "swap"],
      default: "standard",
    },

    // For swap mode: array of bundle_ids this bundle can absorb quizzes from
    // e.g. if Bundle C has swap_eligible_from: ["bundle_a", "bundle_b"],
    // then when user buys C without owning A or B, quizzes from A/B fill first
    swap_eligible_from: [{ type: String }],
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);