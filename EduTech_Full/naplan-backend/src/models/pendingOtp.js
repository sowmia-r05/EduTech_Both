// src/models/pendingOtp.js
const mongoose = require("mongoose");

const pendingOtpSchema = new mongoose.Schema(
  {
    email:      { type: String, required: true, lowercase: true, trim: true },
    purpose:    { type: String, required: true, enum: ["signup", "login"] },
    codeHash:   { type: String, required: true },
    profile:    { firstName: String, lastName: String }, // only used for signup
    attempts:   { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt:  { type: Date, required: true },
  },
  { timestamps: true }
);

// One live OTP per (email, purpose) — send/resend upserts this row.
pendingOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

// TTL index — Mongo auto-deletes once expiresAt passes (sweeper runs ~every 60s).
pendingOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingOtp", pendingOtpSchema);