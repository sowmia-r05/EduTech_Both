const mongoose = require("mongoose");

/**
 * WritingResults: one document per *submitted* FlexiQuiz response
 * for any quiz whose name contains the word "writing".
 *
 * Writing quizzes usually have no numeric score, so we store the full
 * question + answer text payload for downstream AI evaluation.
 */

const QnaSchema = new mongoose.Schema(
  {
    question_id: { type: String },
    type: { type: String },
    question_text: { type: String, default: "" },
    answer_text: { type: String, default: "" },
  },
  { _id: false }
);

const WritingSchema = new mongoose.Schema(
  {
    // webhook metadata
    event_id: { type: String, index: true },
    event_type: { type: String },
    delivery_attempt: { type: Number },

    // identifiers
    response_id: { type: String, required: true, index: true },
    quiz_id: { type: String, index: true },
    quiz_name: { type: String },

    // user fields (best-effort)
    user: {
      user_id: { type: String, default: null, index: true },
      user_name: { type: String, default: null },
      user_type: { type: String, default: "" },
      email_address: { type: String, default: "" },
      first_name: { type: String, default: "" },
      last_name: { type: String, default: "" },
    },

    // meta
    date_created: { type: Date, index: true },
    submitted_at: { type: Date, index: true },
    status: { type: String },
    duration_sec: { type: Number },
    attempt: { type: Number },

    // questions + answers
    qna: { type: [QnaSchema], default: [] },



// AI evaluation (Gemini)
ai: {
  status: { type: String, default: "pending", index: true }, // pending|verifying|generating|done|error
  message: { type: String, default: "" },
  evaluated_at: { type: Date, default: null },
  feedback: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: null },
},


    createdAt: { type: Date, default: Date.now },
  },

  { versionKey: false }
);

module.exports = mongoose.model("Writing", WritingSchema);
