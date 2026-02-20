// src/routes/otpAuth.js
// OTP-by-username -> lookup email from MongoDB -> send OTP -> verify -> return login_token

require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// ✅ Force IPv4 first (helps on some hosts like Render when IPv6 route is not reachable)
const dns = require("dns");
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  // If your Node version doesn't support this:
  // Set Render env: NODE_OPTIONS=--dns-result-order=ipv4first
}

// ✅ DB + User model (make sure paths match your project)
const connectDB = require("../config/db");
const User = require("../models/user");

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

// ✅ UPDATED mailer(): correct secure handling + requireTLS + force IPv4
function mailer() {
  const host = requiredEnv("SMTP_HOST");
  const port = Number(requiredEnv("SMTP_PORT"));

  return nodemailer.createTransport({
    host,
    port,

    // ✅ 465 = SSL (secure true), 587 = STARTTLS (secure false)
    secure: port === 465,
    requireTLS: port === 587,

    auth: {
      user: requiredEnv("SMTP_USER"),
      pass: requiredEnv("SMTP_PASS"),
    },

    // ✅ Forces IPv4 (fixes ENETUNREACH IPv6 issues)
    family: 4,
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ✅ LOOKUP EMAIL BY USERNAME (MongoDB)
 * Ensure the fields below match your schema.
 */
async function lookupEmailByUsername(username) {
  const u = String(username || "").trim();
  if (!u) return null;

  // Ensure DB connected
  if (typeof connectDB === "function") {
    await connectDB();
  }

  // Case-insensitive exact match
  const rx = new RegExp(`^${escapeRegExp(u)}$`, "i");

  // Try multiple possible username fields
  const doc =
    (await User.findOne({ username: rx }).select("email email_address").lean()) ||
    (await User.findOne({ user_name: rx }).select("email email_address").lean()) ||
    (await User.findOne({ userId: rx }).select("email email_address").lean()) ||
    (await User.findOne({ studentId: rx }).select("email email_address").lean());

  const email = String(doc?.email || doc?.email_address || "").trim().toLowerCase();
  return email || null;
}

// ✅ Store OTPs by username (in-memory)
// NOTE: This will reset if Render restarts; for production use Redis/DB.
const otpStore = new Map(); // username -> { email, hash, expiresAt, attempts, lastSentAt }

function hashOtp(username, otp) {
  const secret = requiredEnv("OTP_SECRET");
  return crypto.createHmac("sha256", secret).update(`${username}:${otp}`).digest("hex");
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
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
      return res.status(429).json({ error: "Please wait before requesting another OTP." });
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

    const from = process.env.MAIL_FROM || requiredEnv("SMTP_USER");
    const transport = mailer();

    // ✅ Optional but recommended: verifies SMTP connection & auth (helps debugging)
    // If this fails, Render logs will show the real reason (EAUTH, ETIMEDOUT, etc.)
    await transport.verify();

    await transport.sendMail({
      from,
      to: email,
      subject: "Your NAPLAN OTP Code",
      text: `Your OTP is ${otp}. It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.`,
      html: `<p>Your OTP is <b style="font-size:18px">${otp}</b></p>
             <p>It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.</p>`,
    });

    // Mask email for UI
    const masked = email.replace(/(^.).*(@.*$)/, "$1****$2");
    return res.json({ ok: true, email_masked: masked });
  } catch (err) {
    console.error(err);
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
      return res.status(429).json({ error: "Too many attempts. Request a new OTP." });
    }

    const expected = record.hash;
    const got = hashOtp(username, otp);
    if (got !== expected) return res.status(401).json({ error: "Invalid OTP" });

    otpStore.delete(username);

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
    console.error(err);
    return res.status(500).json({
      error: "Failed to verify OTP",
      detail: err.message,
    });
  }
});

module.exports = router;
