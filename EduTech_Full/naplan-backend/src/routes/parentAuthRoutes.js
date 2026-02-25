const router = require("express").Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const connectDB = require("../config/db");
const Parent = require("../models/parent");
const { sendBrevoEmail } = require("../services/brevoEmail");

// ✅ Parent session token secret
const PARENT_SECRET = process.env.PARENT_JWT_SECRET;

// In-memory pending signup store (email -> pending record)
const pendingParentSignups = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 min
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000; // optional: 30s cooldown

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function hashOtp(email, otp) {
  const secret = process.env.OTP_SECRET || "dev-parent-otp-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${normalizeEmail(email)}:${String(otp)}`)
    .digest("hex");
}

function maskEmail(email) {
  return String(email || "").replace(/(^.).*(@.*$)/, "$1****$2");
}

// cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [email, rec] of pendingParentSignups.entries()) {
    if (!rec || now > rec.expiresAt) {
      pendingParentSignups.delete(email);
    }
  }
}, 60 * 1000).unref?.();

async function sendOtpEmail(toEmail, otp) {
  await sendBrevoEmail({
    toEmail,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p>Your OTP for parent account verification is:</p>
        <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</div>
        <p>This code expires in 5 minutes.</p>
        <p>If you didn’t request this code, you can ignore this email.</p>
      </div>
    `,
  });
}

/**
 * POST /api/parents/auth/send-otp
 * body: { firstName, lastName, email }
 * - does NOT create parent in DB
 * - stores pending data in cache only
 */
router.post("/send-otp", async (req, res) => {
  try {
    await connectDB();

    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const email = normalizeEmail(req.body?.email);

    if (!firstName) {
      return res.status(400).json({ ok: false, error: "First name is required" });
    }

    if (!lastName) {
      return res.status(400).json({ ok: false, error: "Last name is required" });
    }

    if (!email) {
      return res.status(400).json({ ok: false, error: "Email is required" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "Valid email is required" });
    }

    // block if already registered
    const exists = await Parent.exists({ email });
    if (exists) {
      return res.status(409).json({
        ok: false,
        code: "EMAIL_EXISTS",
        error: "This email already exists. Please sign in.",
      });
    }

    const now = Date.now();
    const existing = pendingParentSignups.get(email);

    // optional resend cooldown
    if (existing?.lastSentAt && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      return res.status(429).json({
        ok: false,
        error: "Please wait 30 seconds before requesting another OTP.",
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(email, otp);

    pendingParentSignups.set(email, {
      firstName,
      lastName,
      email,
      otpHash,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });

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

/**
 * POST /api/parents/auth/verify-otp
 * body: { email, otp }
 * - verifies cache OTP
 * - creates Parent in DB ONLY after success
 */
router.post("/verify-otp", async (req, res) => {
  try {
    if (!PARENT_SECRET) {
      return res.status(500).json({ ok: false, error: "PARENT_JWT_SECRET missing" });
    }

    await connectDB();

    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email) {
      return res.status(400).json({ ok: false, error: "Email is required" });
    }

    if (!otp) {
      return res.status(400).json({ ok: false, error: "OTP is required" });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ ok: false, error: "OTP must be a 6-digit code" });
    }

    const record = pendingParentSignups.get(email);
    if (!record) {
      return res
        .status(401)
        .json({ ok: false, error: "OTP not requested. Please request OTP again." });
    }

    if (Date.now() > record.expiresAt) {
      pendingParentSignups.delete(email);
      return res.status(401).json({ ok: false, error: "OTP expired. Please request OTP again." });
    }

    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > MAX_OTP_ATTEMPTS) {
      pendingParentSignups.delete(email);
      return res.status(429).json({ ok: false, error: "Too many attempts. Request a new OTP." });
    }

    const expected = record.otpHash;
    const got = hashOtp(email, otp);

    if (got !== expected) {
      pendingParentSignups.set(email, record);
      return res.status(401).json({ ok: false, error: "Invalid OTP" });
    }

    // ✅ OTP verified -> create parent in DB now
    let parent = await Parent.findOne({ email });
    if (!parent) {
      parent = await Parent.create({
        email,
        firstName: String(record.firstName || "").trim(),
        lastName: String(record.lastName || "").trim(),
        status: "active",
      });
    }

    // clear cache after success
    pendingParentSignups.delete(email);

    const parent_token = jwt.sign(
      {
        typ: "parent",
        parent_id: parent._id.toString(),
        email: parent.email,
      },
      PARENT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      parent_token,
      parent: {
        parent_id: parent._id.toString(),
        email: parent.email,
        firstName: parent.firstName || "",
        lastName: parent.lastName || "",
        name: `${parent.firstName || ""} ${parent.lastName || ""}`.trim(), // optional convenience
      },
    });
  } catch (err) {
    console.error("Parent verify-otp failed:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Parent already exists" });
    }
    return res.status(500).json({ ok: false, error: "Failed to verify OTP", detail: err.message });
  }
});

module.exports = router;