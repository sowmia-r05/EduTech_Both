/**
 * SCHEMA ADDITION for models/quizCatalog.js
 *
 * Add this field to the QuizCatalogSchema definition,
 * right after the flexiquiz_api_quiz_ids field:
 *
 *   // Native quiz IDs → for admin-uploaded quizzes (non-FlexiQuiz)
 *   quiz_ids: [{ type: String }],
 *
 * This keeps native quiz IDs separate from FlexiQuiz IDs.
 * The admin dashboard uses quiz_ids for mapping.
 * The provisioning service continues using flexiquiz_quiz_ids for FlexiQuiz.
 *
 * UPDATED SCHEMA should look like:
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
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);