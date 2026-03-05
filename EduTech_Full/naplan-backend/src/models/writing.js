const mongoose = require("mongoose");

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
    // identifiers
    response_id: { type: String, required: true, index: true },
    quiz_id: { type: String, index: true },
    quiz_name: { type: String },
    child_id: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    subject: { type: String, default: "Writing" },
    year_level: { type: mongoose.Schema.Types.Mixed, default: null, index: true },

    // user fields (kept for legacy UI compatibility)
    user: {
      user_name: { type: String, default: null },
      first_name: { type: String, default: "" },
      last_name: { type: String, default: "" },
      email_address: { type: String, default: "" },
    },

    // meta
    submitted_at: { type: Date, index: true },
    status: { type: String },
    duration_sec: { type: Number },
    attempt: { type: Number },

    // questions + answers
    qna: { type: [QnaSchema], default: [] },

    // AI evaluation
    ai: {
      status: { type: String, default: "pending", index: true },
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