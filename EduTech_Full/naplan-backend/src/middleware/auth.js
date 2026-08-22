// src/middleware/auth.js
//
// ═══════════════════════════════════════════════════════════════════════════
// FIXED: secret precedence + child-token verification.
//
// This file reads NO env vars. It imports the resolved secrets from
// config/jwt.js, which is the single source of truth and which fails loudly at
// BOOT if anything is misconfigured (instead of silently at request time).
//
// ⚠️ Because config/jwt.js requires ADMIN_JWT_SECRET, the server will refuse to
//    boot until ADMIN_JWT_SECRET is set (and is different from parent/child).
//
// ═══════════════════════════════════════════════════════════════════════════
// NEW: MULTI-SESSION RESOLUTION (fixes the child-page auto-logout)
//
// BEFORE:
//   const fromCookie = req.cookies?.parent_token || req.cookies?.child_token;
//
//   Both cookies are set on `.kaisolutions.ai` at path "/". On the NORMAL
//   device — parent signs in, creates a child, the child then signs in — both
//   cookies are live simultaneously. The `||` meant parent_token ALWAYS won:
//     • every child-only route answered 403 "Child access required"
//     • GET /api/auth/me could only ever report role:"parent", so the child's
//       profile never refreshed and the child dashboard bounced to /child-login
//
// AFTER: every credential present is verified, and BOTH resolved sessions are
// attached as req.sessions = { parent, child }. requireParent/requireChild pick
// the correct one instead of hoping req.user happens to hold it.
// ═══════════════════════════════════════════════════════════════════════════
//
// 👈 CHANGED (diagnostics): verifyToken and requireAuth previously BOTH
// answered with the literal string "Authentication required". They mean
// opposite things:
//
//   • verifyToken  → the browser sent NO credential at all (401). Cause is
//     usually a missing/expired cookie, or a cookie the browser refuses to
//     send cross-site (SameSite must be "None" + Secure for naplan.* →
//     naplanapi.*).
//   • requireAuth  → a credential WAS sent and verified, but its role is
//     neither "parent" nor "child" (403). Cause is a malformed or legacy
//     token whose typ/role claim is missing.
//
// Sharing one message made these indistinguishable from the client, so a 401
// and a 403 looked identical on the results page. Each branch now names
// itself, and every rejection carries a `code` the frontend can log.

const jwt = require("jsonwebtoken");
const { SECRETS } = require("../config/jwt");

// Which secrets a user-facing token may legitimately be signed with.
// Admin is deliberately EXCLUDED — an admin token must never authenticate a
// parent/child route. Its secret is distinct, so it would fail anyway; this is
// defence in depth.
//
// If parent and child resolve to the SAME secret (both still falling back to
// legacy JWT_SECRET), one verify attempt covers both — the `typ` claim, not the
// secret, is what separates the audiences in that case.
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
 * Normalize the several historical token shapes into one consistent shape.
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
 * Verify JWT from `Authorization: Bearer <token>` and/or the parent_token /
 * child_token httpOnly cookies.
 *
 * Attaches:
 *   req.sessions = { parent: <claims|null>, child: <claims|null> }
 *   req.user     = the child session if present, else the parent session
 *                  (requireParent/requireChild override this correctly)
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  // Old bundles sent the literal string "null" when localStorage was empty.
  const fromHeader = raw && raw !== "null" && raw !== "undefined" ? raw : null;

  const candidates = [
    fromHeader,
    req.cookies?.parent_token || null,
    req.cookies?.child_token || null,
  ].filter(Boolean);

  if (candidates.length === 0) {
    // 👈 CHANGED — distinct message + code + which sources were checked.
    // Seeing this means the browser sent NOTHING: no Authorization header and
    // neither cookie. On a cross-site request (naplan.* calling naplanapi.*)
    // the usual cause is the cookie's SameSite attribute not being "None",
    // so the browser silently withholds it.
    req.log?.warn?.(
      {
        hasAuthHeader: !!fromHeader,
        hasParentCookie: !!req.cookies?.parent_token,
        hasChildCookie: !!req.cookies?.child_token,
        cookieNames: Object.keys(req.cookies || {}),
        origin: req.headers.origin || null,
        path: req.originalUrl,
      },
      "[auth] no credentials presented",
    );

    return res.status(401).json({
      error: "No credentials provided. Please log in again.",
      code: "NO_CREDENTIALS",
    });
  }

  const valid = [];
  let sawExpired = false;

  for (const token of candidates) {
    let decoded;
    try {
      decoded = verifyUserToken(token);
    } catch (err) {
      if (err.code === "EXPIRED") sawExpired = true;
      continue; // a dead cookie must not kill a live one
    }

    // An admin token must never reach a parent/child route.
    if (decoded.typ === "admin" || decoded.role === "admin") {
      return res.status(403).json({
        error: "Invalid token audience",
        code: "ADMIN_TOKEN_ON_USER_ROUTE",
      });
    }

    valid.push(normalize(decoded));
  }

  if (valid.length === 0) {
    // 👈 CHANGED — added codes so expired vs malformed is distinguishable
    return res.status(401).json({
      error: sawExpired
        ? "Token expired. Please log in again."
        : "Invalid token",
      code: sawExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
    });
  }

  req.sessions = {
    parent: valid.find((d) => d.role === "parent") || null,
    child: valid.find((d) => d.role === "child") || null,
  };

  // Default when a route doesn't state a preference. Child wins because a live
  // child cookie means a child is the one actually driving the browser.
  req.user = req.sessions.child || req.sessions.parent;

  next();
}

/** Only allow parent role */
function requireParent(req, res, next) {
  const session = req.sessions?.parent;
  if (!session) {
    return res.status(403).json({
      error: "Parent access required",
      code: "PARENT_REQUIRED",
    });
  }
  req.user = session; // pin req.user to the parent for this route
  next();
}

/** Only allow child role */
function requireChild(req, res, next) {
  const session = req.sessions?.child;
  if (!session) {
    return res.status(403).json({
      error: "Child access required",
      code: "CHILD_REQUIRED",
    });
  }
  req.user = session; // pin req.user to the child for this route
  next();
}

/** Allow either parent or child */
function requireAuth(req, res, next) {
  const role = req.user?.role;
  if (role !== "parent" && role !== "child") {
    // 👈 CHANGED — no longer says "Authentication required", which was
    // identical to verifyToken's 401 and made the two indistinguishable.
    // Reaching here means a token WAS verified but carries no usable role,
    // i.e. a legacy token missing both `role` and `typ`.
    req.log?.warn?.(
      {
        resolvedRole: role || null,
        hasParentSession: !!req.sessions?.parent,
        hasChildSession: !!req.sessions?.child,
        path: req.originalUrl,
      },
      "[auth] token verified but role unusable",
    );

    return res.status(403).json({
      error: "Session role not recognised. Please log in again.",
      code: "ROLE_UNRECOGNISED",
      resolvedRole: role || null,
    });
  }
  next();
}

module.exports = { verifyToken, requireParent, requireChild, requireAuth };