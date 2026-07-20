// ────────────────────────────────────────────
// Shared helper: verify Stripe-reported amount/currency against our record.
// session.amount_total is in the smallest currency unit (cents), same as amount_cents.
// Returns { ok: true } when they match, or { ok: false, reason } on mismatch.
//
// NOTE: strict equality is only valid while checkout has NO coupons/promo codes
// and NO tax. If you enable allow_promotion_codes or automatic tax, amount_total
// will legitimately differ from amount_cents — compare against amount_subtotal
// (or store the discounted expected amount) instead.
// ────────────────────────────────────────────

const router = require("express").Router();
// Pin the API version so outbound Stripe calls have a stable request/response
// shape, independent of the account-default version (which drifts as Stripe
// ships new releases). Keep this on the same train as the installed SDK
// (stripe@20.x → clover). Verify against Dashboard → Developers → your default
// API version; if your account default is older, pin to THAT instead.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover",
});
const { verifyToken, requireParent } = require("../middleware/auth");
const connectDB = require("../config/db");
const Purchase = require("../models/purchase");
const QuizCatalog = require("../models/quizCatalog");
const Child = require("../models/child");
const Parent = require("../models/parent");
const StripeEvent = require("../models/stripeEvent");
const { provisionPurchase } = require("../services/provisioningService");

// Stale-lock self-heal window: if a claim holder crashes mid-provision, the
// lock is considered abandoned after this long and can be re-claimed.
const PROVISION_LOCK_TTL_MS = 2 * 60 * 1000;

// ────────────────────────────────────────────
// Shared helper: verify Stripe-reported amount/currency against our record.
// session.amount_total is in the smallest currency unit (cents), same as amount_cents.
// Returns { ok: true } when they match, or { ok: false, reason } on mismatch.
//
// NOTE: strict equality is only valid while checkout has NO coupons/promo codes
// and NO tax. If you enable allow_promotion_codes or automatic tax, amount_total
// will legitimately differ from amount_cents — compare against amount_subtotal
// (or store the discounted expected amount) instead.
// ────────────────────────────────────────────
// ────────────────────────────────────────────
// Shared helper: verify Stripe-reported amount/currency against our record.
//
// We assert against session.amount_subtotal, NOT amount_total.
//   amount_subtotal = sum of the line items WE constructed, before discounts,
//                     shipping, and (when tax_behavior is "exclusive") tax.
//   amount_total    = what the customer actually paid, after all of the above.
//
// amount_subtotal is derived from the unit_amount our own server sent to Stripe,
// so it remains the correct integrity check once automatic tax or promotion
// codes are enabled. amount_total legitimately diverges in those cases.
//
// Older sessions (created before this change) may not carry amount_subtotal —
// fall back to amount_total, which is equivalent when there is no tax/discount.
// ────────────────────────────────────────────
function verifyPaymentAmount(purchase, session) {
  const expected = Number(purchase.amount_cents);
  const expectedCurrency = (purchase.currency || "aud").toLowerCase();
  const chargedCurrency = (session.currency || "").toLowerCase();

  const subtotalRaw = Number(session.amount_subtotal);
  const totalRaw = Number(session.amount_total);
  const base = Number.isFinite(subtotalRaw) ? subtotalRaw : totalRaw;

  const details = session.total_details || {};
  const tax = Number(details.amount_tax || 0);
  const discount = Number(details.amount_discount || 0);

  const amountMismatch =
    Number.isFinite(expected) && Number.isFinite(base) && expected !== base;
  const currencyMismatch = chargedCurrency && expectedCurrency !== chargedCurrency;

  // Guard: a 100%-off promotion code would provision a paid bundle for free.
  // Reject unless you deliberately issue full-discount coupons.
  const paidNothing = Number.isFinite(totalRaw) && totalRaw <= 0;

  if (amountMismatch || currencyMismatch || paidNothing) {
    return {
      ok: false,
      reason:
        `Amount/currency mismatch: subtotal ${base}, total ${totalRaw} ` +
        `${chargedCurrency} (tax ${tax}, discount ${discount}), ` +
        `expected ${expected} ${expectedCurrency}`,
    };
  }
  return { ok: true };
}

// ────────────────────────────────────────────
// Idempotency ledger helper: record a Stripe event as processed.
// Call this ONLY on terminal-success (2xx) outcomes — never before processing
// and never on a 5xx path, or a retry of a failed provisioning would be
// short-circuited and never re-driven.
// A duplicate-key error (11000) means a concurrent delivery already recorded
// the same event — that's expected and safe to ignore.
// ────────────────────────────────────────────
async function markEventProcessed(event) {
  try {
    await StripeEvent.create({ event_id: event.id, type: event.type });
  } catch (err) {
    if (err?.code !== 11000) {
      console.warn(`Could not record Stripe event ${event.id}:`, err.message);
    }
  }
}

