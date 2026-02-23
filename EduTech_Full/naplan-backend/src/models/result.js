const mongoose = require("mongoose");

/**
 * Results: one document per FlexiQuiz response submission.
 *
 * - Keep identifiers in snake_case to match FlexiQuiz payload.
 * - Group "points" related fields under score.
 * - Group user fields under user.
 * 
 */

const TopicScoreSchema = new mongoose.Schema(
  {
    scored: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const ResultSchema = new mongoose.Schema(
  {
    // FlexiQuiz webhook metadata (useful for debugging)
    event_id: { type: String, index: true },
    // Legacy field used by some older DB indexes / code paths.
    // NOTE: We do NOT make this unique in the schema; response_id is the true unique key.
    eventId: { type: String, index: true },
    event_type: { type: String },
    // ✅ Main identifiers from payload.data
    response_id: { type: String, required: true, index: true },

    // Optional mirror for older code paths (do not make it unique)
    responseId: { type: String, index: true },

    quiz_id: { type: String, index: true },
    quiz_name: { type: String },

    date_submitted: { type: Date, index: true },
    duration: { type: Number },
    attempt: { type: Number },
    status: { type: String },

    // Points-related fields grouped in a sub-document
    score: {
      points: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      grade: { type: String, default: "" },
      pass: { type: Boolean, default: false },
    },

    // User details grouped in a sub-document
    user: {
      user_id: { type: String, default: null, index: true },
      user_name: { type: String, default: null },
      first_name: { type: String, default: "" },
      last_name: { type: String, default: "" },
      email_address: { type: String, default: "" },
    },

    topicBreakdown: {

      type: Object,

      of: TopicScoreSchema,

      default: {},

    },

    // Convenience timestamp
    createdAt: { type: Date, default: Date.now },
      // =========================
    // ✅ AI FEEDBACK (added)
    // =========================

    // Optional: store quick computed stats used to build the prompt
    performance_analysis: {
      overall_percentage: Number,
      grade: String,
      high_performance_count: Number,
      low_performance_count: Number,
    },

    // Gemini feedback JSON
    ai_feedback: {
      overall_feedback: { type: String, default: "" },
      strengths: { type: [String], default: [] },
      weaknesses: { type: [String], default: [] },
      areas_of_improvement: {
        type: [
          new mongoose.Schema(
            {
              issue: { type: String, default: "" },
              how_to_improve: { type: String, default: "" },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
      study_tips: { type: [String], default: [] },
      encouragement: { type: String, default: "" },
       topic_wise_tips: {
    type: [
      new mongoose.Schema(
        {
          topic: { type: String, default: "" },
          tips: { type: [String], default: [] },
        },
        { _id: false }
      ),
    ],
    default: [],
  },

    },

      ai_feedback_meta: {
      model: { type: String, default: "" },           // e.g. "gemini-2.0-flash-exp"
      generated_at: { type: Date, default: null },    // When feedback was generated
      subject: { type: String, default: "" },         // e.g. "Numeracy (Mathematics)"
      quiz_name: { type: String, default: "" },       // Quiz name for reference
      source: { type: String, default: "" },          // e.g. "subject_feedback/gemini_subject_feedback_fixed.py"
      status: { type: String, default: "pending" },   // "pending", "done", "failed"
      status_message: { type: String, default: "" },  // Additional status info or error message
    },
  },
  {
    // Removes __v
    versionKey: false,
  }
);

module.exports = mongoose.model("Result", ResultSchema);
