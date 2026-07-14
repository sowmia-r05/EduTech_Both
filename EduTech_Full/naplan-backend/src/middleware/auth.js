// src/middleware/auth.js
//
// ═══════════════════════════════════════════════════════════════════════════
// FIXED: secret precedence + child-token verification.
//
// BEFORE (broken):
//   const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
//
//   1. Precedence was the OPPOSITE of the signing side (parentAuthRoutes.js,
//      googleAuthRoutes.js and config/jwt.js all prefer PARENT_JWT_SECRET).
//      If both env vars were set to different values, tokens were signed with
//      one secret and verified with the other → blanket 401s.
//   2. It verified the `child_token` cookie with the PARENT secret. As soon as
//      CHILD_JWT_SECRET differed from the parent secret, every child login
//      broke.
//
// AFTER: this file reads NO env vars. It imports the resolved secrets from
// config/jwt.js, which is the single source of truth and which fails loudly at
// BOOT if anything is misconfigured (instead of silently at request time).
//
// ⚠️ Because config/jwt.js requires ADMIN_JWT_SECRET, the server will refuse to
//    boot until ADMIN_JWT_SECRET is set (and is different from parent/child).
//    That is intentional. Set it in Render before deploying this.
// ═══════════════════════════════════════════════════════════════════════════

const jwt = require("jsonwebtoken");
const { SECRETS } = require("../config/jwt");

// Which secrets a user-facing token may legitimately be signed with.
// Admin is deliberately EXCLUDED — an admin token must never authenticate a
// parent/child route. Its secret is distinct, so it would fail anyway; this is
// defence in depth.
//
// If parent and child resolve to the SAME secret (i.e. both still falling back
// to legacy JWT_SECRET), one verify attempt covers both — no wasted work.
const USER_AUDIENCES =
  SECRETS.parent === SECRETS.child ? ["parent"] : ["parent", "child"];

/**
 * Verify a token against the parent secret, then the child secret.
 *
 * A TokenExpiredError means the SIGNATURE was valid and only the expiry failed
 * — so we track it and report "expired" rather than a misleading "invalid".
 */
function verifyUserToken(token) {
  let sawExpired = false;

  for (const audience of USER_AUDIENCES) {
    try {
      return jwt.verify(token, SECRETS[audience]);
    } catch (err) {
      if (err.name === "TokenExpiredError") sawExpired = true;
      // otherwise: wrong secret for this audience — try the next one
    }
  }

  const error = new Error(sawExpired ? "Token expired" : "Invalid token");
  error.code = sawExpired ? "EXPIRED" : "INVALID";
  throw error;
}

/**
 * Normalize the several historical token shapes into one consistent req.user.
 *
 *   Legacy parent : { typ: "parent", parent_id, email }
 *   New parent    : { typ: "parent", role: "parent", parentId, parent_id, email }
 *   Child         : { typ: "child",  role: "child",  childId, parentId, username }
 */
function normalize(decoded) {
  // Derive role from typ when role is absent (legacy tokens).
  if (!decoded.role && decoded.typ) {
    decoded.role = decoded.typ;
  }

  if (decoded.role === "parent") {
    decoded.parentId = decoded.parentId || decoded.parent_id || null;
    decoded.parent_id = decoded.parent_id || decoded.parentId || null;
  }

  if (decoded.role === "child") {
    decoded.childId = decoded.childId || decoded.child_id || null;
    decoded.parentId = decoded.parentId || decoded.parent_id || null;
  }

  return decoded;
}

/**
 * Verify JWT from `Authorization: Bearer <token>` or from the
 * parent_token / child_token httpOnly cookie.
 * Attaches the normalized payload to req.user.
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const fromCookie =
    req.cookies?.parent_token || req.cookies?.child_token || null;

  const token = fromHeader || fromCookie;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let decoded;
  try {
    decoded = verifyUserToken(token);
  } catch (err) {
    if (err.code === "EXPIRED") {
      return res
        .status(401)
        .json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token" });
  }

  // An admin token must never reach a parent/child route.
  if (decoded.typ === "admin" || decoded.role === "admin") {
    return res.status(403).json({ error: "Invalid token audience" });
  }

  req.user = normalize(decoded);
  next();
}

/** Only allow parent role */
function requireParent(req, res, next) {
  if (req.user?.role !== "parent") {
    return res.status(403).json({ error: "Parent access required" });
  }
  next();
}

/** Only allow child role */
function requireChild(req, res, next) {
  if (req.user?.role !== "child") {
    return res.status(403).json({ error: "Child access required" });
  }
  next();
}

/** Allow either parent or child */
function requireAuth(req, res, next) {
  const role = req.user?.role;
  if (role !== "parent" && role !== "child") {
    return res.status(403).json({ error: "Authentication required" });
  }
  next();
}

module.exports = { verifyToken, requireParent, requireChild, requireAuth };