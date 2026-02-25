/**
 * src/routes/paymentRoutes.js
 *
 * POST /api/payments/checkout       → Create Stripe Checkout session (Parent JWT)
 * POST /api/payments/webhook        → Stripe webhook (signature verified, no JWT)
 * GET  /api/payments/history        → Parent's purchase history (Parent JWT)
 * GET  /api/payments/verify/:sessionId → Verify payment + return purchase details (Parent JWT)
 */

const router = require("express").Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { verifyToken, requireParent } = require("../middleware/auth");
const Purchase = require("../models/purchase");
const QuizCatalog = require("../models/quizCatalog");
const Child = require("../models/child");
const Parent = require("../models/parent");
const { provisionPurchase } = require("../services/provisioningService");

// ────────────────────────────────────────────
// POST /api/payments/checkout
// Body: { bundle_id, child_ids: [childId1, ...] }
// Returns: { ok, checkout_url, session_id }
// ────────────────────────────────────────────
router.post("/checkout", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user?.parentId || req.user?.parent_id;
    const { bundle_id, child_ids } = req.body;

    if (!bundle_id) {
      return res.status(400).json({ error: "bundle_id is required" });
    }
    if (!Array.isArray(child_ids) || child_ids.length === 0) {
      return res.status(400).json({ error: "child_ids array is required" });
    }

    // Verify bundle exists and is active
    const bundle = await QuizCatalog.findOne({ bundle_id, is_active: true });
    if (!bundle) {
      return res.status(404).json({ error: "Bundle not found or not active" });
    }

    // Verify all children belong to this parent
    const children = await Child.find({
      _id: { $in: child_ids },
      parent_id: parentId,
    }).lean();

    if (children.length !== child_ids.length) {
      return res
        .status(403)
        .json({ error: "One or more children do not belong to you" });
    }

    // ── Check for duplicate purchases ──
    for (const childId of child_ids) {
      const existingPurchase = await Purchase.findOne({
        parent_id: parentId,
        bundle_id: bundle_id,
        child_ids: childId,
        status: { $in: ["paid", "pending"] },
      }).lean();

      if (existingPurchase) {
        const child = children.find(
          (c) => c._id.toString() === childId.toString()
        );
        const childName = child?.display_name || child?.username || childId;

        if (existingPurchase.status === "paid") {
          return res.status(409).json({
            error: `${childName} already has the "${bundle.bundle_name}" bundle. No need to purchase again.`,
            code: "DUPLICATE_PURCHASE",
            child_name: childName,
            bundle_name: bundle.bundle_name,
          });
        }

        if (existingPurchase.status === "pending") {
          const sessionAge =
            Date.now() - new Date(existingPurchase.createdAt).getTime();
          const ONE_HOUR = 60 * 60 * 1000;

          if (sessionAge < ONE_HOUR) {
            return res.status(409).json({
              error: `A checkout session for ${childName} + "${bundle.bundle_name}" is already in progress. Please complete or cancel it first.`,
              code: "CHECKOUT_IN_PROGRESS",
              child_name: childName,
              bundle_name: bundle.bundle_name,
            });
          } else {
            // Old pending session — mark as failed and allow new checkout
            await Purchase.findByIdAndUpdate(existingPurchase._id, {
              $set: { status: "failed" },
            });
          }
        }
      }
    }

    // Get or create Stripe customer
    const parent = await Parent.findById(parentId);
    let customerId = parent?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: parent.email,
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        metadata: { parentId: parentId.toString() },
      });
      customerId = customer.id;
      await Parent.findByIdAndUpdate(parentId, {
        $set: { stripe_customer_id: customerId },
      });
    }

    // Build line items
    const lineItems = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: bundle.bundle_name,
            description:
              bundle.description ||
              `${bundle.bundle_name} for ${children.length} child(ren)`,
          },
          unit_amount: bundle.price_cents,
        },
        quantity: children.length,
      },
    ];

    // Create Stripe Checkout session
    const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${FRONTEND_URL}#/parent-dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}#/parent-dashboard?payment=cancelled`,
      metadata: {
        parentId: parentId.toString(),
        childIds: child_ids.join(","),
        bundleId: bundle_id,
      },
    });

    // Create pending Purchase record
    await Purchase.create({
      parent_id: parentId,
      child_ids: child_ids,
      bundle_id: bundle_id,
      bundle_name: bundle.bundle_name,
      stripe_session_id: session.id,
      amount_cents: bundle.price_cents * children.length,
      currency: "aud",
      status: "pending",
    });

    return res.json({
      ok: true,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create checkout session" });
  }
});

