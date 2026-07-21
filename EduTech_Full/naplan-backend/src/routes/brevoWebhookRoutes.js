/**
 * routes/brevoWebhookRoutes.js
 *
 * POST /api/webhooks/brevo/:secret   — Brevo transactional event receiver
 *
 * ── AUTHENTICATION ──────────────────────────────────────────────────────────
 * Brevo does not sign its webhooks the way Stripe does. The accepted pattern is
 * an unguessable URL: put a long random secret in the path and compare it in
 * constant time. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Store as BREVO_WEBHOOK_SECRET, and register the full URL in Brevo under
 * Transactional → Settings → Webhook.
 *
 * Without this, anyone who finds the endpoint can suppress your users' email
 * addresses — a trivial denial-of-service against account recovery.
 *
 * ── EVENT HANDLING ──────────────────────────────────────────────────────────
 *   hard_bounce, invalid_email  → suppress immediately. The mailbox does not
 *                                 exist; retrying only harms reputation.
 *   spam                        → suppress permanently. Someone pressed "junk".
 *                                 Never auto-unsuppress these.
 *   blocked                     → already on Brevo's internal list; mirror it.
 *   unsubscribed                → suppress. See the note below on OTP.
 *   soft_bounce, deferred       → temporary (full mailbox, greylisting). Count
 *                                 them; only suppress at the threshold.
 *   delivered, opened, click    → acknowledged and ignored.
 *
 * ── ALWAYS RETURN 200 ───────────────────────────────────────────────────────
 * A non-2xx makes Brevo retry, and a persistent 500 can get the webhook
 * disabled entirely — at which point bounces stop being recorded and you are
 * back where you started. Errors are logged, not surfaced as status codes.
 *
 * Mount BEFORE any auth middleware:
 *   app.use("/api/webhooks/brevo", require("./routes/brevoWebhookRoutes"));
 *
 * Place at: naplan-backend/src/routes/brevoWebhookRoutes.js
 */

const router = require("express").Router();
const crypto = require("crypto");

const connectDB = require("../config/db");
const EmailSuppression = require("../models/emailSuppression");

// Soft bounces are transient. Suppress only after this many, and forget the
// count once the address has been quiet for the reset window — a mailbox that
// was full in March should not be suppressed forever.
const SOFT_BOUNCE_THRESHOLD = Number(process.env.SOFT_BOUNCE_THRESHOLD || 5);
const SOFT_BOUNCE_RESET_DAYS = Number(process.env.SOFT_BOUNCE_RESET_DAYS || 30);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Constant-time secret comparison. A plain === leaks the secret one character
 * at a time to anyone measuring response latency.
 */
function secretMatches(provided) {
  const expected = process.env.BREVO_WEBHOOK_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Events that mean "stop sending, permanently", mapped to a stored reason.
const PERMANENT = {
  hard_bounce: "hard_bounce",
  invalid_email: "invalid_email",
  spam: "complaint",
  blocked: "blocked",
  unsubscribed: "unsubscribed",
};

const SOFT = new Set(["soft_bounce", "deferred"]);

// ────────────────────────────────────────────
// POST /api/webhooks/brevo/:secret
// ────────────────────────────────────────────
router.post("/:secret", async (req, res) => {
  if (!secretMatches(req.params.secret)) {
    // 404 rather than 401 — do not confirm the endpoint exists.
    return res.status(404).json({ error: "Not found" });
  }

  // Brevo sends one event per request, but has sent arrays in the past.
  // Handle both so a format change does not silently drop events.
  const events = Array.isArray(req.body) ? req.body : [req.body];

  try {
    await connectDB();

    for (const ev of events) {
      const email = normalizeEmail(ev?.email);
      const type = String(ev?.event || "").toLowerCase();
      const message = String(ev?.reason || ev?.["reason"] || "").slice(0, 500);

      if (!email || !type) continue;

      // ── Permanent failures ──
      if (PERMANENT[type]) {
        await EmailSuppression.findOneAndUpdate(
          { email },
          {
            $set: {
              email,
              suppressed: true,
              reason: PERMANENT[type],
              provider_message: message || null,
              last_event_at: new Date(),
              suppressed_at: new Date(),
              unsuppressed_at: null,
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        );
        console.warn(`✉️ Suppressed ${email} — ${type}${message ? ` (${message})` : ""}`);
        continue;
      }

      // ── Soft failures: count, suppress only at the threshold ──
      if (SOFT.has(type)) {
        const existing = await EmailSuppression.findOne({ email }).lean();

        // Reset a stale count rather than accumulating across months.
        const cutoff = Date.now() - SOFT_BOUNCE_RESET_DAYS * 86_400_000;
        const stale =
          existing?.last_event_at &&
          new Date(existing.last_event_at).getTime() < cutoff;
        const base = stale ? 0 : existing?.soft_bounce_count || 0;
        const next = base + 1;

        const hitThreshold = next >= SOFT_BOUNCE_THRESHOLD;

        await EmailSuppression.findOneAndUpdate(
          { email },
          {
            $set: {
              email,
              soft_bounce_count: next,
              last_event_at: new Date(),
              provider_message: message || null,
              ...(hitThreshold
                ? {
                    suppressed: true,
                    reason: "soft_bounce_threshold",
                    suppressed_at: new Date(),
                  }
                : {}),
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        );

        if (hitThreshold) {
          console.warn(`✉️ Suppressed ${email} — ${next} soft bounces`);
        }
        continue;
      }

      // delivered / opened / click / request — nothing to do.
    }

    return res.status(200).json({ received: true, count: events.length });
  } catch (err) {
    // Log and 200 anyway. A 500 makes Brevo retry, and repeated failures can
    // get the webhook disabled — which would silently stop bounce tracking.
    console.error("Brevo webhook error:", err.message);
    return res.status(200).json({ received: true, note: "processing error" });
  }
});

module.exports = router;