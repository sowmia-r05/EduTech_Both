const router = require("express").Router();
const crypto = require("crypto");

const Parent = require("../models/parent");
const { signParentToken } = require("../middleware/auth");
const { sendBrevoEmail } = require("../services/brevoEmail");

// ─── Helpers ───

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function hashOTP(otp) {
  const secret = process.env.JWT_SECRET || "fallback-secret";
  return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

function maskEmail(email) {
  return String(email || "").replace(/(^.{2}).*(@.*$)/, "$1****$2");
}

// ────────────────────────────────────────────
// POST /api/auth/send-otp
// Sends a 6-digit OTP to the given email.
// Works for BOTH login and registration.
// If the email doesn't exist yet, that's fine — we handle it at verify.
// ────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailClean = String(email || "").trim().toLowerCase();

    if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Find or prepare — we don't create the account yet (that happens at verify if registering)
    let parent = await Parent.findOne({ email: emailClean });

    // Rate limit: 30 seconds between sends
    if (parent?.otp_last_sent) {
      const elapsed = Date.now() - new Date(parent.otp_last_sent).getTime();
      if (elapsed < 30000) {
        return res.status(429).json({
          error: "Please wait 30 seconds before requesting another code",
        });
      }
    }

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (parent) {
      // Existing user: update OTP fields
      parent.otp_hash = otpHash;
      parent.otp_expires = otpExpires;
      parent.otp_attempts = 0;
      parent.otp_last_sent = new Date();
      await parent.save();
    } else {
      // New email: store OTP temporarily in a lightweight doc
      // We'll create the full account at verify time with their name
      // For now, store in a temporary collection or in-memory
      // Using a simple approach: create a "pending" parent with placeholder name
      // Actually — better approach: store OTP in memory keyed by email
      // (will be replaced with full account at verify)
      _pendingOTPs.set(emailClean, {
        hash: otpHash,
        expires: otpExpires,
        attempts: 0,
        lastSent: new Date(),
      });
    }

    // Send OTP email
    try {
      await sendBrevoEmail({
        toEmail: emailClean,
        subject: "Your login code — KAI Solutions",
        text: `Your verification code is ${otp}. It expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 500px;">
            <h2 style="color: #1A56DB;">Your Verification Code</h2>
            <p>Use the code below to sign in:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; 
                        color: #1A56DB; margin: 20px 0; text-align: center;">
              ${otp}
            </div>
            <p style="color: #6B7280; font-size: 14px;">
              This code expires in 10 minutes. If you didn't request this, you can safely ignore it.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send OTP email:", emailErr.message);
      return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }

    // Does account exist? (tells frontend whether to show name fields)
    const isExisting = !!parent;

    return res.json({
      ok: true,
      email_masked: maskEmail(emailClean),
      is_existing: isExisting,
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ error: "Failed to send code. Please try again." });
  }
});

// In-memory store for pending OTPs (new users who haven't registered yet)
// In production, consider Redis or a temporary MongoDB collection
const _pendingOTPs = new Map();

// Clean up expired pending OTPs every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of _pendingOTPs) {
    if (now > new Date(data.expires).getTime()) {
      _pendingOTPs.delete(email);
    }
  }
}, 15 * 60 * 1000);

// ────────────────────────────────────────────
// POST /api/auth/verify-otp
// Verifies OTP. If account exists → login. If new → create account.
// For NEW users, requires first_name + last_name in body.
// ────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, first_name, last_name } = req.body || {};

    const emailClean = String(email || "").trim().toLowerCase();
    const otpClean = String(otp || "").trim();

    if (!emailClean) return res.status(400).json({ error: "Email is required" });
    if (!otpClean || otpClean.length !== 6) {
      return res.status(400).json({ error: "6-digit code is required" });
    }

    const otpHash = hashOTP(otpClean);
    let parent = await Parent.findOne({ email: emailClean });

    if (parent) {
      // ─── EXISTING USER: verify OTP from parent document ───
      if (!parent.otp_hash || !parent.otp_expires) {
        return res.status(401).json({ error: "No code was requested. Please request a new one." });
      }

      if (new Date() > new Date(parent.otp_expires)) {
        parent.otp_hash = null;
        parent.otp_expires = null;
        parent.otp_attempts = 0;
        await parent.save();
        return res.status(401).json({ error: "Code expired. Please request a new one." });
      }

      parent.otp_attempts += 1;
      if (parent.otp_attempts > 5) {
        parent.otp_hash = null;
        parent.otp_expires = null;
        parent.otp_attempts = 0;
        await parent.save();
        return res.status(429).json({ error: "Too many attempts. Please request a new code." });
      }

      if (otpHash !== parent.otp_hash) {
        await parent.save();
        return res.status(401).json({ error: "Invalid code. Please try again." });
      }

      // OTP valid — clear it and mark email verified
      parent.otp_hash = null;
      parent.otp_expires = null;
      parent.otp_attempts = 0;
      parent.email_verified = true;
      await parent.save();

      const token = signParentToken(parent);
      return res.json({ token, parent: parent.toSafeJSON(), is_new: false });

    } else {
      // ─── NEW USER: verify OTP from pending store, then create account ───
      const pending = _pendingOTPs.get(emailClean);

      if (!pending) {
        return res.status(401).json({ error: "No code was requested. Please request a new one." });
      }

      if (new Date() > new Date(pending.expires)) {
        _pendingOTPs.delete(emailClean);
        return res.status(401).json({ error: "Code expired. Please request a new one." });
      }

      pending.attempts += 1;
      if (pending.attempts > 5) {
        _pendingOTPs.delete(emailClean);
        return res.status(429).json({ error: "Too many attempts. Please request a new code." });
      }

      if (otpHash !== pending.hash) {
        return res.status(401).json({ error: "Invalid code. Please try again." });
      }

      // OTP valid — require name fields for new account
      const firstName = String(first_name || "").trim();
      const lastName = String(last_name || "").trim();

      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required for new accounts" });
      }

      // Create account
      parent = await Parent.create({
        email: emailClean,
        first_name: firstName,
        last_name: lastName,
        auth_provider: "otp",
        email_verified: true, // verified by OTP
        status: "active",
      });

      _pendingOTPs.delete(emailClean);

      const token = signParentToken(parent);
      return res.status(201).json({ token, parent: parent.toSafeJSON(), is_new: true });
    }
  } catch (err) {
    console.error("Verify OTP error:", err);

    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    return res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/google
// Verify Google ID token, create or login parent.
// Frontend sends the Google credential (ID token) from Google Sign-In.
// ────────────────────────────────────────────
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body || {};

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Decode and verify the Google ID token
    // We verify it by calling Google's tokeninfo endpoint
    // (Alternative: use google-auth-library — but this avoids an extra dependency)
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!googleRes.ok) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const googlePayload = await googleRes.json();

    // Verify the token is for our app
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && googlePayload.aud !== clientId) {
      return res.status(401).json({ error: "Google token is not for this application" });
    }

    const { sub: googleSub, email, given_name, family_name, picture, email_verified } = googlePayload;

    if (!email) {
      return res.status(400).json({ error: "Google account must have an email" });
    }

    const emailClean = String(email).trim().toLowerCase();

    // Check if parent exists by email or google_sub
    let parent = await Parent.findOne({
      $or: [{ email: emailClean }, { google_sub: googleSub }],
    });

    let isNew = false;

    if (parent) {
      // Existing user: link Google if not already linked
      if (!parent.google_sub) {
        parent.google_sub = googleSub;
        parent.google_picture = picture || null;
        parent.auth_provider = parent.auth_provider === "otp" ? "both" : parent.auth_provider;
      }
      parent.email_verified = true;
      parent.google_picture = picture || parent.google_picture;
      await parent.save();
    } else {
      // New user: create account from Google profile
      parent = await Parent.create({
        email: emailClean,
        first_name: given_name || "Parent",
        last_name: family_name || "",
        auth_provider: "google",
        google_sub: googleSub,
        google_picture: picture || null,
        email_verified: true, // Google emails are verified
        status: "active",
      });
      isNew = true;
    }

    const token = signParentToken(parent);

    return res.status(isNew ? 201 : 200).json({
      token,
      parent: parent.toSafeJSON(),
      is_new: isNew,
    });
  } catch (err) {
    console.error("Google auth error:", err);

    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    return res.status(500).json({ error: "Google sign-in failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// GET /api/auth/me  (get current parent profile)
// NOTE: requireParent middleware applied in app.js
// ────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const parent = await Parent.findById(req.user.parentId);
    if (!parent || parent.status !== "active") {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({ parent: parent.toSafeJSON() });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

module.exports = router;
