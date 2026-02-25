const router = require("express").Router();
const { requireParent } = require("../middleware/auth");
const QuizCatalog = require("../models/quizCatalog");
const Purchase = require("../models/purchase");
const Child = require("../models/child");

// Stripe is loaded lazily to avoid crash if key not set
let stripe = null;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripe = require("stripe")(key);
  }
  return stripe;
}

const FRONTEND_URL = () => process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// ────────────────────────────────────────────
// POST /api/payments/checkout
// Creates a Stripe Checkout session for a bundle purchase.
// Body: { bundle_id, child_ids: [childId1, childId2] }
// ────────────────────────────────────────────
router.post("/checkout", requireParent, async (req, res) => {
  try {
    const { bundle_id, child_ids } = req.body || {};

    if (!bundle_id) {
      return res.status(400).json({ error: "bundle_id is required" });
    }
    if (!child_ids || !Array.isArray(child_ids) || child_ids.length === 0) {
      return res.status(400).json({ error: "At least one child_id is required" });
    }

    // Validate bundle exists
    const bundle = await QuizCatalog.findOne({ bundle_id, is_active: true });
    if (!bundle) {
      return res.status(404).json({ error: "Bundle not found" });
    }

    // Validate children belong to this parent
    const children = await Child.find({
      _id: { $in: child_ids },
      parent_id: req.user.parentId,
    });
    if (children.length !== child_ids.length) {
      return res.status(400).json({ error: "One or more child IDs are invalid" });
    }

    // Check for duplicate purchase (same bundle + same children)
    const existingPurchase = await Purchase.findOne({
      parent_id: req.user.parentId,
      bundle_id,
      child_ids: { $all: child_ids },
      status: "paid",
    });
    if (existingPurchase) {
      return res.status(409).json({ error: "This bundle has already been purchased for these children" });
    }

    const s = getStripe();

    // Create Stripe Checkout session
    const session = await s.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      currency: "aud",
      line_items: [
        {
          price_data: {
            currency: "aud",
            unit_amount: bundle.price_cents,
            product_data: {
              name: bundle.bundle_name,
              description: bundle.description || `NAPLAN preparation bundle for Year ${bundle.year_level}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        parentId: req.user.parentId,
        childIds: JSON.stringify(child_ids),
        bundleId: bundle_id,
      },
      // HashRouter uses #, so we use query params for success/cancel
      success_url: `${FRONTEND_URL()}/#/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL()}/#/payment-cancel`,
    });

    // Create pending purchase record
    await Purchase.create({
      parent_id: req.user.parentId,
      child_ids,
      bundle_id,
      bundle_name: bundle.bundle_name,
      stripe_session_id: session.id,
      amount_cents: bundle.price_cents,
      currency: "aud",
      status: "pending",
    });

    return res.json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ────────────────────────────────────────────
// GET /api/payments/history
// Returns purchase history for the authenticated parent.
// ────────────────────────────────────────────
router.get("/history", requireParent, async (req, res) => {
  try {
    const purchases = await Purchase.find({ parent_id: req.user.parentId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ purchases });
  } catch (err) {
    console.error("Purchase history error:", err);
    return res.status(500).json({ error: "Failed to load purchase history" });
  }
});

// ────────────────────────────────────────────
// GET /api/payments/verify?session_id=xxx
// Verify a checkout session status (for success page).
// ────────────────────────────────────────────
router.get("/verify", requireParent, async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: "session_id required" });

    const purchase = await Purchase.findOne({
      stripe_session_id: sessionId,
      parent_id: req.user.parentId,
    });

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    return res.json({
      status: purchase.status,
      bundle_name: purchase.bundle_name,
      amount_cents: purchase.amount_cents,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
});

module.exports = router;
