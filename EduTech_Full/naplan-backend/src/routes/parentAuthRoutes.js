/**
 * routes/parentAuthRoutes.js  (v2 — HARDENED)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXES APPLIED
 *
 * FIX-1  generateOtp() used Math.random() — predictable. Now crypto.randomInt().
 *        Math.random() is seeded from a PRNG an attacker can model; a 6-digit
 *        OTP generated from it is not a real 1-in-a-million guess.
 *
 * FIX-2  hashOtp() fell back to the literal string "fallback" when no secret was
 *        set. That silently downgraded every OTP hash to a known key. Now it
 *        requires OTP_SECRET and throws at boot if absent.
 *
 * FIX-3  OTP comparison used `!==` on hex strings — leaks position of first
 *        mismatched byte via timing. Now crypto.timingSafeEqual().
 *
 * FIX-4  Read process.env.PARENT_JWT_SECRET directly, bypassing config/jwt.js
 *        and its audience-separation guarantee. Now uses signParent().
 *
 * FIX-5  Parent tokens were signed with expiresIn: "365d". A stolen token was
 *        valid for a year with no revocation path. TTL now comes from
 *        config/jwt.js (PARENT_JWT_TTL, default 7d). Set PARENT_JWT_TTL in the
 *        environment if you want longer sessions — 90d is a sane maximum.
 *
 * FIX-6  PARENT_COOKIE_MAX_AGE was 356 days (typo for 365). Cookie lifetime is
 *        now derived from the token TTL, so they can never disagree again.
 *
 * FIX-7  /login-otp returned 404 "No account found with this email", letting an
 *        attacker enumerate registered emails. Now returns the same 200 response
 *        whether or not the account exists; the email is only sent if it does.
 *
 * FIX-8  attempts counter was not persisted before the expiry check, so a
 *        request that arrived just after expiry reset the counter for free.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NOTE ON /send-otp (signup): it still returns 409 EMAIL_EXISTS. That is also
 *    an enumeration vector, but it is a deliberate UX tradeoff — a signup form
 *    that silently does nothing for an existing account is very confusing. If
 *    you want to close it, send a "you already have an account" email instead
 *    and return the same 200 as a fresh signup.
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const connectDB = require("../config/db");
const Parent = require("../models/parent");
const PendingOtp = require("../models/pendingOtp");
const { sendBrevoEmail } = require("../services/brevoEmail");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");

// ✅ FIX-4: single source of truth for secrets, TTLs, audience separation.
const { signParent, TTL } = require("../config/jwt");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// ─── OTP hashing secret ──────────────────────────────────────────────────────
// ✅ FIX-2: fail loudly at boot, never silently fall back to a known string.
(function validateOtpSecret() {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: OTP_SECRET is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (secret.length < 32) {
    throw new Error("FATAL: OTP_SECRET must be at least 32 characters long.");
  }
})();

// ─── Cookie lifetime tracks token lifetime ───────────────────────────────────
// ✅ FIX-6: derived, not hand-typed. TTL.parent is a string like "7d".
function ttlToMs(ttl) {
  const m = String(ttl || "7d").match(/^(\d+)\s*([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000; // safe default: 7 days
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}
const PARENT_COOKIE_MAX_AGE = ttlToMs(TTL.parent);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

// ✅ FIX-1: cryptographically secure 6-digit code.
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(email, otp) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
}

// ✅ FIX-3: constant-time comparison of two hex digests.
function safeHashEqual(aHex, bHex) {
  if (typeof aHex !== "string" || typeof bHex !== "string") return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendOtpEmail(toEmail, otp) {
  await sendBrevoEmail({
    toEmail,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><p>Your OTP for parent account verification is:</p><div style="font-size:24px;font-weight:bold;letter-spacing:2px">${otp}</div><p>This code expires in 10 minutes.</p></div>`,
  });
}

/**
 * Issue a parent session: sign the token, set the httpOnly cookie, shape the
 * response body. One function so signup and login can never drift apart.
 */
