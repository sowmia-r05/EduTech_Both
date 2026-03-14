/**
 * models/adminInvite.js
 *
 * One-time invite tokens for admin registration.
 * Created only by a super_admin. Single-use, expires in 24 hours.
 * MongoDB TTL index auto-deletes expired documents.
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const AdminInviteSchema = new mongoose.Schema(
  {
    // The random token embedded in the invite URL
    token: {
      type:     String,
      required: true,
      unique:   true,
      default:  () => crypto.randomBytes(32).toString("hex"),
    },

    // Email of the super_admin who created this invite
    created_by: {
      type:     String,
      required: true,
    },

    // Whether this invite has already been used
    used: {
      type:    Boolean,
      default: false,
    },

    // Auto-delete after 24 hours (MongoDB TTL index)
    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      expires: 0,
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("AdminInvite", AdminInviteSchema);
