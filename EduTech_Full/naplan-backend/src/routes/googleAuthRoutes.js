/**
 * routes/googleAuthRoutes.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Google Sign-In for Parents
 *
 * Flow:
 *   1. Frontend loads Google Identity Services (GSI) library
 *   2. User clicks "Sign in with Google" → Google returns an ID token
 *   3. Frontend POSTs the ID token to this endpoint
 *   4. Backend verifies the token with Google, creates or finds the
 *      parent in MongoDB, and returns a parent_token JWT
 *
 * Endpoint:
 *   POST /api/parents/auth/google
 *   Body: { credential: "<google_id_token>" }
 *   Returns: { ok, parent_token, parent, is_new_account }
 *
 * Mount in app.js:
 *   const googleAuthRoutes = require("./routes/googleAuthRoutes");
 *   app.use("/api/parents/auth", googleAuthRoutes);
 * ═══════════════════════════════════════════════════════════════
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const connectDB = require("../config/db");
const Parent = require("../models/parent");

const router = express.Router();

const PARENT_SECRET = process.env.PARENT_JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const { setAuthCookie } = require("../utils/setCookies");
const PARENT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;


/**
 * Verify Google ID token using Google's tokeninfo endpoint.
 * This is simpler than using the google-auth-library and doesn't
 * require an extra npm dependency.
 */
async function verifyGoogleToken(idToken) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Google token verification failed: ${errBody}`);
  }

  const payload = await res.json();

  // Verify the token was issued for our app
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("Token audience mismatch — not issued for this app");
  }

  // Verify the token is not expired
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) < now) {
    throw new Error("Google token has expired");
  }

  // Verify email is present and verified
  if (!payload.email) {
    throw new Error("No email in Google token");
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Google email is not verified");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    firstName: payload.given_name || "",
    lastName: payload.family_name || "",
    picture: payload.picture || null,
    googleSub: payload.sub,
  };
}

/**
 * POST /api/parents/auth/google
 *
 * Accepts a Google ID token (credential) from the frontend,
 * verifies it, and either creates a new parent or logs in an existing one.
 */
router.post("/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        ok: false,
        error: "Google Sign-In is not configured on the server. Set GOOGLE_CLIENT_ID in .env",
      });
    }

    if (!PARENT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: "Server auth configuration missing (PARENT_JWT_SECRET)",
      });
    }

    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ ok: false, error: "Google credential is required" });
    }

    await connectDB();

    // 1. Verify the Google ID token
    const googleUser = await verifyGoogleToken(credential);

    // 2. Find or create parent
    let parent = await Parent.findOne({ email: googleUser.email });
    let isNewAccount = false;

    if (!parent) {
      // Create new parent from Google profile
      parent = await Parent.create({
        email: googleUser.email,
        firstName: googleUser.firstName || "Parent",
        lastName: googleUser.lastName || "",
        auth_provider: "google",
        email_verified: true,
        status: "active",
      });
      isNewAccount = true;
      console.log(`✅ New parent created via Google Sign-In: ${googleUser.email}`);
    } else {
      // Existing parent — update auth_provider if they were OTP-only before
      const updates = {};
      if (!parent.auth_provider || parent.auth_provider === "otp") {
        updates.auth_provider = "google";
      }
      if (!parent.email_verified) {
        updates.email_verified = true;
      }
      // Optionally update name if it was empty
      if (!parent.firstName && googleUser.firstName) {
        updates.firstName = googleUser.firstName;
      }
      if (!parent.lastName && googleUser.lastName) {
        updates.lastName = googleUser.lastName;
      }
      if (Object.keys(updates).length > 0) {
        await Parent.findByIdAndUpdate(parent._id, { $set: updates });
        // Refresh
        parent = await Parent.findById(parent._id);
      }
      console.log(`✅ Existing parent logged in via Google: ${googleUser.email}`);
    }

    // 3. Issue parent JWT (same format as OTP login)
    const parent_token = jwt.sign(
      {
        typ: "parent",
        parent_id: parent._id.toString(),
        email: parent.email,
      },
      PARENT_SECRET,
      { expiresIn: "365d" }
    );
    setAuthCookie(res, "parent_token", parent_token, PARENT_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      parent_token,
      parent: {
        parent_id: parent._id.toString(),
        email: parent.email,
        firstName: parent.firstName || "",
        lastName: parent.lastName || "",
        name: `${parent.firstName || ""} ${parent.lastName || ""}`.trim(),
      },
      is_new_account: isNewAccount,
    });
  } catch (err) {
    console.error("Google auth error:", err.message);
    return res.status(401).json({
      ok: false,
      error: err.message || "Google authentication failed",
    });
  }
});

module.exports = router;