/**
 * models/quiz.js  (v2 — GAPS FILLED)
 *
 * Native quiz metadata. Created by admin upload.
 *
 * CHANGES FROM v1:
 *   ✅ Gap 5: Added max_attempts field (configurable per quiz)
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
  },
  { timestamps: true, versionKey: false }
);

QuizSchema.index({ year_level: 1, tier: 1 });
QuizSchema.index({ year_level: 1, subject: 1 });

module.exports = mongoose.model("Quiz", QuizSchema);
