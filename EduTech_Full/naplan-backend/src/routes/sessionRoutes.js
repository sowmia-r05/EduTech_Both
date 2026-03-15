const router = require("express").Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const Child = require("../models/child");
const Parent = require("../models/parent");

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user from their httpOnly cookie.
 * Used by AuthContext on mount to rehydrate session without localStorage.
 *
 * Reads whichever cookie is present:
 *   child_token  → returns { role: "child", ...child profile }
 *   parent_token → returns { role: "parent", ...parent profile }
 *   neither      → returns 401
 */
router.get("/me", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { role, parentId, childId, parent_id } = req.user;

    if (role === "child") {
      const child = await Child.findById(childId)
        .select(
          "display_name username year_level status parent_id entitled_quiz_ids",
        )
        .lean();
      if (!child) return res.status(404).json({ error: "Child not found" });

      // Re-sign a fresh token to return to the frontend
      const token = req.cookies?.child_token || null;

      return res.json({
        role: "child",
        token, // ← frontend stores in memory
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

      // Return the raw cookie token so frontend can store in memory
      const token = req.cookies?.parent_token || null;

      return res.json({
        role: "parent",
        token, // ← frontend stores in memory
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




router.get("/session", (req, res) => {
  const parentToken = req.cookies?.parent_token;
  const childToken = req.cookies?.child_token;

  const sessions = {};

  if (parentToken) {
    try {
      const decoded = jwt.verify(parentToken, JWT_SECRET);
      sessions.parent = {
        parentId: decoded.parentId,
        email: decoded.email,
        role: "parent",
      };
    } catch {
      /* expired or invalid — ignore */
    }
  }

  if (childToken) {
    try {
      const decoded = jwt.verify(childToken, JWT_SECRET);
      sessions.child = {
        childId: decoded.childId,
        parentId: decoded.parentId,
        username: decoded.username,
        yearLevel: decoded.yearLevel,
        role: "child",
      };
    } catch {
      /* expired or invalid — ignore */
    }
  }

  res.json(sessions);
});

module.exports = router;
