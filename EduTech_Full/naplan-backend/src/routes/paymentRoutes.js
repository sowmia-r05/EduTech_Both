/**
 * src/routes/paymentRoutes.js
 *
 * POST /api/payments/checkout              → Create Stripe Checkout session (Parent JWT)
 * POST /api/payments/webhook               → Stripe webhook (signature verified, no JWT)
 * GET  /api/payments/history               → Parent's purchase history (Parent JWT)
 * GET  /api/payments/verify/:sessionId     → Verify payment + return purchase details (Parent JWT)
 * POST /api/payments/retry/:purchaseId     → Retry payment for failed/pending purchase (Parent JWT)
 */

const router = require("express").Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { verifyToken, requireParent } = require("../middleware/auth");
const connectDB = require("../config/db");
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
    await connectDB();
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
        child_ids: childId,
        bundle_id: bundle_id,
        status: { $in: ["paid", "pending"] },
      }).lean();

      if (existingPurchase) {
        const childName =
          children.find((c) => c._id.toString() === childId)?.display_name ||
          "Child";

        if (existingPurchase.status === "paid") {
          return res.status(409).json({
            error: `${childName} already has the "${bundle.bundle_name}" bundle.`,
            code: "DUPLICATE_PURCHASE",
            child_name: childName,
            bundle_name: bundle.bundle_name,
          });
        }

        // Check if pending session is still fresh (< 30 min)
        const createdAt = new Date(existingPurchase.createdAt).getTime();
        const isRecent = Date.now() - createdAt < 30 * 60 * 1000;

        if (existingPurchase.status === "pending" && isRecent) {
          return res.status(409).json({
            error: `A checkout is already in progress for "${bundle.bundle_name}". Please complete or cancel it first.`,
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

    // ✅ MULTI-CURRENCY: Read currency from bundle (defaults to aud)
    const bundleCurrency = bundle.currency || "aud";

    // Build line items
    const lineItems = [
      {
        price_data: {
          currency: bundleCurrency,
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
      currency: bundleCurrency,
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
      await connectDB();

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
    await connectDB();
    const parentId = req.user?.parentId || req.user?.parent_id;

    const purchases = await Purchase.find({ parent_id: parentId })
      .sort({ createdAt: -1 })
      .populate("child_ids", "display_name username year_level status")
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
// ────────────────────────────────────────────
router.get("/verify/:sessionId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user?.parentId || req.user?.parent_id;
    const { sessionId } = req.params;

    const purchase = await Purchase.findOne({
      stripe_session_id: sessionId,
      parent_id: parentId,
    })
      .populate("child_ids", "display_name username year_level status")
      .lean();

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    const bundle = await QuizCatalog.findOne({ bundle_id: purchase.bundle_id }).lean();

    return res.json({
      ok: true,
      purchase,
      children: purchase.child_ids,
      bundle: bundle || null,
    });
  } catch (err) {
    console.error("Payment verify error:", err);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
});

// ────────────────────────────────────────────
// POST /api/payments/retry/:purchaseId
// Retry payment for a pending/failed purchase (creates new Stripe session)
// ────────────────────────────────────────────
router.post("/retry/:purchaseId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user?.parentId || req.user?.parent_id;
    const { purchaseId } = req.params;

    // 1. Find the purchase — must belong to this parent and be pending/failed
    const purchase = await Purchase.findOne({
      _id: purchaseId,
      parent_id: parentId,
      status: { $in: ["pending", "failed"] },
    }).lean();

    if (!purchase) {
      return res.status(404).json({
        error: "Purchase not found or not eligible for retry",
      });
    }

    // 2. Verify bundle still exists and is active
    const bundle = await QuizCatalog.findOne({
      bundle_id: purchase.bundle_id,
      is_active: true,
    });

    if (!bundle) {
      return res.status(404).json({
        error: "This bundle is no longer available",
      });
    }

    // 3. Verify children still belong to parent
    const children = await Child.find({
      _id: { $in: purchase.child_ids },
      parent_id: parentId,
    }).lean();

    if (children.length === 0) {
      return res.status(400).json({
        error: "No valid children found for this purchase",
      });
    }

    // 4. Get or create Stripe customer
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

    // ✅ MULTI-CURRENCY: Read currency from bundle (defaults to aud)
    const bundleCurrency = bundle.currency || "aud";

    // 6. Build line items
    const lineItems = [
      {
        price_data: {
          currency: bundleCurrency,
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

    // 7. Create new Stripe Checkout session
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
        childIds: purchase.child_ids.map((id) => id.toString()).join(","),
        bundleId: purchase.bundle_id,
      },
    });

    // 8. Update existing purchase with new session (reuse record, don't create duplicate)
    await Purchase.findByIdAndUpdate(purchase._id, {
      $set: {
        stripe_session_id: session.id,
        status: "pending",
        amount_cents: bundle.price_cents * children.length,
        currency: bundleCurrency,
      },
    });

    return res.json({
      ok: true,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error("Retry payment error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create retry checkout session" });
  }
});

// ────────────────────────────────────────────
// ✅ Issue #3: POST /api/payments/retry-provision/:purchaseId
// Parent-triggered retry of quiz assignment after provisioning failure
// ────────────────────────────────────────────
router.post("/retry-provision/:purchaseId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();

    const purchaseId = req.params.purchaseId;
    const parentId = req.user.parentId || req.user.parent_id;

    // Find the purchase — must belong to this parent and be paid but not provisioned
    const purchase = await Purchase.findOne({
      _id: purchaseId,
      parent_id: parentId,
      status: "paid",
      provisioned: false,
    });

    if (!purchase) {
      return res.status(404).json({
        error: "Purchase not found or already provisioned.",
      });
    }

    // Clear old error before retrying
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provision_error: null },
    });

    // Respond immediately — provisioning runs in background
    res.json({
      ok: true,
      message: "Provisioning retry started. Quizzes will appear in a few minutes.",
    });

    // Run provisioning in background
    setImmediate(async () => {
      try {
        const result = await provisionPurchase(purchaseId);
        if (result.success) {
          console.log(`✅ Retry provisioning succeeded for purchase ${purchaseId}`);
        } else {
          console.error(`❌ Retry provisioning failed for purchase ${purchaseId}:`, result.error);
        }
      } catch (err) {
        console.error(`❌ Retry provisioning error for purchase ${purchaseId}:`, err.message);
        await Purchase.findByIdAndUpdate(purchaseId, {
          $set: { provision_error: `Retry failed: ${err.message}` },
        }).catch(() => {});
      }
    });
  } catch (err) {
    console.error("Retry provision error:", err);
    return res.status(500).json({ error: "Failed to retry provisioning" });
  }
});

module.exports = router;