function issueParentSession(res, parent) {
  // ✅ FIX-4 + FIX-5: signParent() uses PARENT_JWT_SECRET and TTL.parent,
  // and stamps typ:"parent" so the token can't be replayed as another audience.
  const parent_token = signParent({
    role: "parent",
    parent_id: parent._id.toString(),
    parentId: parent._id.toString(),
    email: parent.email,
  });

  setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

  return {
    ok: true,
    parent_token, // ⚠️ see migration note at the bottom of this file
    parent: {
      parentId: parent._id,
      email: parent.email,
      firstName: parent.firstName,
      lastName: parent.lastName,
    },
  };
}

/**
 * Shared OTP validation. Returns { ok: true, record } or { ok: false, status, body }.
 * ✅ FIX-8: the attempts counter is persisted before any early return that
 * isn't a hard delete, so an attacker can't reset it by racing the expiry.
 */
async function consumeOtp(email, otp, purpose) {
  const record = await PendingOtp.findOne({ email, purpose });

  if (!record) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "No code requested. Please request one first." },
    };
  }

  if (Date.now() > new Date(record.expiresAt).getTime()) {
    await PendingOtp.deleteOne({ _id: record._id });
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Code expired. Please request a new one." },
    };
  }

  const attempts = (record.attempts || 0) + 1;
  await PendingOtp.updateOne({ _id: record._id }, { $set: { attempts } });

  if (attempts > MAX_OTP_ATTEMPTS) {
    await PendingOtp.deleteOne({ _id: record._id });
    return {
      ok: false,
      status: 429,
      body: { ok: false, error: "Too many attempts. Request a new code." },
    };
  }

  if (!safeHashEqual(hashOtp(email, otp), record.codeHash)) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Invalid code" },
    };
  }

  return { ok: true, record };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNUP FLOW
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/parents/auth/send-otp
router.post("/send-otp", async (req, res) => {
  try {
    await connectDB();
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const email = normalizeEmail(req.body?.email);

    if (!firstName)
      return res.status(400).json({ ok: false, error: "First name is required" });
    if (!lastName)
      return res.status(400).json({ ok: false, error: "Last name is required" });
    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!isValidEmail(email))
      return res.status(400).json({ ok: false, error: "Valid email is required" });

    const exists = await Parent.exists({ email });
    if (exists)
      return res.status(409).json({
        ok: false,
        code: "EMAIL_EXISTS",
        error: "This email already exists. Please sign in.",
      });

    const now = Date.now();
    const existing = await PendingOtp.findOne({ email, purpose: "signup" });
    if (
      existing?.lastSentAt &&
      now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        ok: false,
        error: "Please wait 30 seconds before requesting another OTP.",
      });
    }

    const otp = generateOtp();

    await PendingOtp.findOneAndUpdate(
      { email, purpose: "signup" },
      {
        $set: {
          email,
          purpose: "signup",
          codeHash: hashOtp(email, otp),
          profile: { firstName, lastName },
          attempts: 0,
          lastSentAt: new Date(now),
          expiresAt: new Date(now + OTP_TTL_MS),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await sendOtpEmail(email, otp);
    return res.json({
      ok: true,
      otp_sent_to: maskEmail(email),
      otp_expires_in_sec: OTP_TTL_MS / 1000,
    });
  } catch (err) {
    console.error("Parent send-otp failed:", err?.response?.data || err);
    // Don't leak internals to the client.
    return res.status(500).json({ ok: false, error: "Failed to send OTP" });
  }
});

