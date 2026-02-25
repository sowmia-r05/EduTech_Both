const mongoose = require("mongoose");

const PurchaseSchema = new mongoose.Schema(
  {
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      index: true,
    },
    child_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Child",
      },
    ],
    bundle_id: { type: String, required: true, index: true },
    bundle_name: { type: String, default: "" },

    // Stripe
    stripe_session_id: { type: String, unique: true, sparse: true },
    stripe_payment_intent: { type: String, default: null },
    amount_cents: { type: Number, required: true },
    currency: { type: String, default: "aud" },

    // Status
    status: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
    },

    // Provisioning
    provisioned: { type: Boolean, default: false },
    provisioned_at: { type: Date, default: null },
    provision_error: { type: String, default: null },

    // Expiry
    expires_at: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Purchase", PurchaseSchema);