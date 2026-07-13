/**
 * routes/sessionRoutes.js  (v2 — SECRET SEPARATION)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX
 *
 * BEFORE:
 *     const JWT_SECRET = process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET;
 *     function decode(token) { return jwt.verify(token, JWT_SECRET); }
 *
 *   Two problems:
 *   (a) This precedence is the OPPOSITE of middleware/auth.js, which used
 *       JWT_SECRET || PARENT_JWT_SECRET. If both env vars were set and differed,
 *       /session and /me disagreed about which tokens were valid.
 *   (b) The SAME secret was used to decode both the parent cookie and the child
 *       cookie, so the two audiences were interchangeable.
 *
 * AFTER: config/jwt.js. verifyParent() and verifyChild() each use their own
 * secret and reject `typ` mismatches. One source of truth, shared with
 * middleware/auth.js — they cannot drift apart again.
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
 * GET /api/auth/me
 * Returns the authenticated user's PROFILE from their httpOnly cookie.
 * Used by AuthContext on mount to rehydrate session without localStorage.
 * Does NOT return the token — the cookie is sent automatically via
 * credentials:"include", so the frontend never needs to hold it.
 */
router.get("/me", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
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
 * ✅ Each cookie is now verified against ITS OWN secret, so a parent cookie can
 * never be reported as a child session (or vice versa).
 */
router.get("/session", (req, res) => {
  const sessions = {};

  const parent = decodeParent(req.cookies?.parent_token);
  if (parent) {
    sessions.parent = {
      parentId: parent.parentId || parent.parent_id,
      email: parent.email,
      role: "parent",
    };
  }

  const child = decodeChild(req.cookies?.child_token);
  if (child) {
    sessions.child = {
      childId: child.childId,
      parentId: child.parentId,
      username: child.username,
      yearLevel: child.yearLevel,
      role: "child",
    };
  }

  res.json(sessions);
});

module.exports = router;