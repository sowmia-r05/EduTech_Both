const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const router = express.Router();

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * ✅ Only allow SSO if user is OTP-verified.
 * Accept login_token from:
 *  - query: ?login_token=...
 *  - header: Authorization: Bearer <token>
 *
 * ✅ IMPORTANT:
 * Your otpAuth.js must sign login_token like:
 *   jwt.sign({ sub: username, email }, OTP_SECRET, ...)
 *
 * This returns { username, email }.
 */
function requireOtpLogin(req) {
  const q = String(req.query.login_token || "").trim();
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const token = q || bearer;
  if (!token) throw new Error("Missing login_token. Please verify OTP first.");

  const secret = requiredEnv("OTP_SECRET");
  const decoded = jwt.verify(token, secret); // throws if invalid/expired

  const username = String(decoded?.sub || "").trim(); // ✅ username
  const email = String(decoded?.email || "").trim().toLowerCase(); // ✅ optional

  if (!username) throw new Error("Invalid login_token (missing username)");

  return { username, email };
}

function buildFlexiQuizJwt({ username, email = "", firstName = "", lastName = "" }) {
  const sharedSecret = requiredEnv("FLEXIQUIZ_SHARED_SECRET");
  const issuer = process.env.FLEXIQUIZ_ISSUER || ""; // optional

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    ...(issuer ? { iss: issuer } : {}),
    iat: now,
    exp: now + 5 * 60,
    jti: crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex"),

    // ✅ FlexiQuiz identifier:
    user_name: username,
    email: email || "",
    first_name: firstName,
    last_name: lastName,
  };

  return jwt.sign(payload, sharedSecret, { algorithm: "HS256" });
}

// ✅ GET /api/flexiquiz/sso-url?login_token=...
router.get("/sso-url", (req, res) => {
  try {
    const { username, email } = requireOtpLogin(req);

    const firstName = String(req.query.first_name || "").trim();
    const lastName = String(req.query.last_name || "").trim();

    const token = buildFlexiQuizJwt({ username, email, firstName, lastName });

    const url = `https://www.flexiquiz.com/Account/Auth?cla=t&jwt=${encodeURIComponent(
      token
    )}`;

    return res.json({ url });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
});

// ✅ GET /api/flexiquiz/sso?login_token=...
router.get("/sso", (req, res) => {
  try {
    const { username, email } = requireOtpLogin(req);

    const firstName = String(req.query.first_name || "").trim();
    const lastName = String(req.query.last_name || "").trim();

    const token = buildFlexiQuizJwt({ username, email, firstName, lastName });

    const url = `https://www.flexiquiz.com/Account/Auth?cla=t&jwt=${encodeURIComponent(
      token
    )}`;

    return res.redirect(url);
  } catch (err) {
    return res.status(401).send(err.message);
  }
});

module.exports = router;
