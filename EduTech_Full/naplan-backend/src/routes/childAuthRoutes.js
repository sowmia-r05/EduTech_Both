const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Child = require("../models/child");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
const CHILD_TOKEN_EXPIRY = "4h";

/**
 * POST /api/auth/child-login
 * Body: { username, pin }
 * Returns: { token, child: { childId, username, displayName, yearLevel, status } }
 */
router.post("/child-login", async (req, res) => {
  try {
    if (!JWT_SECRET) {
      console.error("JWT_SECRET / PARENT_JWT_SECRET is not set");
      return res.status(500).json({ error: "Server auth configuration missing" });
    }

    const username = String(req.body.username || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!pin) {
      return res.status(400).json({ error: "PIN is required" });
    }

    const child = await Child.findOne({ username });
    if (!child) {
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    const valid = await child.comparePin(pin);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    const token = jwt.sign(
      {
        role: "child",
        childId: child._id.toString(),
        parentId: child.parent_id.toString(),
        username: child.username,
        yearLevel: child.year_level,
      },
      JWT_SECRET,
      { expiresIn: CHILD_TOKEN_EXPIRY }
    );

    return res.json({
      ok: true,
      token,
      child: {
        childId: child._id.toString(),
        parentId: child.parent_id.toString(),
        username: child.username,
        displayName: child.display_name,
        yearLevel: child.year_level,
        status: child.status,
      },
    });
  } catch (err) {
    console.error("Child login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
