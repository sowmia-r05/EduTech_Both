// src/routes/otpAuth.js
// OTP-by-username -> lookup email from MongoDB -> send OTP -> verify -> return login_token

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// ✅ If you use MongoDB (mongoose) in your project, import your User model here.
// NOTE: connectDB SHOULD be called once in your main server (server.js/index.js),
// not inside this route file. So we DO NOT call connectDB() here.
const User = require("../models/user"); // <-- update if your path/model name differs

const router = express.Router();

/* -----------------------------
   Helpers
----------------------------- */

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function otpExpiresSeconds() {
  const mins = Number(process.env.OTP_EXPIRES_MIN || 10);
  return Math.max(5, mins) * 60;
}

function mailer() {
  // ✅ Brevo SMTP on port 587 uses STARTTLS, so secure must be false + requireTLS true
  return nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: Number(requiredEnv("SMTP_PORT")), // 587
    secure: false, // ✅ MUST be false for 587
    requireTLS: true, // ✅ enforce STARTTLS
    auth: {
      user: requiredEnv("SMTP_USER"), // e.g. a2e07f001@smtp-brevo.com
      pass: requiredEnv("SMTP_PASS"), // ✅ SMTP key value
    },
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ✅ LOOKUP EMAIL BY USERNAME (MongoDB)
 *
 * Update these field names if needed:
 * - username field could be: username / user_name / userId / studentId
 * - email field could be: email / email_address
 */
async function lookupEmailByUsername(username) {
  const u = String(username || "").trim();
  if (!u) return null;

  // Case-insensitive exact match
  const rx = new RegExp(`^${escapeRegExp(u)}$`, "i");

  // Try multiple possible username fields
  const doc =
    (await User.findOne({ username: rx }).select("email email_address").lean()) ||
    (await User.findOne({ user_name: rx }).select("email email_address").lean()) ||
    (await User.findOne({ userId: rx }).select("email email_address").lean()) ||
    (await User.findOne({ studentId: rx }).select("email email_address").lean());

  const email = String(doc?.email || doc?.email_address || "")
    .trim()
    .toLowerCase();

  return email || null;
}

// ✅ Store OTPs by username (in-memory for now)
const otpStore = new Map(); // username -> { email, hash, expiresAt, attempts, lastSentAt }

function hashOtp(username, otp) {
  const secret = requiredEnv("OTP_SECRET");
  return crypto
    .createHmac("sha256", secret)
    .update(`${username}:${otp}`)
    .digest("hex");
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function maskEmail(email) {
  const e = String(email || "");
  return e.replace(/(^.).*(@.*$)/, "$1****$2");
}

/* -----------------------------
   Routes
----------------------------- */

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

    // Rate limit: one OTP per 30 seconds per username
    if (existing?.lastSentAt && now - existing.lastSentAt < 30_000) {
      return res
        .status(429)
        .json({ error: "Please wait 30 seconds before requesting another OTP." });
    }

    const otp = makeOtp();
    const hash = hashOtp(username, otp);
    const expiresAt = now + otpExpiresSeconds() * 1000;

    otpStore.set(username, {
      email,
      hash,
      expiresAt,
      attempts: 0,
      lastSentAt: now,
    });

    // ✅ Proper FROM (must be a verified sender in Brevo + domain authenticated)
    const fromName = process.env.MAIL_FROM_NAME || "KAI Solutions";
    const fromEmail = process.env.MAIL_FROM_EMAIL || "no-reply@kaisolutions.ai";
    const from = `"${fromName}" <${fromEmail}>`;

    const transport = mailer();

    await transport.sendMail({
      from,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Your one-time password is:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</div>
          <p>This code expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.</p>
          <p>If you didn’t request this code, you can ignore this email.</p>
        </div>
      `,
    });

    return res.json({ ok: true, email_masked: maskEmail(email) });
  } catch (err) {
    console.error("OTP request error:", err);
    return res.status(500).json({
      error: "Failed to send OTP",
      detail: err.message,
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
    if (!record) return res.status(401).json({ error: "OTP not requested" });

    if (Date.now() > record.expiresAt) {
      otpStore.delete(username);
      return res.status(401).json({ error: "OTP expired" });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      otpStore.delete(username);
      return res
        .status(429)
        .json({ error: "Too many attempts. Request a new OTP." });
    }

    const expected = record.hash;
    const got = hashOtp(username, otp);
    if (got !== expected) return res.status(401).json({ error: "Invalid OTP" });

    otpStore.delete(username);

    // ✅ Use OTP_SECRET to sign token (same secret used to hash OTP)
    const loginSecret = requiredEnv("OTP_SECRET");
    const now = Math.floor(Date.now() / 1000);

    // login_token used by /api/flexiquiz/sso
    const loginToken = jwt.sign(
      { sub: username, email: record.email, iat: now, exp: now + 15 * 60 },
      loginSecret,
      { algorithm: "HS256" }
    );

    return res.json({ ok: true, login_token: loginToken });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({
      error: "Failed to verify OTP",
      detail: err.message,
    });
  }
});

module.exports = router;