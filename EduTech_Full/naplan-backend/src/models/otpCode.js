// src/models/otpCode.js
//
// ═══════════════════════════════════════════════════════════════════════════
// A11 FIX — persistent OTP store.
//
// The old implementation was `const otpStore = new Map()` inside otpAuth.js.
// That is process memory. On Render's free tier the instance SLEEPS after 15
// minutes of inactivity, and a cold start creates a brand-new process with a
// brand-new, empty Map. Real-world consequence:
//
//   1. Parent requests an OTP.  Code is emailed.  Hash lives in the Map.
//   2. Render goes to sleep (or redeploys, or the process restarts).
//   3. Parent types the CORRECT code.
//   4. The Map is empty -> "OTP expired. Please request a new one."
//
// It also cannot work across more than one instance: the OTP would be stored on
// box A and verified on box B. And the 30-second resend cooldown and the
// 5-attempt lockout live in that same Map, so BOTH abuse controls reset to zero
// on every cold start.
//
// MongoDB with a TTL index fixes all of it: shared across instances, survives
// restarts, and Mongo deletes expired documents for us.
//
// NOTE ON THE TTL INDEX: Mongo's background reaper runs about once a minute, so
// a document can linger a little past expiresAt. We therefore ALSO check
// expiresAt explicitly in the verify path. The index is for cleanup, not for
// correctness — never rely on it to enforce expiry.
// ═══════════════════════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const OtpCodeSchema = new mongoose.Schema(
  {
    // Lookup key — the username/email the OTP was requested for, lowercased.
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    // HMAC-SHA256 of `${key}:${otp}` using OTP_SECRET. The plaintext code is
    // NEVER stored — a database dump must not hand out live OTPs.
    otp_hash: {
      type: String,
      required: true,
    },

    // The address the code was actually sent to. Captured at request time so
    // verify doesn't have to hit the Parent collection again.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Wrong-guess counter. Persisted, so a restart no longer resets it to 0.
    attempts: {
      type: Number,
      default: 0,
    },

    // Powers the 30-second resend cooldown. Persisted for the same reason.
    last_sent_at: {
      type: Date,
      default: Date.now,
    },

    // TTL anchor. Mongo deletes the document once this passes.
    expires_at: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

// TTL index: expireAfterSeconds: 0 means "delete when expires_at is reached".
OtpCodeSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpCode", OtpCodeSchema);