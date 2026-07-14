/**
 * routes/parentAuthRoutes.js  (v3 — HARDENED)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CARRIED OVER FROM v2 (unchanged, all still correct)
 *   FIX-1  crypto.randomInt() instead of Math.random() for OTP generation.
 *   FIX-2  OTP_SECRET required at boot; no "fallback" string.
 *   FIX-3  crypto.timingSafeEqual() for hash comparison.
 *   FIX-4  signParent() from config/jwt.js — no direct process.env reads.
 *   FIX-5  TTL from config/jwt.js (default 7d), not a hardcoded 365d.
 *   FIX-6  Cookie max-age derived from token TTL — cannot drift.
 *   FIX-8  attempts counter persisted before early returns.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEW IN v3
 *
 * FIX-9   ENUMERATION ORACLE. FIX-7 gave /login-otp an identical body for known
 *         and unknown emails — but the 30s resend cooldown still returned 429,
 *         and only ever for accounts that EXIST. Two calls in a row:
 *             unknown email → 200, 200
 *             known email   → 200, 429
 *         That is a clean oracle; the generic message was worthless. The
 *         cooldown now returns the SAME genericOk body — we simply decline to
 *         send another email. The user-visible cost is nil (they weren't going
 *         to get a second email anyway); the attacker learns nothing.
 *
 * FIX-10  SUSPENDED PARENTS COULD LOG IN. verify-login-otp issued a session
 *         without ever checking parent.status. A suspended or soft-deleted
 *         parent received a valid 7-day token. adminRoutes has always checked
 *         status on login; this path never did.
 *
 * FIX-11  email_verified / auth_provider were never written on OTP signup, even
 *         though completing an OTP flow PROVES control of the address.
 *         googleAuthRoutes reads auth_provider === "otp" to decide whether to
 *         upgrade an account — it was reading a field nobody populated.
 *
 * FIX-12  OTP LIFETIME ALIGNED TO THE UI. Backend allowed 10 minutes; the
 *         frontend countdown (useOtpCountdown.js) runs for 5 and then tells the
 *         user the code is dead. Users were requesting codes they didn't need.
 *         Now 5 minutes everywhere, driven by OTP_EXPIRES_MIN, and the email
 *         copy is generated from the same number instead of being hardcoded.
 *
 * FIX-13  Resend reset `attempts` to 0, so 5 failed guesses + a 30s wait bought
 *         5 more. The counter now CARRIES OVER across resends for the same
 *         (email, purpose). The IP-based otpLimiter was doing all the real work
 *         before this.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ /send-otp (signup) still returns 409 EMAIL_EXISTS. That IS an enumeration
 *    vector, kept deliberately: a signup form that silently succeeds for an
 *    existing account is genuinely confusing, and signup emails are typically
 *    already known to the attacker. To close it, send a "you already have an
 *    account" email and return the same 200 as a fresh signup.
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const connectDB = require("../config/db");
const Parent = require("../models/parent");
const PendingOtp = require("../models/pendingOtp");
const { sendBrevoEmail } = require("../services/brevoEmail");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");

// Single source of truth for secrets, TTLs, audience separation.
const { signParent, TTL } = require("../config/jwt");

// ✅ FIX-12: one number, used by the expiry, the email copy, and the API
// response. Default 5 to match the frontend countdown. Override with
// OTP_EXPIRES_MIN — but change useOtpCountdown.js to match if you do.
const OTP_EXPIRES_MIN = Math.max(1, Number(process.env.OTP_EXPIRES_MIN || 5));
const OTP_TTL_MS = OTP_EXPIRES_MIN * 60 * 1000;

const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// ─── OTP hashing secret ──────────────────────────────────────────────────────
// Fail loudly at boot, never silently fall back to a known string.
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
function ttlToMs(ttl) {
  const m = String(ttl || "7d").match(/^(\d+)\s*([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000; // safe default: 7 days
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}
const PARENT_COOKIE_MAX_AGE = ttlToMs(TTL.parent);

// Statuses that may hold a session. Anything else — suspended, deleted, or a
// value added to the enum later — is denied by default.
const LOGIN_ALLOWED_STATUSES = new Set(["active"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

// Cryptographically secure 6-digit code.
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(email, otp) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
}

// Constant-time comparison of two hex digests.
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

// ✅ FIX-12: copy generated from OTP_EXPIRES_MIN, not hardcoded.
async function sendOtpEmail(toEmail, otp) {
  const mins = OTP_EXPIRES_MIN;
  const plural = mins === 1 ? "minute" : "minutes";
  await sendBrevoEmail({
    toEmail,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}. It expires in ${mins} ${plural}.`,
    html:
      `<div style="font-family:Arial,sans-serif;line-height:1.5">` +
      `<p>Your OTP for parent account verification is:</p>` +
      `<div style="font-size:24px;font-weight:bold;letter-spacing:2px">${otp}</div>` +
      `<p>This code expires in ${mins} ${plural}.</p></div>`,
  });
}

/**
 * Issue a parent session. One function so signup and login can never drift.
 */
