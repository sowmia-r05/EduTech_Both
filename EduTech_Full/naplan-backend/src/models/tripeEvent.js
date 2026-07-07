/**
 * src/models/stripeEvent.js
 *
 * Idempotency ledger for Stripe webhook deliveries.
 * One document per SUCCESSFULLY-PROCESSED Stripe event.id.
 *
 * The unique index on event_id is what makes duplicate deliveries a no-op:
 * the webhook handler records an event only AFTER it has fully handled it,
 * then short-circuits any later delivery carrying an event.id already recorded.
 *
 * IMPORTANT: we never record an event BEFORE processing. Doing so would make a
 * retry of a FAILED provisioning find the event already logged and short-circuit,
 * defeating the 5xx-retry self-healing in paymentRoutes.js.
 */

const mongoose = require("mongoose");

const stripeEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    type: { type: String },
  },
  { timestamps: true },
);

// Guard against OverwriteModelError on repeated require / hot reload.
module.exports =
  mongoose.models.StripeEvent ||
  mongoose.model("StripeEvent", stripeEventSchema);