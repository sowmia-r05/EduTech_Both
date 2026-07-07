/**
 * models/quizAttempt.js  (v5 — SHARED STATUS CONSTANTS)
 *
 * Tracks each child's attempt at a quiz.
 *
 * CHANGES FROM v4:
 *   ✅ Status strings now come from src/constants/attemptStatus.js — one source
 *      of truth shared by the model, routes, cron, count query, and tests.
 *      No more hand-typed "in_progress"/"scored"/etc. literals in this file.
 *
 * CHANGES FROM v3:
 *   ✅ Added "scoring" transient status — the submit handler claims an attempt
 *      by atomically flipping in_progress → scoring, so a duplicate submit loses
 *      the claim and receives a 409 rather than double-scoring.
 *
 * CHANGES FROM v2:
 *   ✅ Added a PARTIAL UNIQUE INDEX so at most one in-progress attempt can
 *      exist per (child_id, quiz_id). This is the DB-level guarantee that a
 *      double-start (double-click, second tab, React StrictMode double-effect,
 *      network retry) cannot create two live attempts. The /start route's
 *      atomic upsert relies on this: the losing side of a race gets an 11000
 *      duplicate-key error instead of a second attempt.
 *
 *   NOTE: If duplicate in-progress attempts ALREADY exist in the collection,
 *   this index will FAIL to build. Run the one-time cleanup script first
 *   (dedupeInProgressAttempts.js) before/at deploy.
 *
 * CHANGES FROM v1:
 *   ✅ Gap 5: No schema change needed (max_attempts lives on Quiz model)
 *   ✅ Gap 6: Added expires_at for server-side timer enforcement
 *   ✅ Gap 6: Added timer_expired flag
 *   ✅ Gap 6: Added "expired" to status enum
 *   ✅ Added proctoring sub-document
 *   ✅ Added performance_analysis field (from AI)
 */

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const {
  ATTEMPT_STATUS,
  ATTEMPT_STATUS_VALUES,
  FEEDBACK_STATUS,
  FEEDBACK_STATUS_VALUES,
} = require("../constants/attemptStatus");

const AnswerSchema = new mongoose.Schema(
  {
    question_id: { type: String, required: true },
    selected_option_ids: [{ type: String }],
    text_answer: { type: String, default: "" },
    points_scored: { type: Number, default: 0 },
    points_available: { type: Number, default: 0 },
    is_correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const TopicScoreSchema = new mongoose.Schema(
  {
    scored: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
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

const QuizAttemptSchema = new mongoose.Schema(
  {
    attempt_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
    },

    // ─── Always populated from JWT — never null ───
    child_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // ─── Quiz reference ───
    quiz_id: { type: String, required: true, index: true },
    quiz_name: { type: String, default: "" },
    subject: { type: String, default: "" },
    year_level: { type: Number },

    // ─── Status lifecycle ───
    // in_progress → scoring → scored → ai_done                        (MCQ)
    // in_progress → scoring → submitted → scored → ai_done            (writing)
    // in_progress → expired (timer ran out without submit)
    // Any → error
    //
    // ✅ "scoring" is a transient CLAIM state. The submit handler atomically flips
    //    in_progress → scoring, so a duplicate submit (double-click, timer
    //    auto-submit racing a manual submit, network retry) loses the claim and
    //    gets a 409 instead of double-scoring. On a scoring failure the handler
    //    MUST reset status back to "in_progress" (retryable) or "error".
    status: {
      type: String,
      enum: ATTEMPT_STATUS_VALUES,
      default: ATTEMPT_STATUS.IN_PROGRESS,
      index: true,
    },

    // ─── Timing ───
    started_at: { type: Date, default: Date.now },
    submitted_at: { type: Date, default: null },
    duration_sec: { type: Number, default: null },

    // ✅ Gap 6: Server-side timer expiry
    expires_at: { type: Date, default: null, index: true },
    timer_expired: { type: Boolean, default: false },

    // ─── Attempt number (auto-incremented per child+quiz) ───
    attempt_number: { type: Number, default: 1 },

    // ─── Answers ───
    answers: { type: [AnswerSchema], default: [] },

    // ─── Score (populated after submission for MCQ quizzes) ───
    score: {
      points: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      grade: { type: String, default: "" },
      pass: { type: Boolean, default: false },
    },

    // ─── Topic breakdown ───
    topic_breakdown: {
      type: Map,
      of: TopicScoreSchema,
      default: {},
    },

    // ─── Proctoring data ───
    proctoring: { type: ProctoringSchema, default: null },

    // ─── AI Performance Analysis (from Gemini) ───
    performance_analysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ─── AI Feedback ───
    ai_feedback: {
      overall_feedback: { type: String, default: "" },
      strengths: [{ type: String }],
      weaknesses: [{ type: String }],
      areas_of_improvement: [
        {
          issue: { type: String, default: "" },
          how_to_improve: { type: String, default: "" },
        },
      ],
      study_tips: [{ type: String }],
      encouragement: { type: String, default: "" },
      // Extended fields from gemini_subject_feedback.py
      coach: [
        {
          insight: { type: String, default: "" },
          reason: { type: String, default: "" },
          action: { type: String, default: "" },
        },
      ],
      growth_areas: [{ type: String }],
      cta: { type: String, default: "" },
      topic_wise_tips: [
        {
          topic: { type: String, default: "" },
          tips: [{ type: String }],
        },
      ],
    },
    ai_feedback_meta: {
      model: { type: String, default: "" },
      generated_at: { type: Date, default: null },
      subject: { type: String, default: "" },
      status: {
        type: String,
        enum: FEEDBACK_STATUS_VALUES,
        default: FEEDBACK_STATUS.PENDING,
      },
      status_message: { type: String, default: "" },
    },
  },
  { timestamps: true, versionKey: false }
);

// Compound indexes
QuizAttemptSchema.index({ child_id: 1, quiz_id: 1 });
QuizAttemptSchema.index({ child_id: 1, status: 1 });
QuizAttemptSchema.index({ parent_id: 1, child_id: 1 });
QuizAttemptSchema.index({ expires_at: 1, status: 1 }); // ✅ For expired attempt cleanup

// ✅ RACE-SAFE CLAIM: at most one in-progress attempt per (child_id, quiz_id).
// `status` is included in the key so this does NOT collide with the plain
// { child_id, quiz_id } index above (same key pattern + different options is
// rejected by MongoDB). The partialFilterExpression means the constraint only
// applies to in-progress rows — completed attempts (scored/ai_done/expired/…)
// drop out, so legitimate retakes still work.
QuizAttemptSchema.index(
  { child_id: 1, quiz_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ATTEMPT_STATUS.IN_PROGRESS },
    name: "uniq_active_attempt_per_child_quiz",
  }
);

module.exports = mongoose.model("QuizAttempt", QuizAttemptSchema);