// ────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH: verify amount → claim → mark paid → provision.
// Shared by the webhook, the verify-fallback, and retry-provision so all three
// behave identically and cannot double-provision.
//
// The caller locates + authorizes the purchase (their security boundary differs)
// and hands the record here. It works with either a Mongoose doc or a .lean()
// object — it never calls .save(), only findOneAndUpdate/findByIdAndUpdate by _id.
//
// Pass `session` (a Stripe checkout.session, or a retrieved session) when an
// amount check is wanted (webhook + verify). Omit it for retry-provision, where
// the purchase is already paid + amount-verified.
//
// Requires `provisioning_lock_at: { type: Date }` on the Purchase schema for the
// atomic claim. Without that field the claim degrades to a no-op (still safe —
// provisionPurchase is race-safe internally — but no longer single-execution).
//
// Returns { ok, outcome, error? }, outcome ∈:
//   "amount_mismatch" | "already_provisioned" | "in_progress"
//   | "provisioned"   | "provision_failed"
// ────────────────────────────────────────────
async function markPaidAndProvision({ purchase, session }) {
  // 1. Amount/currency check — only when a session is supplied.
  if (session) {
    const check = verifyPaymentAmount(purchase, session);
    if (!check.ok) {
      // Do NOT provision. Mark failed (guarded so we can't clobber a concurrent
      // success). The charge already happened — surface this to admin/refund.
      await Purchase.findOneAndUpdate(
        { _id: purchase._id, provisioned: { $ne: true } },
        { $set: { status: "failed", provision_error: check.reason } },
      );
      return { ok: false, outcome: "amount_mismatch", error: check.reason };
    }
  }

  // 2. Fast path — already provisioned.
  if (purchase.provisioned === true) {
    return { ok: true, outcome: "already_provisioned" };
  }

  // 3. Atomically claim the right to provision. Wins only if not already
  //    provisioned AND no fresh lock is held (stale locks self-heal after TTL).
  const staleBefore = new Date(Date.now() - PROVISION_LOCK_TTL_MS);
  const claimed = await Purchase.findOneAndUpdate(
    {
      _id: purchase._id,
      provisioned: { $ne: true },
      $or: [
        { provisioning_lock_at: { $exists: false } },
        { provisioning_lock_at: null },
        { provisioning_lock_at: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        status: "paid",
        provisioning_lock_at: new Date(),
        ...(session?.payment_intent
          ? { stripe_payment_intent: session.payment_intent }
          : {}),
        ...(session?.invoice ? { stripe_invoice_id: session.invoice } : {}),
      },
    },
    { new: true },
  );

  if (!claimed) {
    // Either already provisioned, or another run holds a fresh lock.
    const current = await Purchase.findById(purchase._id).lean();
    if (current?.provisioned) {
      return { ok: true, outcome: "already_provisioned" };
    }
    return { ok: false, outcome: "in_progress" };
  }

  // 4. We own the claim — provision (also race-safe internally).
  const result = await provisionPurchase(claimed._id.toString());

  // 5. Release the lock. On success provisionPurchase already set
  //    provisioned:true; on failure we clear the lock so a retry can re-claim
  //    immediately rather than waiting for the TTL.
  await Purchase.findByIdAndUpdate(claimed._id, {
    $unset: { provisioning_lock_at: "" },
  });

  if (!result.success) {
    return { ok: false, outcome: "provision_failed", error: result.error };
  }
  return { ok: true, outcome: "provisioned" };
}

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
            error: `A checkout is already in progress for "${bundle.bundle_name}". Please complete or cancel it first. Please check payment history in parent dashboard for more details`,
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
            // txcd_10103001 = SaaS – educational services.
            // Confirm at stripe.com/docs/tax/tax-codes.
            tax_code: "txcd_10103001",
          },
          unit_amount: bundle.price_cents,
          // AU consumer pricing is GST-inclusive: the parent pays exactly
          // bundle.price_cents and GST is extracted from inside it, so
          // amount_subtotal still equals our stored amount_cents.
          tax_behavior: "inclusive",
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
      automatic_tax: { enabled: true },
      // REQUIRED when passing an existing `customer` with automatic_tax on —
      // Stripe 400s if it can't write back the address it derives at checkout.
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      // Mandatory tick-box before payment completes. Requires the ToS URL in
      // Dashboard → Settings → Checkout, or session creation fails.
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message:
            "I agree to the [Terms of Service and Refund Policy]" +
            "(https://naplan.kaisolutions.ai/#/refund-policy). " +
            "Access is granted immediately on payment.",
        },
      },
      // ACL proof-of-transaction: a Stripe payment receipt carries no ABN field.
      // An invoice does — and itemises the GST component once tax is live.
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `${bundle.bundle_name} — NAPLAN PREP practice pack`,
          account_tax_ids: process.env.STRIPE_ACCOUNT_TAX_ID
            ? [process.env.STRIPE_ACCOUNT_TAX_ID]
            : undefined,
          footer:
            "Kai Solutions — naplan.kaisolutions.ai. " +
            "Retain this invoice as your proof of transaction.",
          metadata: {
            bundle_id: bundle_id,
            parent_id: parentId.toString(),
          },
        },
      },
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
      child_names: children.map((c) => c.display_name || c.username),
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
// Stripe webhook — verifies signature, then delegates to markPaidAndProvision.
//
// CONTRACT:
//   • 200 ONLY after provisioning has actually succeeded.
//   • 5xx when provisioning fails or is in progress elsewhere → Stripe retries.
//   • 200 for final states that must NOT be retried (unknown type, no purchase,
//     amount mismatch, duplicate).
//   • 400 for a bad signature.
//
// IDEMPOTENCY — two layers:
//   1. StripeEvent ledger (unique index on event_id): recorded only AFTER a
//      successful outcome, so failed-provisioning retries still re-drive.
//   2. markPaidAndProvision's atomic claim + purchase.provisioned guard.
//
// NOTE: This route needs the RAW body for signature verification. Confirm app.js
// gives this route the unparsed body.
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
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    await connectDB();

    // ── Layer 1: idempotency ledger. Short-circuit already-processed events. ──
    const alreadyHandled = await StripeEvent.findOne({
      event_id: event.id,
    }).lean();
    if (alreadyHandled) {
      return res.status(200).json({ received: true, note: "duplicate event" });
    }

    // ACK event types we don't handle with 200 (no ledger row needed).
    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ received: true, ignored: event.type });
    }

    const session = event.data.object;
    const sessionId = session.id;

    const purchase = await Purchase.findOne({ stripe_session_id: sessionId });

    if (!purchase) {
      console.error(`⚠️ No Purchase found for session ${sessionId}`);
      await markEventProcessed(event);
      return res
        .status(200)
        .json({ received: true, note: "no matching purchase" });
    }

    // ── Single path: verify amount → claim → mark paid → provision. ──
    const { outcome, error } = await markPaidAndProvision({ purchase, session });

    switch (outcome) {
      case "amount_mismatch":
        console.error(`🚨 Amount mismatch for session ${sessionId}: ${error}`);
        await markEventProcessed(event);
        return res
          .status(200)
          .json({ received: true, note: "amount mismatch" });

      case "already_provisioned":
        console.log(
          `ℹ️ Purchase ${purchase._id} already provisioned — duplicate webhook`,
        );
        await markEventProcessed(event);
        return res
          .status(200)
          .json({ received: true, note: "already provisioned" });

      case "in_progress":
        // Another run (e.g. verify-fallback) is mid-provision. Do NOT record the
        // event; ask Stripe to retry — by then it's either provisioned (→200) or
        // the lock is free to re-claim.
        console.log(
          `⏳ Purchase ${purchase._id} provisioning elsewhere — asking Stripe to retry`,
        );
        return res.status(503).json({ error: "Provisioning in progress" });

      case "provision_failed":
        console.error(
          `❌ Provisioning failed for purchase ${purchase._id}:`,
          error,
        );
        return res.status(500).json({ error: "Provisioning failed" });

      case "provisioned":
        console.log(`✅ Provisioning complete for purchase ${purchase._id}`);
        await markEventProcessed(event);
        return res
          .status(200)
          .json({ received: true, provisioned: true });

      default:
        console.error(`Unknown provisioning outcome: ${outcome}`);
        return res.status(500).json({ error: "Unknown provisioning outcome" });
    }
  } catch (err) {
    // Unexpected error → 5xx so Stripe retries. Event not recorded → reprocesses.
    console.error("Stripe webhook processing error:", err);
    return res.status(500).json({ error: "Webhook processing error" });
  }
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
// If the webhook hasn't landed yet, confirms with Stripe and drives the SAME
// markPaidAndProvision path (awaited, so the response reflects final state).
// ────────────────────────────────────────────
router.get(
  "/verify/:sessionId",
  verifyToken,
  requireParent,
  async (req, res) => {
    try {
      await connectDB();
      const parentId = req.user?.parentId || req.user?.parent_id;
      const { sessionId } = req.params;

      const purchase = await Purchase.findOne({
        stripe_session_id: sessionId,
        parent_id: parentId,
      }).lean();

      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // ── If still pending, confirm with Stripe and drive the shared path ──
      if (purchase.status === "pending") {
        try {
          const stripeSession =
            await stripe.checkout.sessions.retrieve(sessionId);

          if (stripeSession.payment_status === "paid") {
            const { outcome, error } = await markPaidAndProvision({
              purchase, // lean object is fine — the helper updates by _id
              session: stripeSession,
            });
            console.log(
              `Verify → markPaidAndProvision for ${purchase._id}: ${outcome}` +
                (error ? ` (${error})` : ""),
            );
          }
        } catch (stripeErr) {
          console.warn("Stripe session check failed:", stripeErr.message);
          // Continue with whatever status we have from DB
        }
      }

      // Re-fetch with populated children (status may have changed above)
      const freshPurchase = await Purchase.findById(purchase._id)
        .populate("child_ids", "display_name username year_level status")
        .lean();

      const bundle = await QuizCatalog.findOne({
        bundle_id: freshPurchase.bundle_id,
      }).lean();

      return res.json({
        ok: true,
        purchase: freshPurchase,
        children: freshPurchase.child_ids,
        bundle: bundle || null,
      });
    } catch (err) {
      console.error("Payment verify error:", err);
      return res.status(500).json({ error: "Failed to verify payment" });
    }
  },
);

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
            tax_code: "txcd_10103001",
          },
          unit_amount: bundle.price_cents,
          tax_behavior: "inclusive",
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
      automatic_tax: { enabled: true },
      // REQUIRED when passing an existing `customer` with automatic_tax on —
      // Stripe 400s if it can't write back the address it derives at checkout.
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      // Mandatory tick-box before payment completes. Requires the ToS URL in
      // Dashboard → Settings → Checkout, or session creation fails.
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message:
            "I agree to the [Terms of Service and Refund Policy]" +
            "(https://naplan.kaisolutions.ai/#/refund-policy). " +
            "Access is granted immediately on payment.",
        },
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `${bundle.bundle_name} — NAPLAN PREP practice pack`,
          account_tax_ids: process.env.STRIPE_ACCOUNT_TAX_ID
            ? [process.env.STRIPE_ACCOUNT_TAX_ID]
            : undefined,
          footer:
            "Kai Solutions — naplan.kaisolutions.ai. " +
            "Retain this invoice as your proof of transaction.",
          metadata: {
            bundle_id: purchase.bundle_id,
            parent_id: parentId.toString(),
          },
        },
      },
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
        child_names: children.map((c) => c.display_name || c.username),
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
// Parent-triggered retry of quiz assignment after provisioning failure.
// Drives the SAME markPaidAndProvision path (no session → skips amount check;
// the purchase is already paid + verified).
// ────────────────────────────────────────────
router.post("/retry-provision/:purchaseId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();

    const purchaseId = req.params.purchaseId;
    const parentId = req.user.parentId || req.user.parent_id;

    // Must belong to this parent and be paid but not provisioned
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

    // Run in background via the shared path
    setImmediate(async () => {
      try {
        const { outcome, error } = await markPaidAndProvision({ purchase });
        console.log(`Retry-provision for ${purchaseId}: ${outcome}`);
        if (outcome === "provision_failed") {
          console.error(`❌ Retry provisioning failed for ${purchaseId}:`, error);
        }
      } catch (err) {
        console.error(`❌ Retry provisioning error for ${purchaseId}:`, err.message);
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

router.patch(
  "/cancel/:purchaseId",
  verifyToken,
  requireParent,
  async (req, res) => {
    try {
      await connectDB();
      const parentId = req.user?.parentId || req.user?.parent_id;
      const { purchaseId } = req.params;

      const purchase = await Purchase.findOne({
        _id: purchaseId,
        parent_id: parentId,
        status: { $in: ["pending", "failed"] },
      });

      if (!purchase) {
        return res
          .status(404)
          .json({ error: "Purchase not found or not cancellable" });
      }

      purchase.status = "cancelled";
      await purchase.save();

      return res.json({ ok: true });
    } catch (err) {
      console.error("Cancel payment error:", err);
      return res.status(500).json({ error: "Failed to cancel payment" });
    }
  },
);


module.exports = router;