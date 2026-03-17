/**
 * middleware/adminAuth.js
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

/**
 * requireAdmin — allows both admin and tutor roles
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
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