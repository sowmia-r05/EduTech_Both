const router = require("express").Router();
const crypto = require("crypto");

const Parent = require("../models/parent");
const { signParentToken } = require("../middleware/auth");
const { sendBrevoEmail } = require("../services/brevoEmail");

// ─── Helpers ───

const FRONTEND_URL = () => process.env.FRONTEND_ORIGIN || "http://localhost:5173";

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(pw) {
  // Min 8 chars, at least 1 letter and 1 number
  return typeof pw === "string" && pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

// ────────────────────────────────────────────
// POST /api/auth/register
// ────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body || {};

    // Validate
    const emailClean = String(email || "").trim().toLowerCase();
    if (!emailClean || !validEmail(emailClean)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!validPassword(password)) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters with at least 1 letter and 1 number" });
    }
    if (!first_name || !String(first_name).trim()) {
      return res.status(400).json({ error: "First name is required" });
    }
    if (!last_name || !String(last_name).trim()) {
      return res.status(400).json({ error: "Last name is required" });
    }

    // Check duplicate
    const existing = await Parent.findOne({ email: emailClean });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Generate email verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create parent (password is hashed via pre-save hook)
    const parent = await Parent.create({
      email: emailClean,
      password_hash: password, // pre-save hook will bcrypt this
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      phone: phone ? String(phone).trim() : null,
      auth_provider: "local",
      email_verified: false,
      email_verify_token: verifyToken,
      email_verify_expires: verifyExpires,
    });

    // Send verification email
    const verifyUrl = `${FRONTEND_URL()}/verify-email?token=${verifyToken}`;

    try {
      await sendBrevoEmail({
        toEmail: emailClean,
        subject: "Verify your email — KAI Solutions",
        text: `Please verify your email by visiting: ${verifyUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 500px;">
            <h2 style="color: #1A56DB;">Welcome to KAI Solutions!</h2>
            <p>Hi ${parent.first_name},</p>
            <p>Thanks for signing up. Please verify your email to get started:</p>
            <a href="${verifyUrl}" 
               style="display: inline-block; padding: 12px 24px; background: #1A56DB; color: white; 
                      text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">
              Verify Email
            </a>
            <p style="color: #6B7280; font-size: 14px;">
              This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send verification email:", emailErr.message);
      // Don't block registration if email fails — parent can re-request
    }

    // Return JWT so parent can access dashboard immediately (with email_verified: false banner)
    const token = signParentToken(parent);

    return res.status(201).json({
      token,
      parent: parent.toSafeJSON(),
      message: "Account created. Please check your email to verify your account.",
    });
  } catch (err) {
    console.error("Registration error:", err);

    // Mongoose duplicate key error
    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const emailClean = String(email || "").trim().toLowerCase();
    if (!emailClean || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const parent = await Parent.findOne({ email: emailClean, status: "active" });
    if (!parent) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // SSO users cannot login with password
    if (parent.auth_provider !== "local") {
      return res.status(400).json({
        error: "This account uses SSO. Please sign in with your identity provider.",
      });
    }

    const isMatch = await parent.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signParentToken(parent);

    return res.json({
      token,
      parent: parent.toSafeJSON(),
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/verify-email
// ────────────────────────────────────────────
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    const parent = await Parent.findOne({
      email_verify_token: token,
      email_verify_expires: { $gt: new Date() },
    });

    if (!parent) {
      return res.status(400).json({ error: "Invalid or expired verification link" });
    }

    parent.email_verified = true;
    parent.email_verify_token = null;
    parent.email_verify_expires = null;
    await parent.save();

    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("Email verification error:", err);
    return res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/resend-verification
// ────────────────────────────────────────────
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailClean = String(email || "").trim().toLowerCase();

    if (!emailClean) {
      return res.status(400).json({ error: "Email is required" });
    }

    const parent = await Parent.findOne({ email: emailClean });
    if (!parent) {
      // Don't reveal whether email exists
      return res.json({ message: "If the email exists, a verification link has been sent." });
    }

    if (parent.email_verified) {
      return res.json({ message: "Email is already verified." });
    }

    // Generate new token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    parent.email_verify_token = verifyToken;
    parent.email_verify_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await parent.save();

    const verifyUrl = `${FRONTEND_URL()}/verify-email?token=${verifyToken}`;

    try {
      await sendBrevoEmail({
        toEmail: emailClean,
        subject: "Verify your email — KAI Solutions",
        text: `Please verify your email by visiting: ${verifyUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 500px;">
            <h2 style="color: #1A56DB;">Email Verification</h2>
            <p>Hi ${parent.first_name},</p>
            <p>Please click the button below to verify your email:</p>
            <a href="${verifyUrl}" 
               style="display: inline-block; padding: 12px 24px; background: #1A56DB; color: white; 
                      text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">
              Verify Email
            </a>
            <p style="color: #6B7280; font-size: 14px;">This link expires in 24 hours.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send verification email:", emailErr.message);
      // Don't block the response if email fails — token is saved, they can retry
    }

    return res.json({ message: "If the email exists, a verification link has been sent." });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ error: "Failed to resend verification email" });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/forgot-password
// ────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailClean = String(email || "").trim().toLowerCase();

    if (!emailClean) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Always return success (don't reveal whether email exists)
    const parent = await Parent.findOne({ email: emailClean, auth_provider: "local" });

    if (parent) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      parent.password_reset_token = resetToken;
      parent.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await parent.save();

      const resetUrl = `${FRONTEND_URL()}/reset-password?token=${resetToken}`;

      try {
        await sendBrevoEmail({
          toEmail: emailClean,
          subject: "Reset your password — KAI Solutions",
          text: `Reset your password by visiting: ${resetUrl}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 500px;">
              <h2 style="color: #1A56DB;">Password Reset</h2>
              <p>Hi ${parent.first_name},</p>
              <p>We received a request to reset your password. Click the button below:</p>
              <a href="${resetUrl}" 
                 style="display: inline-block; padding: 12px 24px; background: #1A56DB; color: white; 
                        text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">
                Reset Password
              </a>
              <p style="color: #6B7280; font-size: 14px;">
                This link expires in 1 hour. If you didn't request this, you can safely ignore it.
              </p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("Failed to send reset email:", emailErr.message);
      }
    }

    return res.json({ message: "If an account exists with that email, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to process request" });
  }
});

// ────────────────────────────────────────────
// POST /api/auth/reset-password
// ────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }
    if (!validPassword(password)) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters with at least 1 letter and 1 number" });
    }

    const parent = await Parent.findOne({
      password_reset_token: token,
      password_reset_expires: { $gt: new Date() },
    });

    if (!parent) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    parent.password_hash = password; // pre-save hook will bcrypt this
    parent.password_reset_token = null;
    parent.password_reset_expires = null;
    await parent.save();

    return res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

// ────────────────────────────────────────────
// GET /api/auth/me  (get current parent profile)
// ────────────────────────────────────────────
// NOTE: requireParent middleware should be applied when mounting this route
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
