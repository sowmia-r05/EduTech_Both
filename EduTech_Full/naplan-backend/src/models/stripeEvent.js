// src/models/stripeEvent.js
//
// Idempotency ledger for Stripe webhooks. Stripe can deliver the same event
// more than once; we record each event_id the first time we handle it, and the
// unique index makes a second insert of the same event_id fail — that's the
// signal to skip re-processing (so we never double-provision a purchase).

const mongoose = require("mongoose");

const stripeEventSchema = new mongoose.Schema(
  {
    // Stripe's event id (evt_...). Unique → dedup key.
    event_id: { type: String, required: true, unique: true, index: true },

    // e.g. "checkout.session.completed"
    type: { type: String, default: "" },

    // When we finished handling it.
    processed_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StripeEvent", stripeEventSchema);