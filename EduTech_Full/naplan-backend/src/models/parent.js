const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Parent: primary account holder.
 * Authenticates via email + password (or Auth0 SSO in future).
 * See Design Document v2.1 — Section 4.1
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

    password_hash: {
      type: String,
      default: null, // null if using SSO
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

    // 'local' | 'auth0'
    auth_provider: {
      type: String,
      default: "local",
      enum: ["local", "auth0"],
    },

    // Auth0 subject ID (if SSO)
    auth0_sub: {
      type: String,
      default: null,
    },

    email_verified: {
      type: Boolean,
      default: false,
    },

    // Token for email verification flow
    email_verify_token: {
      type: String,
      default: null,
    },

    email_verify_expires: {
      type: Date,
      default: null,
    },

    // Token for password reset flow
    password_reset_token: {
      type: String,
      default: null,
    },

    password_reset_expires: {
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
    timestamps: true, // createdAt + updatedAt
    versionKey: false,
  }
);

// ─── Indexes ───
ParentSchema.index({ stripe_customer_id: 1 }, { sparse: true });
ParentSchema.index({ auth0_sub: 1 }, { sparse: true });

// ─── Pre-save: hash password if modified ───
// Note: Mongoose 9+ async pre hooks do NOT receive next(); just return or throw.
ParentSchema.pre("save", async function () {
  if (!this.isModified("password_hash") || !this.password_hash) return;

  const salt = await bcrypt.genSalt(12);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
});

// ─── Instance method: compare password ───
ParentSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password_hash) return false;
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// ─── Instance method: safe JSON (strip sensitive fields) ───
ParentSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.email_verify_token;
  delete obj.email_verify_expires;
  delete obj.password_reset_token;
  delete obj.password_reset_expires;
  return obj;
};

module.exports = mongoose.model("Parent", ParentSchema);
