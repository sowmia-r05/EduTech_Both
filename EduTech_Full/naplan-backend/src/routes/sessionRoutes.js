/**
 * routes/sessionRoutes.js  (v3 — req.sessions POPULATED + /session DIAGNOSTICS)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX A — /me?role= ALWAYS RETURNED 401
 *
 * BEFORE:
 *     const picked = req.sessions?.[want];
 *     if (!picked) return res.status(401).json({ error: `No ${want} session` });
 *
 *   `req.sessions` was never assigned by ANY middleware. verifyToken in
 *   middleware/auth.js sets req.user and nothing else. So `picked` was always
 *   undefined and every /me?role=parent or /me?role=child returned 401 — even
 *   with a valid cookie. Any frontend build that appends ?role= to the probe
 *   gets a 401 on every page refresh, clears its cached profile, and the route
 *   guard bounces the user to "/". That is a refresh-logout.
 *
 * AFTER: attachSessions middleware decodes BOTH cookies with their own secrets
 * and populates req.sessions = { parent, child } before the handler runs. The
 * ?role= hint now genuinely disambiguates.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX B — /session RETURNED A BARE {} FOR THREE DIFFERENT CAUSES
 *
 *   `{}` meant all of: no cookie arrived, cookie arrived but failed signature
 *   verification, and cookie genuinely expired. The frontend cannot tell a
 *   broken cookie from a real logout, so it treats both as "log the user out".
 *
 * AFTER: a `_diag` block reports which. REMOVE `_diag` once the cause is
 * identified — it leaks cookie names to the client.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v2 NOTE RETAINED — SECRET SEPARATION
 *
 * verifyParent() and verifyChild() from config/jwt.js each use their own secret
 * and reject `typ` mismatches, shared with middleware/auth.js so the two can
 * never drift apart.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const router = require("express").Router();

const { verifyParent, verifyChild } = require("../config/jwt");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const Child = require("../models/child");
const Parent = require("../models/parent");

/**
 * Soft decode helpers. Return decoded claims or null — never throw.
 * Each checks the signature against the correct audience's secret.
 */
function decodeParent(token) {
  if (!token) return null;
  try {
    return verifyParent(token);
  } catch {
    return null; // expired, wrong audience, or bad signature
  }
}

function decodeChild(token) {
  if (!token) return null;
  try {
    return verifyChild(token);
  } catch {
    return null;
  }
}

/**
 * Normalise decoded claims into the same shape verifyToken produces on
 * req.user, so downstream code can consume either interchangeably.
 */
function normaliseParent(claims) {
  if (!claims) return null;
  return {
    role: "parent",
    parentId: claims.parentId || claims.parent_id || null,
    parent_id: claims.parent_id || claims.parentId || null,
    email: claims.email || null,
  };
}

function normaliseChild(claims) {
  if (!claims) return null;
  return {
    role: "child",
    childId: claims.childId || claims.child_id || null,
    parentId: claims.parentId || claims.parent_id || null,
    username: claims.username || null,
    yearLevel: claims.yearLevel || null,
  };
}

/**
 * ✅ FIX A — the middleware that was missing.
 *
 * Populates req.sessions from BOTH cookies. Mounted on /me so the ?role= hint
 * has something to read. Never throws and never 401s — verifyToken already
 * handles the no-token case.
 */
function attachSessions(req, res, next) {
  req.sessions = {
    parent: normaliseParent(decodeParent(req.cookies?.parent_token)),
    child: normaliseChild(decodeChild(req.cookies?.child_token)),
  };
  next();
}

/**
 * GET /api/auth/me
 * Returns the authenticated user's PROFILE from their httpOnly cookie.
 * Used by AuthContext to enrich the active role with fields /session omits
 * (displayName, status, entitled_quiz_ids).
 * Does NOT return the token — the cookie is sent automatically via
 * credentials:"include", so the frontend never needs to hold it.
 *
 * Optional ?role=parent|child picks which cookie to read when both are live
 * (a parent who has quick-logged-in as their child). Without the hint,
 * verifyToken's default precedence applies.
 */
router.get("/me", verifyToken, requireAuth, attachSessions, async (req, res) => {
  try {
    await connectDB();

    // Honour an explicit role hint. Both cookies can be live on the same
    // device; without this, parent_token always won and the child's profile
    // could never be refreshed.
    const want = req.query.role;
    if (want === "child" || want === "parent") {
      const picked = req.sessions?.[want];
      if (!picked) {
        return res.status(401).json({ error: `No ${want} session` });
      }
      req.user = picked;
    }

    const { role, parentId, childId, parent_id } = req.user;

    if (role === "child") {
      const child = await Child.findById(childId)
        .select("display_name username year_level status parent_id entitled_quiz_ids")
        .lean();
      if (!child) return res.status(404).json({ error: "Child not found" });

      return res.json({
        role: "child",
        childId: child._id.toString(),
        parentId: child.parent_id.toString(),
        username: child.username,
        displayName: child.display_name,
        yearLevel: child.year_level,
        status: child.status,
        entitled_quiz_ids: child.entitled_quiz_ids || [],
      });
    }

    if (role === "parent") {
      const pid = parentId || parent_id;
      const parent = await Parent.findById(pid)
        .select("firstName lastName email name")
        .lean();
      if (!parent) return res.status(404).json({ error: "Parent not found" });

      return res.json({
        role: "parent",
        parentId: parent._id.toString(),
        firstName: parent.firstName || "",
        lastName: parent.lastName || "",
        email: parent.email || "",
        name:
          parent.name ||
          `${parent.firstName || ""} ${parent.lastName || ""}`.trim(),
      });
    }

    return res.status(403).json({ error: "Unknown role" });
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

/**
 * GET /api/auth/session
 * Soft probe: returns whichever sessions exist (parent, child, or both —
 * e.g. a parent viewing a child). No 401; missing/expired cookies are just
 * omitted.
 *
 * ✅ Each cookie is verified against ITS OWN secret, so a parent cookie can
 * never be reported as a child session (or vice versa).
 */
router.get("/session", (req, res) => {
  const sessions = {};

  const rawParent = req.cookies?.parent_token || null;
  const rawChild = req.cookies?.child_token || null;

  const parent = decodeParent(rawParent);
  if (parent) {
    sessions.parent = {
      parentId: parent.parentId || parent.parent_id,
      email: parent.email,
      role: "parent",
    };
  }

  const child = decodeChild(rawChild);
  if (child) {
    sessions.child = {
      childId: child.childId,
      parentId: child.parentId,
      username: child.username,
      yearLevel: child.yearLevel,
      role: "child",
    };
  }

  // ── ⚠️ TEMPORARY DIAGNOSTIC — DELETE THIS BLOCK ONCE DIAGNOSED ──────────
  // An empty {} is ambiguous: no cookie arrived, cookie arrived but failed
  // verification, or cookie expired. The frontend cannot distinguish a broken
  // cookie from a real logout, so it logs the user out for all three.
  //
  // Read this in the Network tab, then remove — it exposes cookie names.
  if (process.env.SESSION_DIAG === "true") {
    sessions._diag = {
      cookieNames: Object.keys(req.cookies || {}),
      parentCookiePresent: !!rawParent,
      childCookiePresent: !!rawChild,
      parentVerified: !!parent,
      childVerified: !!child,
      origin: req.headers.origin || null,
    };
  }
  // ────────────────────────────────────────────────────────────────────────

  res.json(sessions);
});

module.exports = router;