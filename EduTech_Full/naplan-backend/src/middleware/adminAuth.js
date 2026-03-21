/**
 * middleware/adminAuth.js
 *
 * ✅ FIXED: Guards against "Bearer null" / "Bearer undefined" being sent
 *           by the frontend when localStorage.getItem("admin_token") returns null.
 *           Previously "null" (string) was truthy, so the cookie fallback was
 *           never reached → jwt.verify("null") threw → 401 → redirect to login.
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

/**
 * requireAdmin — allows both admin and tutor roles
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";

  // ✅ Extract raw token from header
  const rawFromHeader = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  // ✅ Guard: treat "null", "undefined", or empty string as no token
  const fromHeader =
    rawFromHeader && rawFromHeader !== "null" && rawFromHeader !== "undefined"
      ? rawFromHeader
      : null;

  // ✅ Cookie is now a genuine fallback when header token is absent/invalid
  const fromCookie = req.cookies?.admin_token || null;

  const token = fromHeader || fromCookie;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!["admin", "tutor"].includes(decoded.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin };