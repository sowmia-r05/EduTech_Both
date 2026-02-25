const router = require("express").Router();
const Purchase = require("../models/purchase");
const Child = require("../models/child");

/**
 * POST /api/webhooks/stripe
 *
 * Stripe sends this when checkout.session.completed fires.
 * IMPORTANT: This route needs the RAW body for signature verification.
 * The raw body is stored on req.rawBody by the express.json verify callback in app.js.
 */
router.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  let event;

  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      console.log(`✅ Stripe checkout completed: ${session.id}`);

      try {
        // Find the pending purchase
        const purchase = await Purchase.findOne({
          stripe_session_id: session.id,
          status: "pending",
        });

        if (!purchase) {
          console.warn(`No pending purchase found for session: ${session.id}`);
          break;
        }

        // Update purchase to paid
        purchase.status = "paid";
        purchase.stripe_payment_intent = session.payment_intent;
        await purchase.save();

        console.log(`  Purchase ${purchase._id} marked as paid`);

        // TODO (Phase 4): Trigger FlexiQuiz provisioning
        // For now, just log that provisioning should happen
        console.log(`  📋 Provisioning needed for:`);
        console.log(`     Bundle: ${purchase.bundle_id}`);
        console.log(`     Children: ${purchase.child_ids.join(", ")}`);

        // Update children status from 'trial' to 'active'
        // (In Phase 4, this happens after FlexiQuiz provisioning succeeds)
        await Child.updateMany(
          { _id: { $in: purchase.child_ids } },
          { $set: { status: "active" } }
        );
        console.log(`  Children status updated to 'active'`);

      } catch (err) {
        console.error("Error processing checkout.session.completed:", err);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      console.log(`⏰ Stripe checkout expired: ${session.id}`);

      try {
        await Purchase.findOneAndUpdate(
          { stripe_session_id: session.id, status: "pending" },
          { $set: { status: "failed" } }
        );
      } catch (err) {
        console.error("Error handling expired session:", err);
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt (Stripe retries on non-2xx)
  return res.json({ received: true });
});

module.exports = router;
