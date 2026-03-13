/**
 * models/cumulativeFeedback.js
 *
 * Stores Gemini-generated CUMULATIVE AI feedback for a child,
 * aggregated across ALL their quiz attempts for a given subject
 * (or "Overall" for cross-subject summary).
 *
 * One document per (child_id, subject) pair.
 * Upserted every time a new quiz attempt is completed.
 */

const mongoose = require("mongoose");

const ImprovementAreaSchema = new mongoose.Schema(
  {
    issue: { type: String, default: "" },
    how_to_improve: { type: String, default: "" },
  },
  { _id: false }
);

const CumulativeFeedbackSchema = new mongoose.Schema(
  {
    // ─── Identity ───
    child_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // "Overall" | "Reading" | "Writing" | "Numeracy" | "Language"
    subject: {
      type: String,
      required: true,
      enum: ["Overall", "Reading", "Writing", "Numeracy", "Language"],
    },

    // ─── Stats snapshot used to build the last prompt ───
    attempt_count: { type: Number, default: 0 },
    average_score: { type: Number, default: 0 },
    last_quiz_name: { type: String, default: "" },

    // ─── Gemini feedback ───
    feedback: {
      summary: { type: String, default: "" },
      strengths: { type: [String], default: [] },
      areas_for_improvement: { type: [ImprovementAreaSchema], default: [] },
      study_tips: { type: [String], default: [] },
      encouragement: { type: String, default: "" },
      // "improving" | "stable" | "declining" | "new"
      trend: { type: String, default: "new" },
      topic_highlights: { type: [String], default: [] },
    },

    // ─── Meta ───
    status: {
      type: String,
      enum: ["pending", "generating", "done", "error"],
      default: "pending",
    },
    status_message: { type: String, default: "" },
    model: { type: String, default: "" },
    generated_at: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index — one doc per child × subject
CumulativeFeedbackSchema.index({ child_id: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("CumulativeFeedback", CumulativeFeedbackSchema);