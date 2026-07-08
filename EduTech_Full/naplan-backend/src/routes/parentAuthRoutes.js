const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const connectDB = require("../config/db");
const Parent = require("../models/parent");
const PendingOtp = require("../models/pendingOtp");
const { sendBrevoEmail } = require("../services/brevoEmail");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");

const PARENT_SECRET = process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET;
const PARENT_COOKIE_MAX_AGE = 356 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function hashOtp(email, otp) {
  const secret =
    process.env.OTP_HASH_SECRET || process.env.PARENT_JWT_SECRET || "fallback";
  return crypto
    .createHmac("sha256", secret)
    .update(`${email}:${otp}`)
    .digest("hex");
}
function maskEmail(email) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

async function sendOtpEmail(toEmail, otp) {
  await sendBrevoEmail({
    toEmail,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><p>Your OTP for parent account verification is:</p><div style="font-size:24px;font-weight:bold;letter-spacing:2px">${otp}</div><p>This code expires in 10 minutes.</p></div>`,
  });
}

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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
    )
      return res.status(429).json({
        ok: false,
        error: "Please wait 30 seconds before requesting another OTP.",
      });

    const otp = generateOtp();
    const otpHash = hashOtp(email, otp);

    await PendingOtp.findOneAndUpdate(
      { email, purpose: "signup" },
      {
        $set: {
          email,
          purpose: "signup",
          codeHash: otpHash,
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
      otp_expires_in_sec: 600,
    });
  } catch (err) {
    console.error("Parent send-otp failed:", err?.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: "Failed to send OTP",
      detail: err?.response?.data || err.message,
    });
  }
});

// POST /api/parents/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    if (!PARENT_SECRET)
      return res.status(500).json({ ok: false, error: "PARENT_JWT_SECRET missing" });
    await connectDB();

    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!otp)
      return res.status(400).json({ ok: false, error: "OTP is required" });
    if (!/^\d{6}$/.test(otp))
      return res.status(400).json({ ok: false, error: "OTP must be a 6-digit code" });

    const record = await PendingOtp.findOne({ email, purpose: "signup" });
    if (!record)
      return res.status(401).json({
        ok: false,
        error: "OTP not requested. Please request OTP again.",
      });
    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await PendingOtp.deleteOne({ _id: record._id });
      return res.status(401).json({ ok: false, error: "OTP expired. Please request OTP again." });
    }

    const attempts = (record.attempts || 0) + 1;
    if (attempts > MAX_OTP_ATTEMPTS) {
      await PendingOtp.deleteOne({ _id: record._id });
      return res.status(429).json({ ok: false, error: "Too many attempts. Request a new OTP." });
    }

    if (hashOtp(email, otp) !== record.codeHash) {
      await PendingOtp.updateOne({ _id: record._id }, { $set: { attempts } });
      return res.status(401).json({ ok: false, error: "Invalid OTP" });
    }

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

    const parent_token = jwt.sign(
      {
        typ: "parent",
        role: "parent",
        parent_id: parent._id.toString(),
        parentId: parent._id.toString(),
        email: parent.email,
      },
      PARENT_SECRET,
      { expiresIn: "365d" },
    );

    // ✅ FIX: was `token` (undefined) — now correctly `parent_token`
    setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      parent_token, // also return in body for frontend
      parent: {
        parentId: parent._id,
        email: parent.email,
        firstName: parent.firstName,
        lastName: parent.lastName,
      },
    });
  } catch (err) {
    console.error("Parent verify-otp failed:", err);
    if (err?.code === 11000)
      return res.status(409).json({ ok: false, error: "Parent already exists" });
    return res.status(500).json({ ok: false, error: "Failed to verify OTP", detail: err.message });
  }
});

// ── Login Flow ──

router.post("/login-otp", async (req, res) => {
  try {
    await connectDB();
    const email = normalizeEmail(req.body?.email);
    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ ok: false, error: "Valid email is required" });

    const parent = await Parent.findOne({ email });
    if (!parent)
      return res.status(404).json({
        ok: false,
        error: "No account found with this email. Please create an account first.",
      });

    const now = Date.now();
    const existing = await PendingOtp.findOne({ email, purpose: "login" });
    if (
      existing?.lastSentAt &&
      now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
    )
      return res.status(429).json({
        ok: false,
        error: "Please wait 30 seconds before requesting another code.",
      });

    const otp = generateOtp();
    const otpHash = hashOtp(email, otp);

    await PendingOtp.findOneAndUpdate(
      { email, purpose: "login" },
      {
        $set: {
          email,
          purpose: "login",
          codeHash: otpHash,
          attempts: 0,
          lastSentAt: new Date(now),
          expiresAt: new Date(now + OTP_TTL_MS),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await sendOtpEmail(email, otp);
    return res.json({ ok: true, otp_sent_to: maskEmail(email) });
  } catch (err) {
    console.error("Parent login-otp failed:", err);
    return res.status(500).json({ ok: false, error: "Failed to send login code" });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res, "parent_token");
  res.json({ ok: true });
});

router.post("/verify-login-otp", async (req, res) => {
  try {
    if (!PARENT_SECRET)
      return res.status(500).json({ ok: false, error: "PARENT_JWT_SECRET missing" });
    await connectDB();

    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email)
      return res.status(400).json({ ok: false, error: "Email is required" });
    if (!otp || !/^\d{6}$/.test(otp))
      return res.status(400).json({ ok: false, error: "OTP must be a 6-digit code" });

    const record = await PendingOtp.findOne({ email, purpose: "login" });
    if (!record)
      return res.status(401).json({
        ok: false,
        error: "No login code requested. Please request one first.",
      });
    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await PendingOtp.deleteOne({ _id: record._id });
      return res.status(401).json({ ok: false, error: "Code expired. Please request a new one." });
    }

    const attempts = (record.attempts || 0) + 1;
    if (attempts > MAX_OTP_ATTEMPTS) {
      await PendingOtp.deleteOne({ _id: record._id });
      return res.status(429).json({ ok: false, error: "Too many attempts. Request a new code." });
    }

    if (hashOtp(email, otp) !== record.codeHash) {
      await PendingOtp.updateOne({ _id: record._id }, { $set: { attempts } });
      return res.status(401).json({ ok: false, error: "Invalid code" });
    }

    const parent = await Parent.findOne({ email });
    if (!parent) {
      await PendingOtp.deleteOne({ _id: record._id });
      return res.status(404).json({ ok: false, error: "Account not found" });
    }
    await PendingOtp.deleteOne({ _id: record._id });

    const parent_token = jwt.sign(
      {
        typ: "parent",
        role: "parent",
        parent_id: parent._id.toString(),
        parentId: parent._id.toString(),
        email: parent.email,
      },
      PARENT_SECRET,
      { expiresIn: "365d" },
    );

    setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      parent_token,
      parent: {
        parentId: parent._id,
        email: parent.email,
        firstName: parent.firstName,
        lastName: parent.lastName,
      },
    });
  } catch (err) {
    console.error("Parent verify-login-otp failed:", err);
    return res.status(500).json({ ok: false, error: "Verification failed" });
  }
});

module.exports = router;