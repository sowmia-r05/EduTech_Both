const mongoose = require("mongoose");

const ParentSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },

    // Password auth (null for OTP-only or SSO users)
    password_hash: { type: String, default: null },

    auth_provider: {
      type: String,
      enum: ["local", "otp", "auth0"],
      default: "otp",
    },
    auth0_sub: { type: String, default: null },

    email_verified: { type: Boolean, default: false },

    stripe_customer_id: { type: String, default: null },

    status: {
      type: String,
      enum: ["active", "pending", "suspended", "deleted"],
      default: "active",
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Parent", ParentSchema);