// ────────────────────────────────────────────
// POST /api/payments/webhook
// Stripe webhook — verifies signature, updates Purchase, triggers provisioning
//
// NOTE: This route needs the raw body for signature verification.
// app.js must use express.json({ verify: (req, res, buf) => { req.rawBody = buf; }})
// ────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody || req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // ACK immediately
  res.status(200).json({ received: true });

  // Process asynchronously
  setImmediate(async () => {
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const sessionId = session.id;
        const paymentIntent = session.payment_intent;

        // ── Update Purchase status → 'paid' ──
        const purchase = await Purchase.findOneAndUpdate(
          { stripe_session_id: sessionId },
          {
            $set: {
              status: "paid",
              stripe_payment_intent: paymentIntent,
            },
          },
          { new: true }
        );

        if (!purchase) {
          console.error(`⚠️ No Purchase found for session ${sessionId}`);
          return;
        }

        console.log(`💰 Payment confirmed for purchase ${purchase._id}`);

        // ── Trigger provisioning ──
        const result = await provisionPurchase(purchase._id.toString());

        if (result.success) {
          console.log(`✅ Provisioning complete for purchase ${purchase._id}`);
        } else {
          console.error(
            `❌ Provisioning failed for purchase ${purchase._id}:`,
            result.error
          );
        }
      }
    } catch (err) {
      console.error("Stripe webhook processing error:", err);
    }
  });
});

// ────────────────────────────────────────────
// GET /api/payments/history
// Returns all purchases for the authenticated parent
// ────────────────────────────────────────────
router.get("/history", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user?.parentId || req.user?.parent_id;

    const purchases = await Purchase.find({ parent_id: parentId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(purchases);
  } catch (err) {
    console.error("Payment history error:", err);
    return res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

// ────────────────────────────────────────────
// GET /api/payments/verify/:sessionId
// Returns purchase details after Stripe redirect (for the success modal).
// Populates child names + bundle info so the frontend can show a proper receipt.
// ────────────────────────────────────────────
router.get(
  "/verify/:sessionId",
  verifyToken,
  requireParent,
  async (req, res) => {
    try {
      const parentId = req.user?.parentId || req.user?.parent_id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const purchase = await Purchase.findOne({
        stripe_session_id: sessionId,
        parent_id: parentId,
      }).lean();

      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Fetch child details
      const childDocs = await Child.find({
        _id: { $in: purchase.child_ids },
      })
        .select("display_name username year_level status")
        .lean();

      // Fetch bundle details
      const bundle = await QuizCatalog.findOne({
        bundle_id: purchase.bundle_id,
      })
        .select("bundle_name description year_level subjects price_cents")
        .lean();

      return res.json({
        ok: true,
        purchase: {
          _id: purchase._id,
          bundle_id: purchase.bundle_id,
          bundle_name: purchase.bundle_name,
          amount_cents: purchase.amount_cents,
          currency: purchase.currency,
          status: purchase.status,
          provisioned: purchase.provisioned,
          provisioned_at: purchase.provisioned_at,
          createdAt: purchase.createdAt,
        },
        children: childDocs.map((c) => ({
          _id: c._id,
          name: c.display_name,
          username: c.username,
          year_level: c.year_level,
          status: c.status,
        })),
        bundle: bundle
          ? {
              bundle_name: bundle.bundle_name,
              description: bundle.description,
              year_level: bundle.year_level,
              subjects: bundle.subjects,
              price_cents: bundle.price_cents,
            }
          : null,
      });
    } catch (err) {
      console.error("Payment verify error:", err);
      return res
        .status(500)
        .json({ error: "Failed to verify payment session" });
    }
  }
);

module.exports = router;