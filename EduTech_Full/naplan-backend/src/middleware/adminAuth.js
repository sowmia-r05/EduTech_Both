/**
 * middleware/adminAuth.js  (v3 — SECRET SEPARATION + REVOCATION)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v2 fixed the SECRET (admin tokens no longer share a key with parent/child).
 * v3 adds REVOCATION — the second half of A15.
 *
 * THE PROBLEM v3 SOLVES:
 *   A JWT is a bearer token. Once issued, it is valid until it expires, full
 *   stop. There is no server-side "log this person out" — the server doesn't
 *   keep a list of live tokens. So today, if you fire an admin or a laptop is
 *   stolen, your ONLY option is to wait for expiry. With the old 365d TTL that
 *   meant a year. With 12h it means 12 hours. Better, but still not "now".
 *
 * THE FIX — TWO LAYERS:
 *
 *   Layer 1: PER-ADMIN token_version
 *     Every admin doc carries an integer `token_version` (default 0). It is
 *     stamped into the JWT as `ver` at sign time. On every request we compare
 *     the token's `ver` against the CURRENT value in the DB. Increment the DB
 *     value -> every token that admin holds is instantly dead.
 *     Use: fire someone, or an individual account is compromised.
 *
 *   Layer 2: GLOBAL ADMIN_TOKEN_EPOCH (env var, no DB, no deploy)
 *     A number in the environment, stamped into every token as `epoch`. Bump it
 *     in Render -> EVERY admin token everywhere dies on the next request.
 *     Use: "the admin secret may have leaked, kill everything, right now."
 *     This works even if MongoDB is down.
 *
 * THE COST:
 *   Layer 1 is one indexed findById() per admin request. Admin traffic is a
 *   handful of people, so this is free. We deliberately do NOT do this for
 *   parent/child tokens — that would be a DB hit on every quiz request, and on
 *   Atlas M0 that hurts. For parents/children, the short TTL (7d/1d) is the
 *   control. That is a considered trade-off, not an oversight.
 *
 * WHAT WE DID *NOT* BUILD, ON PURPOSE:
 *   Refresh tokens. They exist to make 5-15 minute access tokens tolerable.
 *   Our TTLs are 12h/7d/1d — nobody is annoyed by those. Refresh tokens would
 *   add rotation, reuse-detection and a token store for zero security gain.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── SETUP (3 steps) ───────────────────────────────────────────────────────
 *
 * 1. models/admin.js — add this field to the schema:
 *
 *        token_version: { type: Number, default: 0 },
 *
 * 2. routes/adminRoutes.js — stamp it at login. Replace the signAdmin() call
 *    that patch-jwt.js created with:
 *
 *        const token = signAdmin({
 *          adminId: admin._id.toString(),
 *          email:   admin.email,
 *          name:    admin.name,
 *          role:    admin.role,
 *          ver:     admin.token_version || 0,                        // ← ADD
 *          epoch:   Number(process.env.ADMIN_TOKEN_EPOCH || 0),      // ← ADD
 *        });
 *
 * 3. routes/adminRoutes.js — add a revoke endpoint (admin-only):
 *
 *        router.post("/admins/:adminId/revoke", adminOnly, async (req, res) => {
 *          await connectDB();
 *          const a = await Admin.findByIdAndUpdate(
 *            req.params.adminId,
 *            { $inc: { token_version: 1 } },
 *            { new: true }
 *          );
 *          if (!a) return res.status(404).json({ error: "Admin not found" });
 *          return res.json({ ok: true, revoked: a.email, token_version: a.token_version });
 *        });
 *
 *    Also call $inc on token_version wherever you suspend or delete an admin —
 *    otherwise a suspended admin keeps working until their token expires.
 *
 * ─── EMERGENCY KILL SWITCH ─────────────────────────────────────────────────
 *   Render -> Environment -> set or increment:  ADMIN_TOKEN_EPOCH=1
 *   Every admin token, everywhere, is dead on its next request. No deploy, no DB.
 * ───────────────────────────────────────────────────────────────────────────
 */

const { verifyAdmin } = require("../config/jwt");
const connectDB = require("../config/db");
const Admin = require("../models/admin");

// Bump this in the environment to invalidate EVERY admin token at once.
const CURRENT_EPOCH = Number(process.env.ADMIN_TOKEN_EPOCH || 0);

/**
 * requireAdmin — allows both "admin" and "tutor" roles.
 * For routes a tutor must NEVER reach, chain `adminOnly` after this.
 */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";

  const rawFromHeader = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;

  // "null" / "undefined" arrive as literal strings from an empty localStorage.
  const fromHeader =
    rawFromHeader && rawFromHeader !== "null" && rawFromHeader !== "undefined"
      ? rawFromHeader
      : null;

  const token = fromHeader || req.cookies?.admin_token || null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let decoded;
  try {
    // GATE 1 — signature, against ADMIN_JWT_SECRET (a different key from
    // parent/child). A parent token throws here; it never reaches gate 2.
    decoded = verifyAdmin(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // GATE 2 — role.
  if (!["admin", "tutor"].includes(decoded.role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  // GATE 3 — global kill switch. Cheap: no DB, works even if Mongo is down.
  if (Number(decoded.epoch || 0) !== CURRENT_EPOCH) {
    return res.status(401).json({
      error: "Your session was ended by an administrator. Please log in again.",
      code: "TOKEN_REVOKED",
    });
  }

  // GATE 4 — per-admin revocation + live account status.
  // One indexed lookup. Admin traffic is low, so the cost is negligible — and
  // it also catches an admin who was SUSPENDED after their token was issued,
  // which a pure-JWT check can never see.
  try {
    await connectDB();
    const admin = await Admin.findById(decoded.adminId)
      .select("token_version status role")
      .lean();

    if (!admin) {
      return res.status(401).json({ error: "Account no longer exists." });
    }

    if (Number(decoded.ver || 0) !== Number(admin.token_version || 0)) {
      return res.status(401).json({
        error: "Your session was revoked. Please log in again.",
        code: "TOKEN_REVOKED",
      });
    }

    if (admin.status === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended." });
    }
    if (admin.status === "pending") {
      return res.status(403).json({ error: "Your account is pending approval." });
    }

    // Trust the DB role over the token's — a demoted admin is demoted NOW,
    // not when their token expires.
    decoded.role = admin.role;
  } catch (err) {
    // Fail CLOSED. If we cannot confirm the admin is still valid, we do not
    // let them into the admin panel. An admin outage is survivable; an
    // unrevocable compromised admin session is not.
    console.error("[adminAuth] revocation check failed:", err.message);
    return res.status(503).json({
      error: "Unable to verify your session right now. Please try again.",
    });
  }

  req.admin = decoded;
  return next();
}

module.exports = { requireAdmin };