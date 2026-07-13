/**
 * middleware/auth.js  (v2 — SECRET SEPARATION + CONSISTENT PRECEDENCE)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIXES
 *
 * FIX-1 — SECRET PRECEDENCE WAS INCONSISTENT ACROSS FILES.
 *   Three files disagreed about which env var wins:
 *     middleware/auth.js   →  JWT_SECRET || PARENT_JWT_SECRET
 *     routes/sessionRoutes →  PARENT_JWT_SECRET || JWT_SECRET   ← opposite!
 *     routes/googleAuth    →  PARENT_JWT_SECRET only
 *   If both env vars are set and differ, Google sign-in issues a token that
 *   THIS middleware cannot verify. Silent, intermittent 401s.
 *   NOW: every file imports config/jwt.js. One place, one answer.
 *
 * FIX-2 — ADMIN TOKENS NO LONGER SHARE THIS SECRET.
 *   config/jwt.js enforces ADMIN_JWT_SECRET !== parent/child secret, so an
 *   admin token can never be verified here (and vice versa).
 *
 * FIX-3 — AUDIENCE CHECK.
 *   Tokens are verified against the audience implied by the cookie they arrived
 *   in. A child_token cookie is verified as a child; a parent_token cookie as a
 *   parent. For Bearer headers (which carry no audience hint) we try child, then
 *   parent — each against its OWN secret, and config/jwt rejects `typ` mismatches.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Token shapes normalized onto req.user:
 *   Legacy parent:  { typ: "parent", parent_id, email }
 *   New parent:     { typ: "parent", role: "parent", parentId, email }
 *   Child:          { typ: "child",  role: "child",  childId, parentId, username, yearLevel }
 */

const { verifyParent, verifyChild } = require("../config/jwt");

/**
 * Normalize legacy parent tokens (typ: "parent", parent_id) to the new shape
 * so downstream code can rely on req.user.role / req.user.parentId.
 */
function normalize(decoded) {
  if (decoded.typ === "parent" && !decoded.role) {
    decoded.role = "parent";
    decoded.parentId = decoded.parent_id || decoded.parentId;
  }
  if (decoded.typ === "child" && !decoded.role) {
    decoded.role = "child";
  }
  return decoded;
}

/**
 * Verify a JWT from either the Authorization header or an auth cookie.
 * Attaches the decoded, normalized payload to req.user.
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const rawHeaderToken = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;

  // Guard against the literal strings "null" / "undefined" from empty localStorage.
  const headerToken =
    rawHeaderToken && rawHeaderToken !== "null" && rawHeaderToken !== "undefined"
      ? rawHeaderToken
      : null;

  const parentCookie = req.cookies?.parent_token || null;
  const childCookie = req.cookies?.child_token || null;

  // Build an ordered list of [audience, token] candidates.
  // Cookies carry an audience hint in their NAME — use it.
  const candidates = [];
  if (headerToken) {
    // A Bearer token gives no audience hint. Try child first (the common case
    // for quiz-taking), then parent. Each is checked against its OWN secret,
    // so a wrong guess simply fails to verify — it cannot cross over.
    candidates.push(["child", headerToken], ["parent", headerToken]);
  }
  if (childCookie) candidates.push(["child", childCookie]);
  if (parentCookie) candidates.push(["parent", parentCookie]);

  if (candidates.length === 0) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let sawExpired = false;

  for (const [audience, token] of candidates) {
    try {
      const decoded =
        audience === "child" ? verifyChild(token) : verifyParent(token);
      req.user = normalize(decoded);
      return next();
    } catch (err) {
      // Remember an expiry so we can give a useful message instead of a
      // generic "invalid token" when the only problem was staleness.
      if (err.name === "TokenExpiredError") sawExpired = true;
      // Otherwise: wrong audience or bad signature — try the next candidate.
    }
  }

  if (sawExpired) {
    return res
      .status(401)
      .json({ error: "Token expired. Please log in again." });
  }
  return res.status(401).json({ error: "Invalid token" });
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

/** Allow either parent or child (never admin — different secret entirely) */
function requireAuth(req, res, next) {
  const role = req.user?.role;
  if (role !== "parent" && role !== "child") {
    return res.status(403).json({ error: "Authentication required" });
  }
  next();
}

module.exports = { verifyToken, requireParent, requireChild, requireAuth };