/**
 * models/quiz.js  (v4 — ALL FIELDS OPTIONAL)
 *
 * Native quiz metadata. Created by admin upload.
 *
 * CHANGES:
 *   ✅ year_level — optional free-text (was: Number, required, enum [3,5,7,9])
 *   ✅ subject — optional free-text (was: required)
 *   ✅ tier — optional free-text (was: enum [A,B,C])
 *   ✅ max_attempts, randomize_questions, randomize_options
 *   ✅ voice_url, video_url
 */

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const QuizSchema = new mongoose.Schema(
  {
    quiz_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
    },
    quiz_name: { type: String, required: true },
    year_level: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
    subject: { type: String, default: null, index: true },
    question_ids: [{ type: String }],
    question_count: { type: Number, default: 0 },
    time_limit_minutes: { type: Number, default: null },
    total_points: { type: Number, default: 0 },
    tier: { type: String, default: null, index: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard", null], default: null },
    set_number: { type: Number, default: 1 },
    is_trial: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },

    // Configurable max attempts per quiz
    max_attempts: { type: Number, default: null },

    // Randomization settings
    randomize_questions: { type: Boolean, default: false },
    randomize_options: { type: Boolean, default: false },

    // Media resources
    voice_url: { type: String, default: null },
    video_url: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

QuizSchema.index({ year_level: 1, tier: 1 });
QuizSchema.index({ year_level: 1, subject: 1 });

module.exports = mongoose.model("Quiz", QuizSchema);