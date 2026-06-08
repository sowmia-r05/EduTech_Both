/**
 * models/aiImageUsage.js
 *
 * Tracks every AI image generation request — successful or failed —
 * so we can compute spend, enforce monthly budgets, and audit usage.
 *
 * Place in: naplan-backend/src/models/aiImageUsage.js
 */

const mongoose = require("mongoose");

const aiImageUsageSchema = new mongoose.Schema({
  admin_id:    { type: mongoose.Schema.Types.ObjectId, ref: "Admin", index: true },
  admin_email: { type: String, index: true },

  // Generation parameters
  prompt:   { type: String, maxlength: 1500 },
  model:    { type: String, required: true },     // "dall-e-3" | "gpt-image-1" | etc
  size:     { type: String, required: true },     // "1024x1024" | "1792x1024" | etc
  quality:  { type: String, default: "standard" },// "standard" | "hd" | "low" | "medium" | "high"

  // Cost & result
  cost_usd: { type: Number, required: true, default: 0 },
  s3_url:   { type: String },
  s3_key:   { type: String },

  // Linkage (optional)
  question_id: { type: String, index: true },
  quiz_id:     { type: String, index: true },

  // Status
  status: { type: String, enum: ["success", "failed"], default: "success", index: true },
  error:  { type: String, maxlength: 500 },

  created_at: { type: Date, default: Date.now, index: true },
});

// Compound index for usage queries
aiImageUsageSchema.index({ created_at: -1, status: 1 });
aiImageUsageSchema.index({ admin_id: 1, created_at: -1 });

module.exports = mongoose.model("AIImageUsage", aiImageUsageSchema);