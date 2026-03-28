const mongoose = require("mongoose");

/**
 * Purchase: records a completed Stripe payment.
 * Links a parent to a bundle and the children it covers.
 * See Design Document v2.1 — Section 4.3
 */
const PurchaseSchema = new mongoose.Schema(
  {
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      index: true,
    },

    // Children this purchase covers
    child_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Child",
      },
    ],

    bundle_id: {
      type: String,
      required: true,
      index: true,
    },

    bundle_name: {
      type: String,
      required: true,
    },

    // Stripe references
    stripe_session_id: {
      type: String,
      unique: true,
      sparse: true,
    },

    stripe_payment_intent: {
      type: String,
      default: null,
    },

    // Amount in cents
    amount_cents: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "aud",
    },

    // 'pending' | 'paid' | 'refunded' | 'failed'
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "paid", "refunded", "failed"],
    },

    // FlexiQuiz provisioning status
    provisioned: {
      type: Boolean,
      default: false,
    },

    provisioned_at: {
      type: Date,
      default: null,
    },

    // Bundle expiry (if time-limited)
    expires_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Purchase", PurchaseSchema);
