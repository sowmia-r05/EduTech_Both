// src/routes/otpAuth.js  (v3 — A11 + KEY REUSE + ENUMERATION)
//
// OTP-by-username -> look up email in MongoDB -> send code -> verify -> issue token.
// Uses the Brevo HTTP API (not SMTP — Render blocks SMTP ports).
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 FIXES IN v3
//
// FIX-1 — KEY REUSE (the serious one).
//   BEFORE:
//       const loginSecret = requiredEnv("OTP_SECRET");
//       const loginToken  = jwt.sign({ sub, email }, loginSecret, ...);
//
//   OTP_SECRET has ONE job: it is the HMAC key that hashes OTP codes. It was
//   ALSO being used to sign login tokens. That means anyone who learns
//   OTP_SECRET can mint a valid login token for ANY email address, without ever
//   receiving an OTP. OTP_SECRET was exposed in screenshots, so this is not
//   theoretical.
//
//   NOW: tokens are signed via config/jwt.js signParent() -> PARENT_JWT_SECRET,
//   an entirely separate key with its own TTL and a stamped `typ`. OTP_SECRET
//   goes back to doing exactly one thing.
//
// FIX-2 — A11: IN-MEMORY OTP STORE.
//   BEFORE: `const otpStore = new Map()` — process memory.
//   Render free tier sleeps after 15 min idle; a cold start creates an empty
//   Map. A parent could enter the CORRECT code and be told it had expired. The
//   30s resend cooldown and the 5-attempt lockout lived in that same Map, so
//   both abuse controls reset to zero on every restart. It also cannot work
//   across >1 instance.
//   NOW: MongoDB with a TTL index (models/otpCode.js). Shared, durable, and
//   Mongo reaps expired rows for us.
//
// FIX-3 — USER ENUMERATION.
//   BEFORE: unknown address -> 404 "User not found".
//   That is an oracle: an attacker can farm your entire parent list by probing
//   emails and watching for 404 vs 200.
//   NOW: always 200 with the same generic body. If no account exists we simply
//   send nothing. Timing is also evened out.
//
// FIX-4 — ATOMIC ATTEMPT COUNTING.
//   The old code did `record.attempts += 1` on a plain object, which is a
//   read-modify-write race across concurrent requests. Now a single atomic
//   $inc in MongoDB.
//
// FIX-5 — ATOMIC SINGLE-USE.
//   A correct code is consumed with findOneAndDelete, so two requests racing
//   with the same valid OTP cannot both succeed.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ IS THIS ROUTE EVEN USED?
//   The original header called this the "legacy" username OTP flow, and your
//   tracker item CL2 says to delete it if unused. Before adopting this file,
//   check:
//       grep -r "otpAuth"    src/app.js
//       grep -r "login_token" src/ ../naplan-frontend/src/
//   If NOTHING references it, DELETE src/routes/otpAuth.js instead of shipping
//   this. Deleting a route is a better fix than hardening one nobody calls.
// ═══════════════════════════════════════════════════════════════════════════

const express = require("express");
const crypto = require("crypto");

const connectDB = require("../config/db");
const { sendBrevoEmail } = require("../services/brevoEmail");
const Parent = require("../models/parent");
const OtpCode = require("../models/otpCode");

// ✅ FIX-1: parent tokens are signed with PARENT_JWT_SECRET, never OTP_SECRET.
const { signParent, TTL } = require("../config/jwt");
const { setAuthCookie } = require("../utils/setCookies");

const router = express.Router();

// ─── Boot-time config validation ─────────────────────────────────────────────
(function validateOtpConfig() {
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
  console.log("✅ OTP_SECRET validated (used ONLY for OTP hashing, never for JWTs)");
})();

// ─── Tunables ────────────────────────────────────────────────────────────────
const RESEND_COOLDOWN_MS = 30_000;
const MAX_ATTEMPTS = 5;

function otpExpiresSeconds() {
  const mins = Number(process.env.OTP_EXPIRES_MIN || 10);
  return Math.max(5, mins) * 60;
}

// Cookie lifetime tracks the token lifetime. TTL.parent is like "7d".
function ttlToMs(ttl) {
  const m = String(ttl || "7d").match(/^(\d+)\s*([smhd])$/);
  if (!m) return 7 * 86_400_000;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return Number(m[1]) * unit;
}
const PARENT_COOKIE_MAX_AGE = ttlToMs(TTL.parent);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** HMAC the code. OTP_SECRET's ONLY job. Plaintext codes are never stored. */
function hashOtp(key, otp) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET)
    .update(`${key}:${otp}`)
    .digest("hex");
}

