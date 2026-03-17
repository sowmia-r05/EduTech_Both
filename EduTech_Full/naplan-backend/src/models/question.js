/**
 * models/question.js  (v2 — SHORT ANSWER SUPPORT)
 *
 * Individual quiz question. Belongs to one or more quizzes via quiz_ids.
 *
 * CHANGES:
 *   ✅ shuffle_options — per-question toggle to randomize option order
 *   ✅ voice_url, video_url — per-question media
 *   ✅ image_size, image_width, image_height — image display control
 *   ✅ NEW: "short_answer" type — student types answer, auto-graded against correct_answer
 *   ✅ NEW: correct_answer field — stores the expected answer(s) for short_answer questions
 *   ✅ NEW: case_sensitive — whether grading should be case-sensitive (default: false)
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

    // ✅ NEW: Short answer — correct answer(s), pipe-separated for multiple accepted answers
    // Example: "1025" or "1 025" or "1025|1 025|one thousand twenty five"
    correct_answer: { type: String, default: null },

    // ✅ NEW: Case sensitive grading (default false = case-insensitive)
    case_sensitive: { type: Boolean, default: false },
    sub_topic: { type: String, default: null }, // ✅ e.g. "Addition Facts"

  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for efficient queries
QuestionSchema.index({ quiz_ids: 1, order: 1 });

module.exports = mongoose.model("Question", QuestionSchema);