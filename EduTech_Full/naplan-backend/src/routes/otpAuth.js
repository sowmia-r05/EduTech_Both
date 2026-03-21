// src/routes/otpAuth.js
// OTP-by-username -> lookup email from MongoDB -> send OTP -> verify -> return login_token
// ✅ Uses Brevo API (HTTPS) instead of SMTP to avoid Render ETIMEDOUT on SMTP ports.
// ✅ UPDATED: Removed dependency on deleted ../models/user
//    Now looks up Parent by email directly (username OTP flow is legacy).

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const { sendBrevoEmail } = require("../services/brevoEmail");
const Parent = require("../models/parent"); 


const router = express.Router();

(function validateOtpConfig() {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: OTP_SECRET environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (secret.length < 32) {
    throw new Error("FATAL: OTP_SECRET must be at least 32 characters long.");
  }
  console.log("✅ OTP_SECRET validated");
})();


function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function otpExpiresSeconds() {
  const mins = Number(process.env.OTP_EXPIRES_MIN || 10);
  return Math.max(5, mins) * 60;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function lookupEmailByUsername(username) {
  const u = String(username || "").trim();
  if (!u) return null;

  const rx = new RegExp(`^${escapeRegExp(u)}$`, "i");

  // ✅ Look up Parent by email (username field treated as email for legacy support)
  const doc =
    (await Parent.findOne({ email: rx }).select("email").lean()) ||
    (await Parent.findOne({ username: rx }).select("email").lean());

  const email = String(doc?.email || "").trim().toLowerCase();
  return email || null;
}

// In-memory OTP store (Render restarts clear this; Mongo storage is better later)
const otpStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of otpStore.entries()) {
    if (!record || now > record.expiresAt) {
      otpStore.delete(key);
    }
  }
}, 60 *1000).unref?.();

function hashOtp(username, otp) {
  
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET)
    .update(`${username}:${otp}`)
    .digest("hex");
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email) {
  return String(email || "").replace(/(^.).*(@.*$)/, "$1****$2");
}

// POST /api/auth/otp/request { username }
router.post("/otp/request", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    if (!username) return res.status(400).json({ error: "Username required" });

    const emailRaw = await lookupEmailByUsername(username);
    if (!emailRaw) return res.status(404).json({ error: "User not found" });

    const email = String(emailRaw).trim().toLowerCase();

    const now = Date.now();
    const existing = otpStore.get(username);

    if (existing?.lastSentAt && now - existing.lastSentAt < 30_000) {
      return res
        .status(429)
        .json({ error: "Please wait 30 seconds before requesting another OTP." });
    }

    const otp = makeOtp();
    const hash = hashOtp(username, otp);
    const expiresAt = now + otpExpiresSeconds() * 1000;

    otpStore.set(username, { 
      otpHash: hashOtp(username, otp),
      expiresAt: Date.now() + (otpExpiresSeconds() * 1000),
      attempts: 0,
    });

    await sendBrevoEmail({
      toEmail: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Your one-time password is:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</div>
          <p>This code expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.</p>
          <p>If you didn't request this code, you can ignore this email.</p>
        </div>
      `,
    });

    return res.json({ ok: true, email_masked: maskEmail(email) });
  } catch (err) {
    console.error("OTP request error:", err?.response?.data || err);
    return res.status(500).json({
      error: "Failed to send OTP",
      detail: err?.response?.data || err.message,
    });
  }
});

// POST /api/auth/otp/verify { username, otp }
router.post("/otp/verify", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!username || !otp) {
      return res.status(400).json({ error: "Username and OTP required" });
    }

    const record = otpStore.get(username);
    if (!record || Date.now() > record.expiresAt) {
      otpStore.delete(username);
      return res.status(401).json({ error: "OTP expired. Please request a new one" });
    } 

    if (!record || Date.now() > record.expiresAt) {
      otpStore.delete(username);
      return res.status(401).json({ error: "OTP expired" });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      otpStore.delete(username);
      return res.status(429).json({ error: "Too many attempts. Request a new OTP." });
    }

    const expected = record.hash;
    const got = hashOtp(username, otp);
    if (got !== expected) return res.status(401).json({ error: "Invalid OTP" });

    otpStore.delete(username);

    const loginSecret = requiredEnv("OTP_SECRET");
    const now = Math.floor(Date.now() / 1000);

    const loginToken = jwt.sign(
      { sub: username, email: record.email, iat: now, exp: now + 15 * 60 },
      loginSecret,
      { algorithm: "HS256" }
    );

    return res.json({ ok: true, login_token: loginToken });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({ error: "Failed to verify OTP", detail: err.message });
  }
});

module.exports = router;