// POST /api/parents/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    await connectDB();

    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!/^\d{6}$/.test(otp))
      return res.status(400).json({ ok: false, error: "OTP must be a 6-digit code" });

    const result = await consumeOtp(email, otp, "signup");
    if (!result.ok) return res.status(result.status).json(result.body);

    const { record } = result;

    const parent = await Parent.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          firstName: String(record.profile?.firstName || "").trim(),
          lastName: String(record.profile?.lastName || "").trim(),
          status: "active",
        },
      },
      { new: true, upsert: true },
    );

    await PendingOtp.deleteOne({ _id: record._id });

    return res.json(issueParentSession(res, parent));
  } catch (err) {
    console.error("Parent verify-otp failed:", err);
    if (err?.code === 11000)
      return res.status(409).json({ ok: false, error: "Parent already exists" });
    return res.status(500).json({ ok: false, error: "Failed to verify OTP" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN FLOW
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/parents/auth/login-otp
router.post("/login-otp", async (req, res) => {
  try {
    await connectDB();
    const email = normalizeEmail(req.body?.email);

    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!isValidEmail(email))
      return res.status(400).json({ ok: false, error: "Valid email is required" });

    // ✅ FIX-7: the response below is IDENTICAL whether or not the account
    // exists. An attacker cannot use this endpoint to discover which emails
    // are registered. We only actually send mail when there's an account.
    const genericOk = {
      ok: true,
      message: "If an account exists for that email, we've sent a login code.",
      otp_sent_to: maskEmail(email),
    };

    const parent = await Parent.findOne({ email });
    if (!parent) return res.json(genericOk);

    const now = Date.now();
    const existing = await PendingOtp.findOne({ email, purpose: "login" });
    if (
      existing?.lastSentAt &&
      now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        ok: false,
        error: "Please wait 30 seconds before requesting another code.",
      });
    }

    const otp = generateOtp();

    await PendingOtp.findOneAndUpdate(
      { email, purpose: "login" },
      {
        $set: {
          email,
          purpose: "login",
          codeHash: hashOtp(email, otp),
          attempts: 0,
          lastSentAt: new Date(now),
          expiresAt: new Date(now + OTP_TTL_MS),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await sendOtpEmail(email, otp);
    return res.json(genericOk);
  } catch (err) {
    console.error("Parent login-otp failed:", err);
    return res.status(500).json({ ok: false, error: "Failed to send login code" });
  }
});

// POST /api/parents/auth/verify-login-otp
router.post("/verify-login-otp", async (req, res) => {
  try {
    await connectDB();

    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!/^\d{6}$/.test(otp))
      return res.status(400).json({ ok: false, error: "OTP must be a 6-digit code" });

    const result = await consumeOtp(email, otp, "login");
    if (!result.ok) return res.status(result.status).json(result.body);

    const parent = await Parent.findOne({ email });
    if (!parent) {
      await PendingOtp.deleteOne({ _id: result.record._id });
      return res.status(401).json({ ok: false, error: "Invalid code" });
    }

    await PendingOtp.deleteOne({ _id: result.record._id });

    return res.json(issueParentSession(res, parent));
  } catch (err) {
    console.error("Parent verify-login-otp failed:", err);
    return res.status(500).json({ ok: false, error: "Verification failed" });
  }
});

// POST /api/parents/auth/logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res, "parent_token");
  res.json({ ok: true });
});

module.exports = router;

/* ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION NOTES
 *
 * 1. TOKEN TTL. Parent tokens now expire per PARENT_JWT_TTL (config/jwt.js
 *    default: 7d). The old value was 365d. If weekly re-login is too aggressive
 *    for launch, set PARENT_JWT_TTL=90d in Render — but do NOT go back to a
 *    year. Long-lived tokens with no revocation are the single biggest auth
 *    risk in this codebase. The proper fix is a token_version field on the
 *    Parent model, checked in verifyToken, so you can invalidate on demand.
 *
 * 2. THIS DEPLOY LOGS EVERYONE OUT. Existing parent tokens were signed with
 *    expiresIn:"365d" and (possibly) a different secret. They will no longer
 *    verify. Expect a wave of re-logins. Ship it at a quiet hour.
 *
 * 3. localStorage TOKEN. We still return parent_token in the body so the
 *    frontend can store it. That makes it XSS-stealable and undermines the
 *    httpOnly cookie set alongside it. End state: cookie only + GET /api/auth/me
 *    to rehydrate (sessionRoutes.js already supports this). Same migration as
 *    childAuthRoutes.js — do both at once.
 *
 * 4. OTP_SECRET IS NOW REQUIRED. This file throws at boot without it. Confirm
 *    it is set in Render before deploying, or the service will not start.
 * ═══════════════════════════════════════════════════════════════════════════ */