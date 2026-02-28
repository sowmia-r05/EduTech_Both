/**
 * middleware/adminAuth.js
 *
 * Admin authentication middleware — Email + Password version.
 *
 * Flow:
 *   POST /api/admin/login  { email, password }  → returns JWT
 *   All /api/admin/* protected routes use requireAdmin middleware
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

/**
 * Middleware — verifies admin JWT on protected routes
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin" && decoded.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

module.exports = { requireAdmin };