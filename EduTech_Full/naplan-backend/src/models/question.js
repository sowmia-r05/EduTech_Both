/**
 * models/question.js  (v3 — TUTOR VERIFICATION)
 *
 * CHANGES:
 *   ✅ Added tutor_verification sub-document
 *     - status: "pending" | "approved" | "rejected"
 *     - verified_by: tutor's email
 *     - verified_at: timestamp
 *     - rejection_reason: optional note
 *   Rejected questions are filtered out when serving to child quiz pages.
 */

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const OptionSchema = new mongoose.Schema(
  {
    option_id: { type: String, default: () => uuidv4() },
    text: { type: String, default: "" },
    image_url: { type: String, default: null },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const CategorySchema = new mongoose.Schema(
  {
    category_id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true },
  },
  { _id: false }
);

// ✅ NEW: Tutor verification sub-document
const TutorVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    verified_by: { type: String, default: null },   // tutor email
    verified_at: { type: Date, default: null },
    rejection_reason: { type: String, default: null },
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    question_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
    },
    quiz_ids: [{ type: String, index: true }],
    type: {
      type: String,
      required: true,
      enum: ["radio_button", "picture_choice", "free_text", "checkbox", "short_answer"],
    },
    text: { type: String, required: true },
    options: { type: [OptionSchema], default: [] },
    points: { type: Number, default: 1 },
    categories: { type: [CategorySchema], default: [] },
    order: { type: Number, default: 0 },
    year_level: { type: Number, index: true },
    subject: { type: String, index: true },
    image_url: { type: String, default: null },
    explanation: { type: String, default: "" },

    // Per-question shuffle toggle
    shuffle_options: { type: Boolean, default: false },

    // Per-question media URLs
    voice_url: { type: String, default: null },
    video_url: { type: String, default: null },

    // Image display size
    image_size: { type: String, default: "medium", enum: ["small", "medium", "large", "full"] },
    image_width: { type: Number, default: null },
    image_height: { type: Number, default: null },

    // Short answer grading
    correct_answer: { type: String, default: null },
    case_sensitive: { type: Boolean, default: false },

    sub_topic: { type: String, default: null },

    // ✅ NEW: Tutor verification
    tutor_verification: {
      type: TutorVerificationSchema,
      default: () => ({ status: "pending", verified_by: null, verified_at: null, rejection_reason: null }),
    },
  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for efficient queries
QuestionSchema.index({ quiz_ids: 1, order: 1 });
QuestionSchema.index({ "tutor_verification.status": 1 });

module.exports = mongoose.model("Question", QuestionSchema);