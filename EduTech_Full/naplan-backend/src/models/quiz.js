/**
 * models/quiz.js  (v3 — RANDOMIZE + MEDIA SUPPORT)
 *
 * Native quiz metadata. Created by admin upload.
 *
 * CHANGES FROM v2:
 *   ✅ Gap 5: Added max_attempts field (configurable per quiz)
 *   ✅ NEW: randomize_questions — shuffle question order per attempt
 *   ✅ NEW: randomize_options — shuffle option order within each question
 *   ✅ NEW: voice_url — optional voice/audio resource for the quiz
 *   ✅ NEW: video_url — optional video resource for the quiz
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
    year_level: { type: Number, required: true, enum: [3, 5, 7, 9], index: true },
    subject: { type: String, required: true, index: true },
    question_ids: [{ type: String }], // Ordered list of question_id references
    question_count: { type: Number, default: 0 },
    time_limit_minutes: { type: Number, default: null }, // null = no limit
    total_points: { type: Number, default: 0 },
    tier: { type: String, enum: ["A", "B", "C"], default: "A", index: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard", null], default: null },
    set_number: { type: Number, default: 1 },
    is_trial: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },

    // ✅ Gap 5: Configurable max attempts per quiz (null = use global default of 5)
    max_attempts: { type: Number, default: null },

    // ✅ NEW: Randomization settings
    randomize_questions: { type: Boolean, default: false }, // shuffle question order each attempt
    randomize_options: { type: Boolean, default: false },   // shuffle option order within questions

    // ✅ NEW: Media support — voice & video URLs
    voice_url: { type: String, default: null }, // audio file URL (mp3, wav, etc.)
    video_url: { type: String, default: null }, // video file URL (mp4, YouTube, etc.)
  },
  { timestamps: true, versionKey: false }
);

QuizSchema.index({ year_level: 1, tier: 1 });
QuizSchema.index({ year_level: 1, subject: 1 });

module.exports = mongoose.model("Quiz", QuizSchema);