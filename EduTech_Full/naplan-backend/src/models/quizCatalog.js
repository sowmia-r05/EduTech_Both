const mongoose = require("mongoose");

/**
 * Quiz Catalog: maps purchasable bundles to FlexiQuiz quiz IDs.
 * Source of truth for what a purchase unlocks.
 * See Design Document v2.1 — Section 4.4
 */
const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    bundle_name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    year_level: {
      type: Number,
      required: true,
      enum: [3, 5, 7, 9],
    },

    subjects: {
      type: [String],
      default: [],
    },

    // FlexiQuiz quiz IDs included in this bundle
    flexiquiz_quiz_ids: {
      type: [String],
      default: [],
    },

    // Price in AUD cents
    price_cents: {
      type: Number,
      required: true,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    // Free sample quiz IDs (no purchase needed)
    trial_quiz_ids: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);
