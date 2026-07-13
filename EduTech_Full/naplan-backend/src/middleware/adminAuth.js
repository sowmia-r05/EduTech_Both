/**
 * middleware/adminAuth.js  (v2 — SECRET SEPARATION)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SECURITY FIX
 *
 * BEFORE:
 *     const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
 *     const decoded = jwt.verify(token, JWT_SECRET);
 *     if (!["admin","tutor"].includes(decoded.role)) ...
 *
 *   Admin tokens were signed and verified with the SAME secret as parent and
 *   child tokens. The only thing separating a parent from an admin was a
 *   `role` string claim inside the payload. That means:
 *     • If the parent/child secret ever leaks (it was in screenshots), the
 *       attacker can mint an admin token — full access to every child's data.
 *     • Any bug anywhere that lets a `role` claim be influenced becomes a
 *       privilege escalation, instead of just a bug.
 *
 * AFTER:
 *   Admin tokens use ADMIN_JWT_SECRET, a DIFFERENT key. A parent token now
 *   fails jwt.verify() outright — it cannot even be decoded here, let alone
 *   pass a role check. config/jwt.js additionally stamps `typ: "admin"` and
 *   rejects audience mismatches as defense-in-depth.
 *
 *   The role check is KEPT. Two independent gates, not one.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (Retained from v1) Guards against the literal strings "null" / "undefined"
 * arriving in the Authorization header when localStorage is empty, so the
 * cookie fallback is actually reached.
 */

// ✅ Single source of truth for secrets, TTLs, and audience separation.
const { verifyAdmin } = require("../config/jwt");

/**
 * requireAdmin — allows both "admin" and "tutor" roles.
 *
 * NOTE: this admits tutors. For routes a tutor must NEVER reach, chain the
 * `adminOnly` guard in adminRoutes.js after this one.
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";

  const rawFromHeader = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;

  // Treat "null" / "undefined" / "" as no token, so the cookie is a real fallback.
  const fromHeader =
    rawFromHeader && rawFromHeader !== "null" && rawFromHeader !== "undefined"
      ? rawFromHeader
      : null;

  const fromCookie = req.cookies?.admin_token || null;

  const token = fromHeader || fromCookie;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    // ✅ Verifies the signature against ADMIN_JWT_SECRET *and* checks typ==="admin".
    // A parent or child token throws here — it never reaches the role check.
    const decoded = verifyAdmin(token);

    // Gate 2: role. Defense in depth — the secret already excluded non-admins.
    if (!["admin", "tutor"].includes(decoded.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    req.admin = decoded;
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "Session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin };