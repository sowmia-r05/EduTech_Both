const mongoose = require("mongoose");

/**
 * FlexiQuiz Quizzes — synced from FlexiQuiz API via scripts/syncFlexiQuizzes.js
 *
 * This collection stores every quiz from your FlexiQuiz account
 * with parsed metadata (year_level, subject, difficulty, tier).
 *
 * It is the SOURCE OF TRUTH for mapping quiz_id → bundle tier.
 * The quiz_catalog collection references these quiz IDs.
 */
const FlexiQuizSchema = new mongoose.Schema(
  {
    // ── From FlexiQuiz API ──
    quiz_id: { type: String, required: true, unique: true, index: true },
    quiz_name: { type: String, required: true },
    short_code: { type: String, default: null },
    status: { type: String, default: "active" },
    date_created: { type: Date, default: null },

    // ── Parsed from quiz_name ──
    year_level: { type: Number, default: null, index: true },  // 3, 5, 7, 9
    subject: { type: String, default: null, index: true },      // Reading, Writing, Maths, Conventions
    difficulty: { type: String, default: null },                 // easy, medium, hard, or null
    set_number: { type: Number, default: 1 },                   // 1, 2, 3...
    is_full_length: { type: Boolean, default: false },           // true = complete NAPLAN-style test
    is_trial: { type: Boolean, default: false },                  // true = trial/sample exam (excluded from bundles)

    // ── Bundle tier assignment ──
    tier: {
      type: String,
      enum: ["A", "B", "C", null],
      default: null,
      index: true,
    },
    tier_order: { type: Number, default: 0 }, // ordering within tier
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "flexiquiz_quizzes",
  }
);

// Compound index for efficient queries
FlexiQuizSchema.index({ year_level: 1, tier: 1 });
FlexiQuizSchema.index({ year_level: 1, subject: 1 });

module.exports = mongoose.model("FlexiQuiz", FlexiQuizSchema);
