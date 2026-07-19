/**
 * middleware/adminAuth.js  (v3 — SECRET SEPARATION + REVOCATION + SHARED adminOnly)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX-1 — THE CRITICAL ONE. This file verified admin tokens with:
 *
 *     const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
 *
 *   ...the PARENT secret. Two consequences:
 *
 *   (a) BROKEN. adminRoutes.js now signs with signAdmin() → ADMIN_JWT_SECRET.
 *       Signed with one key, verified with another → every admin request 401s.
 *
 *   (b) INSECURE. Before that change, admin and parent tokens shared a secret,
 *       so anyone who obtained the parent secret could forge an ADMIN token.
 *       config/jwt.js exists specifically to make that impossible: the highest-
 *       privilege role must not be compromised by a leak of the lowest.
 *
 *   Now uses verifyAdmin() from config/jwt.js, which checks the signature
 *   against ADMIN_JWT_SECRET *and* rejects a typ mismatch.
 *
 * ✅ FIX-2 — TOKEN REVOCATION. A JWT is self-contained: once signed it is valid
 *   until it expires, no matter what happens to the account. Suspending an admin
 *   did nothing; a leaked token could not be killed. We now re-read the admin on
 *   every request and reject if:
 *       • the account no longer exists
 *       • the account is suspended or pending
 *       • token_version has moved on (password change, suspension, or an
 *         explicit revokeTokens() call)
 *
 *   COST: one indexed findById per authenticated admin request. Fine at admin
 *   volumes. Do NOT copy this to parent/child middleware without thinking about
 *   the read load — that path serves every student request.
 *
 * ✅ FIX-3 — the role is read from the DATABASE, not the token. A token minted
 *   while someone was an admin kept saying "admin" after they were demoted to
 *   tutor. The DB is the authority.
 *
 * ✅ FIX-4 — adminOnly now lives HERE and is exported. It used to be a private
 *   function inside adminRoutes.js, which meant adminAiFeedbackRoutes.js and
 *   adminCumulativeFeedbackRoutes.js had no way to use it — so every route in
 *   those files was reachable by a tutor token. One definition, one place.
 *
 * ⚠️ SAME BUG STILL LIVES IN routes/Tutorroutes.js — its requireTutor() is a
 *    third copy of this logic and still reads PARENT_JWT_SECRET. Fix it next, or
 *    better: delete it and import requireAdmin from here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { verifyAdmin } = require("../config/jwt");
const connectDB = require("../config/db");
const Admin = require("../models/admin");

// Only these statuses may hold a live session. Anything else — suspended,
// pending, or a value added to the enum later — is denied by default.
const ACTIVE_STATUSES = new Set(["active"]);

/**
 * Pull the token from the Authorization header, falling back to the cookie.
 *
 * The "null" / "undefined" guard is load-bearing: older frontend builds sent
 * `Bearer ${localStorage.getItem("admin_token")}`, and when that returns null it
 * becomes the literal STRING "null" — which is truthy, so the cookie fallback
 * was never reached and jwt.verify("null") threw a 401. The current frontend is
 * cookie-only, but the guard stays for any client still on an old bundle.
 */
function extractToken(req) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  const fromHeader =
    raw && raw !== "null" && raw !== "undefined" ? raw : null;

  const fromCookie = req.cookies?.admin_token || null;

  return fromHeader || fromCookie;
}

/**
 * requireAdmin — admits both "admin" and "tutor" roles.
 * Routes that must never be reachable by a tutor add the `adminOnly` guard
 * exported from this file.
 */
async function requireAdmin(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let decoded;
  try {
    // Signature checked against ADMIN_JWT_SECRET; typ mismatch rejected.
    decoded = verifyAdmin(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!decoded?.adminId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    await connectDB();

    // ✅ FIX-2 + FIX-3: the database is the authority on whether this session is
    // still valid and what this person is allowed to do. The token only tells us
    // WHO is claiming — never WHAT they may do, and never that they still may.
    const admin = await Admin.findById(decoded.adminId)
      .select("email name role status token_version")
      .lean();

    if (!admin) {
      return res.status(401).json({ error: "Account no longer exists" });
    }

    if (!ACTIVE_STATUSES.has(admin.status)) {
      // Suspension now takes effect on the NEXT REQUEST, not when the token
      // happens to expire.
      return res.status(403).json({
        error: "This account is not active.",
        status: admin.status,
      });
    }

    // ✅ Revocation check. adminRoutes /login stamps `ver` into the token.
    // Bumping token_version (password change, suspension, revokeTokens())
    // instantly invalidates every token this admin holds.
    const tokenVer = Number(decoded.ver ?? -1);
    const currentVer = Number(admin.token_version || 0);

    if (tokenVer !== currentVer) {
      return res.status(401).json({
        error: "Session revoked. Please log in again.",
      });
    }

    if (!["admin", "tutor"].includes(admin.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Role comes from the DB, not the token — a demoted admin loses admin
    // powers immediately rather than at token expiry.
    req.admin = {
      adminId: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status,
    };

    return next();
  } catch (err) {
    console.error("requireAdmin lookup failed:", err.message);
    return res.status(500).json({ error: "Authentication check failed" });
  }
}

/**
 * adminOnly — role gate that sits AFTER requireAdmin in a route chain.
 *
 * requireAdmin admits both "admin" and "tutor". Any route a tutor must never
 * reach gets this second guard. It reads req.admin.role, which requireAdmin
 * loaded from the DATABASE — not the token — so a demoted admin is blocked on
 * their very next request, not at token expiry.
 *
 * Usage:
 *   router.use(requireAdmin);
 *   router.use(adminOnly);                       // gate the whole router
 *   router.get("/quizzes", adminOnly, handler);  // gate one route
 *
 * NOTE: adminOnly is meaningless without requireAdmin ahead of it — req.admin
 * would be undefined and every request would 403.
 */
function adminOnly(req, res, next) {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { requireAdmin, adminOnly };