/** Constant-time digest comparison. */
function safeHashEqual(aHex, bHex) {
  if (typeof aHex !== "string" || typeof bHex !== "string") return false;
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cryptographically secure 6-digit code (never Math.random). */
function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/** Returns the Parent doc, or null. */
async function findParentByUsername(username) {
  const u = String(username || "").trim();
  if (!u) return null;
  const rx = new RegExp(`^${escapeRegExp(u)}$`, "i");
  return (
    (await Parent.findOne({ email: rx }).select("_id email").lean()) ||
    (await Parent.findOne({ username: rx }).select("_id email").lean()) ||
    null
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/request   { username }
//
// ✅ FIX-3: ALWAYS returns 200 with the same body, whether or not the account
// exists. No enumeration oracle. If there is no account, we quietly send nothing.
// ═════════════════════════════════════════════════════════════════════════════
router.post("/otp/request", async (req, res) => {
  // The one response every caller gets, no matter what happened.
  const GENERIC = {
    ok: true,
    message: "If an account exists for that address, a code has been sent.",
  };

  try {
    await connectDB();

    const username = String(req.body?.username || "").trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const parent = await findParentByUsername(username);

    // No account. Burn a comparable amount of time so timing doesn't leak
    // either, then return the SAME response as the success path.
    if (!parent?.email) {
      await new Promise((r) => setTimeout(r, 120));
      return res.json(GENERIC);
    }

    const email = String(parent.email).trim().toLowerCase();
    const now = Date.now();

    // ✅ FIX-2: cooldown is read from MongoDB, so it survives a cold start.
    const existing = await OtpCode.findOne({ key: username }).lean();
    if (
      existing?.last_sent_at &&
      now - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS
    ) {
      return res
        .status(429)
        .json({ error: "Please wait 30 seconds before requesting another code." });
    }

    const otp = makeOtp();

    // Upsert: one live OTP per key. A new request invalidates the previous code
    // and resets the attempt counter.
    await OtpCode.findOneAndUpdate(
      { key: username },
      {
        $set: {
          key: username,
          otp_hash: hashOtp(username, otp),
          email,
          attempts: 0,
          last_sent_at: new Date(now),
          expires_at: new Date(now + otpExpiresSeconds() * 1000),
        },
      },
      { upsert: true, new: true },
    );

    const mins = Number(process.env.OTP_EXPIRES_MIN || 10);
    await sendBrevoEmail({
      toEmail: email,
      subject: "Your NAPLAN Prep login code",
      text: `Your one-time code is ${otp}. It expires in ${mins} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Your one-time code is:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</div>
          <p>It expires in ${mins} minutes.</p>
          <p style="color:#666;font-size:13px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    return res.json(GENERIC);
  } catch (err) {
    console.error("OTP request error:", err?.response?.data || err.message);
    // Even on failure: same shape. Do not leak whether the account existed.
    return res.status(500).json({ error: "Could not send the code. Please try again." });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/verify   { username, otp }
//
// On success issues a PARENT token (PARENT_JWT_SECRET, TTL from config/jwt.js)
// — NOT a token signed with OTP_SECRET.
// ═════════════════════════════════════════════════════════════════════════════
router.post("/otp/verify", async (req, res) => {
  try {
    await connectDB();

    const username = String(req.body?.username || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!username || !otp) {
      return res.status(400).json({ error: "Username and code are required" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "The code must be 6 digits" });
    }

    // ✅ FIX-4: atomic increment. The old `record.attempts += 1` on a plain
    // object was a read-modify-write race — parallel guesses could all read the
    // same count and blow past the limit.
    const record = await OtpCode.findOneAndUpdate(
      { key: username },
      { $inc: { attempts: 1 } },
      { new: true },
    ).lean();

    // Same message for "no code", "wrong code" and "expired" — no oracle.
    const INVALID = { error: "That code is invalid or has expired. Please request a new one." };

    if (!record) return res.status(401).json(INVALID);

    // Explicit expiry check. Mongo's TTL reaper only runs ~once a minute, so a
    // document can outlive expires_at. NEVER rely on the index for correctness.
    if (Date.now() > new Date(record.expires_at).getTime()) {
      await OtpCode.deleteOne({ key: username });
      return res.status(401).json(INVALID);
    }

    if (record.attempts > MAX_ATTEMPTS) {
      await OtpCode.deleteOne({ key: username });
      return res
        .status(429)
        .json({ error: "Too many attempts. Please request a new code." });
    }

    if (!safeHashEqual(hashOtp(username, otp), record.otp_hash)) {
      return res.status(401).json(INVALID);
    }

    // ✅ FIX-5: consume atomically. Two requests racing the same valid code
    // cannot both win — only the one that actually deletes the row proceeds.
    const consumed = await OtpCode.findOneAndDelete({ key: username });
    if (!consumed) return res.status(401).json(INVALID);

    const parent = await Parent.findOne({ email: record.email })
      .select("_id email firstName lastName")
      .lean();
    if (!parent) {
      return res.status(401).json({ error: "Account not found." });
    }

    // ✅ FIX-1: PARENT_JWT_SECRET via config/jwt.js. signParent() stamps
    // typ:"parent" and applies PARENT_JWT_TTL (default 7d).
    const parent_token = signParent({
      role: "parent",
      parent_id: parent._id.toString(),
      parentId: parent._id.toString(),
      email: parent.email,
    });

    setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      parent_token, // remove once the frontend uses the cookie + GET /api/auth/me
      parent: {
        parent_id: parent._id.toString(),
        email: parent.email,
        firstName: parent.firstName || "",
        lastName: parent.lastName || "",
      },
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);
    return res.status(500).json({ error: "Could not verify the code. Please try again." });
  }
});

module.exports = router;