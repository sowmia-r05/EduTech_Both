/**
 * middleware/adminAuth.js
 * 
 * Admin authentication middleware.
 * Uses a separate ADMIN_SECRET env var — not part of parent/child auth.
 * 
 * Flow:
 *   POST /api/admin/login with { secret } → returns admin JWT
 *   All /api/admin/* routes use this middleware
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET; // Set this in .env — your admin password

/**
 * Login handler — validates the admin secret and returns a JWT
 */
function adminLogin(req, res) {
  const { secret } = req.body;

  if (!ADMIN_SECRET) {
    console.error("ADMIN_SECRET not set in environment");
    return res.status(500).json({ error: "Admin not configured" });
  }

  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Invalid admin secret" });
  }

  const token = jwt.sign(
    { role: "admin", iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({ token });
}

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
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

module.exports = { adminLogin, requireAdmin };
