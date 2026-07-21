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
    child_names: [{ type: String, default: "" }],
    bundle_id: { type: String, required: true, index: true },
    bundle_name: { type: String, default: "" },

    // Stripe
    stripe_session_id: { type: String, unique: true, sparse: true },
    stripe_payment_intent: { type: String, default: null },
    // Set by markPaidAndProvision from session.invoice when invoice_creation
    // is enabled. Lets support fetch the hosted invoice URL on request rather
    // than asking parents to find the email — the ACL proof of transaction.
    stripe_invoice_id: { type: String, default: null },
    amount_cents: { type: Number, required: true },
    currency: { type: String, default: "aud" },

    // Status
    status: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed", "cancelled"],
      default: "pending",
    },

    // Provisioning
    provisioned: { type: Boolean, default: false },
    provisioned_at: { type: Date, default: null },
    provision_error: { type: String, default: null },
    // Atomic claim lock for markPaidAndProvision(). Set when a run claims the
    // right to provision, cleared on completion. Stale locks (older than the
    // TTL in paymentRoutes.js) are treated as abandoned and can be re-claimed.
    provisioning_lock_at: { type: Date, default: null },

    // Expiry
    expires_at: { type: Date, default: null },
    erased_at: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Purchase", PurchaseSchema);