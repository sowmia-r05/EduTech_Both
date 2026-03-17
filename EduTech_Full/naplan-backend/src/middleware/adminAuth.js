/**
 * middleware/adminAuth.js  (v2 — TUTOR + SUPER_ADMIN SUPPORT)
 *
 * CHANGES:
 *   ✅ requireAdmin now allows "admin", "super_admin", and "tutor" roles
 *   ✅ Added requireSuperAdmin — only "super_admin" passes
 *   ✅ Added requireVerifier — "admin", "super_admin", and "tutor" can verify questions
 *
 * Flow:
 *   POST /api/admin/login  { email, password }  → returns JWT
 *   All /api/admin/* protected routes use requireAdmin middleware
 *   Verification routes use requireVerifier (allows tutor role)
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

const ALLOWED_ROLES = ["admin", "super_admin", "tutor"];

/**
 * requireAdmin — allows admin, super_admin, tutor
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
  const fromCookie = req.cookies?.admin_token || null;
  const token = fromHeader || fromCookie;

  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!ALLOWED_ROLES.includes(decoded.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

/**
 * requireSuperAdmin — only super_admin passes (e.g. user management)
 */
function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
  const fromCookie = req.cookies?.admin_token || null;
  const token = fromHeader || fromCookie;

  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

/**
 * requireVerifier — admin, super_admin, or tutor can verify questions
 */
function requireVerifier(req, res, next) {
  return requireAdmin(req, res, next); // Same allowed roles
}

module.exports = { requireAdmin, requireSuperAdmin, requireVerifier };