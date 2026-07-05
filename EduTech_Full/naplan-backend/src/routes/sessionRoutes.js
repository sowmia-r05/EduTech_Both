const router = require("express").Router();
const jwt = require("jsonwebtoken");

// ⚠️ Precedence must match token SIGNING and your auth middleware.
// Your env validation treats PARENT_JWT_SECRET as primary — keep that order
// everywhere (ideally export this from one shared config/jwt.js and import it).
const JWT_SECRET = process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET;

const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const Child = require("../models/child");
const Parent = require("../models/parent");

/**
 * Single place the cookie-decode rules live, so /session can't drift from
 * the verifyToken middleware. Returns decoded claims or null (never throws).
 * When you add revocation, the ver/tokenVersion check belongs in verifyToken
 * (which /me uses); short access-token TTL is what protects /session.
 */
function decode(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null; // expired or invalid
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
 * omitted. Shares decode() with /me so verification rules stay in one place.
 */
router.get("/session", (req, res) => {
  const sessions = {};

  const parent = decode(req.cookies?.parent_token);
  if (parent) {
    sessions.parent = {
      parentId: parent.parentId,
      email: parent.email,
      role: "parent",
    };
  }

  const child = decode(req.cookies?.child_token);
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