function issueParentSession(res, parent) {
  const parent_token = signParent({
    role: "parent",
    parent_id: parent._id.toString(),
    parentId: parent._id.toString(),
    email: parent.email,
  });

  setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

  return {
    ok: true,
    parent_token, // ⚠️ see migration note 3 at the bottom
    parent: {
      parentId: parent._id,
      email: parent.email,
      firstName: parent.firstName,
      lastName: parent.lastName,
    },
  };
}

/**
 * Write (or overwrite) the pending OTP for an (email, purpose) pair.
 *
 * ✅ FIX-13: `attempts` is NOT reset here. Resetting it let an attacker buy 5
 * fresh guesses for the price of a 30-second wait. The counter now persists for
 * the life of the (email, purpose) row and is only cleared when the OTP is
 * successfully consumed or the row is deleted.
 */
async function upsertPendingOtp({ email, purpose, otp, profile, now }) {
  const set = {
    email,
    purpose,
    codeHash: hashOtp(email, otp),
    lastSentAt: new Date(now),
    expiresAt: new Date(now + OTP_TTL_MS),
  };
  if (profile) set.profile = profile;

  await PendingOtp.findOneAndUpdate(
    { email, purpose },
    {
      $set: set,
      // attempts only initialises on INSERT — a resend leaves it where it was.
      $setOnInsert: { attempts: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Shared OTP validation. Returns { ok: true, record } or { ok: false, status, body }.
 *
 * NOTE on expiry: Mongo's TTL sweeper only runs about once a minute, so an
 * expired document can still be sitting in the collection. The explicit
 * expiresAt check below is what actually enforces the deadline — the TTL index
 * is garbage collection, not an expiry mechanism.
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

  // Persist the attempt BEFORE any check that could early-return, so a client
  // that races the expiry can't get a free guess.
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
    await upsertPendingOtp({
      email,
      purpose: "signup",
      otp,
      profile: { firstName, lastName },
      now,
    });

    await sendOtpEmail(email, otp);
    return res.json({
      ok: true,
      otp_sent_to: maskEmail(email),
      otp_expires_in_sec: OTP_TTL_MS / 1000,
    });
  } catch (err) {
    console.error("Parent send-otp failed:", err?.response?.data || err);
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

    // ✅ FIX-11: completing the OTP flow proves control of this address, so
    // record that. googleAuthRoutes reads auth_provider to decide whether to
    // upgrade an account to Google — it needs this field to actually be set.
    const parent = await Parent.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          firstName: String(record.profile?.firstName || "").trim(),
          lastName: String(record.profile?.lastName || "").trim(),
          status: "active",
          auth_provider: "otp",
          email_verified: true,
        },
      },
      { new: true, upsert: true },
    );

    await PendingOtp.deleteOne({ _id: record._id });

    // Belt and braces: if the row already existed and was suspended, do not
    // hand out a session just because they proved they own the mailbox.
    if (!LOGIN_ALLOWED_STATUSES.has(parent.status)) {
      return res.status(403).json({
        ok: false,
        error: "This account is not active. Please contact support.",
      });
    }

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

    // ✅ FIX-9: EVERY path below this line returns exactly this body with a 200.
    // No status code, no message, and no timing-visible branch may differ based
    // on whether the account exists. The previous version leaked existence via a
    // 429 on the resend cooldown — which only ever fired for real accounts.
    const genericOk = {
      ok: true,
      message: "If an account exists for that email, we've sent a login code.",
      otp_sent_to: maskEmail(email),
    };

    const parent = await Parent.findOne({ email });

    // Unknown email, suspended account, deleted account → identical response.
    // We just don't send anything.
    if (!parent || !LOGIN_ALLOWED_STATUSES.has(parent.status)) {
      return res.json(genericOk);
    }

    const now = Date.now();
    const existing = await PendingOtp.findOne({ email, purpose: "login" });
    if (
      existing?.lastSentAt &&
      now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      // ✅ FIX-9: cooldown hit — decline to send, but say nothing different.
      // The user was not going to receive a second email either way, so there is
      // no UX cost; the attacker gets no signal.
      return res.json(genericOk);
    }

    const otp = generateOtp();
    await upsertPendingOtp({ email, purpose: "login", otp, now });

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

    // ✅ FIX-10: status was never checked here. A suspended or soft-deleted
    // parent who still had a valid code received a full 7-day session.
    // Suspension has to mean something at the point a session is MINTED, not
    // only at the point an account is created.
    if (!LOGIN_ALLOWED_STATUSES.has(parent.status)) {
      return res.status(403).json({
        ok: false,
        error: "This account is not active. Please contact support.",
      });
    }

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
 * 1. OTP LIFETIME IS NOW 5 MINUTES (was 10). This matches useOtpCountdown.js,
 *    which was already counting down from 5 and telling users the code had
 *    expired while the backend would still have accepted it. Override with
 *    OTP_EXPIRES_MIN — but change the frontend to match if you do.
 *
 * 2. TOKEN TTL. Parent tokens expire per PARENT_JWT_TTL (config/jwt.js default:
 *    7d). The old value was 365d. If weekly re-login is too aggressive for
 *    launch, set PARENT_JWT_TTL=90d in Render — but do NOT go back to a year.
 *    The proper fix is a token_version field on the Parent model, checked in
 *    verifyToken, exactly like the one now on the Admin model.
 *
 * 3. THIS DEPLOY LOGS EVERYONE OUT. Existing parent tokens were signed with a
 *    365d expiry and possibly a different secret. Ship it at a quiet hour.
 *
 * 4. localStorage TOKEN. parent_token is still returned in the body so the
 *    frontend can store it — which makes it XSS-stealable and undermines the
 *    httpOnly cookie set alongside it. End state: cookie only, plus
 *    GET /api/auth/me to rehydrate (sessionRoutes.js already supports this).
 *    Same migration as childAuthRoutes.js — do both at once.
 *
 * 5. OTP_SECRET IS REQUIRED. This file throws at boot without it. Confirm it is
 *    set in Render BEFORE deploying or the service will not start.
 *
 * 6. STILL OPEN — TIMING SIDE CHANNEL on /login-otp. A known-and-active email
 *    does DB writes and an outbound Brevo call; an unknown one returns almost
 *    immediately. The difference is measurable and re-leaks existence to a
 *    patient attacker. Closing it properly means queueing the send and
 *    returning immediately in both branches. Lower severity than the 429 oracle
 *    this version fixes, but it is not zero.
 * ═══════════════════════════════════════════════════════════════════════════ */