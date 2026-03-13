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

const ProctoringSchema = new mongoose.Schema(
  {
    violations: { type: Number, default: 0 },
    fullscreen_enforced: { type: Boolean, default: false },
  },
  { _id: false }
);

const WritingSchema = new mongoose.Schema(
  {
    // ─── Identifiers ───
    response_id: { type: String, required: true, index: true }, // = QuizAttempt.attempt_id (UUID)
    attempt_id:  { type: String, index: true },                 // mirror of response_id for clarity
    quiz_id:     { type: String, index: true },
    quiz_name:   { type: String },

    // ─── Ownership ───
    child_id:  { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }, // ✅ NEW

    // ─── Quiz meta ───
    subject:    { type: String, default: "Writing" },
    year_level: { type: mongoose.Schema.Types.Mixed, default: null, index: true },

    // ─── User fields (kept for legacy UI compatibility) ───
    user: {
      user_name:     { type: String, default: null },
      first_name:    { type: String, default: "" },
      last_name:     { type: String, default: "" },
      email_address: { type: String, default: "" },
    },

    // ─── Timing ───
    started_at:   { type: Date, default: null },   // ✅ NEW
    submitted_at: { type: Date, index: true },
    expires_at:   { type: Date, default: null },   // ✅ NEW
    duration_sec: { type: Number },
    timer_expired: { type: Boolean, default: false }, // ✅ NEW

    // ─── Attempt tracking ───
    status:  { type: String },
    attempt: { type: Number }, // attempt number: 1, 2, 3...

    // ─── Proctoring ───
    proctoring: { type: ProctoringSchema, default: null }, // ✅ NEW

    // ─── Questions + answers ───
    qna: { type: [QnaSchema], default: [] },

    // ─── AI evaluation ───
    ai: {
      status:       { type: String, default: "pending", index: true },
      message:      { type: String, default: "" },
      evaluated_at: { type: Date, default: null },
      feedback:     { type: mongoose.Schema.Types.Mixed, default: null },
      error:        { type: String, default: null },
    },

    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Compound indexes for common queries
WritingSchema.index({ child_id: 1, quiz_id: 1 });
WritingSchema.index({ child_id: 1, submitted_at: -1 });
WritingSchema.index({ parent_id: 1, child_id: 1 });

module.exports = mongoose.model("Writing", WritingSchema);