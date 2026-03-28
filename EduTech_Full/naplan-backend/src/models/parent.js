const mongoose = require("mongoose");

/**
 * Parent: primary account holder.
 * Passwordless auth: Email OTP or Google SSO.
 * No passwords stored.
 */
const ParentSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    first_name: {
      type: String,
      required: true,
      trim: true,
    },

    last_name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    // 'otp' | 'google' | 'both' (tracks how they first signed up)
    auth_provider: {
      type: String,
      default: "otp",
      enum: ["otp", "google", "both"],
    },

    // Google OAuth subject ID
    google_sub: {
      type: String,
      default: null,
      sparse: true,
    },

    // Google profile picture URL (optional)
    google_picture: {
      type: String,
      default: null,
    },

    email_verified: {
      type: Boolean,
      default: false,
    },

    // ─── OTP fields (in-DB instead of in-memory for multi-instance support) ───

    otp_hash: {
      type: String,
      default: null,
    },

    otp_expires: {
      type: Date,
      default: null,
    },

    otp_attempts: {
      type: Number,
      default: 0,
    },

    otp_last_sent: {
      type: Date,
      default: null,
    },

    // Created on first Stripe purchase
    stripe_customer_id: {
      type: String,
      default: null,
    },

    // 'active' | 'suspended' | 'deleted'
    status: {
      type: String,
      default: "active",
      enum: ["active", "suspended", "deleted"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ─── Indexes ───
ParentSchema.index({ google_sub: 1 }, { sparse: true });
ParentSchema.index({ stripe_customer_id: 1 }, { sparse: true });

// ─── Instance method: safe JSON (strip sensitive fields) ───
ParentSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.otp_hash;
  delete obj.otp_expires;
  delete obj.otp_attempts;
  delete obj.otp_last_sent;
  return obj;
};

module.exports = mongoose.model("Parent", ParentSchema);
