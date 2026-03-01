/**
 * models/question.js
 *
 * Individual quiz question. Belongs to one or more quizzes via quiz_ids.
 * Created by admin upload (Excel → parse → save).
 *
 * ✅ NEW: shuffle_options — per-question toggle to randomize option order
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
      enum: ["radio_button", "picture_choice", "free_text", "checkbox"],
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

    // ✅ NEW: Per-question shuffle toggle
    shuffle_options: { type: Boolean, default: false },

    // ✅ NEW: Per-question media URLs
    voice_url: { type: String, default: null },
    video_url: { type: String, default: null },

    // ✅ NEW: Image display size (small / medium / large / full)
    image_size: { type: String, default: "medium", enum: ["small", "medium", "large", "full"] },
    image_width: { type: Number, default: null },
    image_height: { type: Number, default: null },

  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for efficient queries
QuestionSchema.index({ quiz_ids: 1, order: 1 });

module.exports = mongoose.model("Question", QuestionSchema);