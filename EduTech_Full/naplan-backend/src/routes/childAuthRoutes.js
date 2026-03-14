const { setAuthCookie } = require("../utils/setCookies");
const CHILD_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Child = require("../models/child");

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
const CHILD_TOKEN_EXPIRY = "365d";

/**
 * POST /api/auth/child-login
 * Body: { username, pin }
 * Returns: { token, child: { childId, username, displayName, yearLevel, status } }
 */
router.post("/child-login", async (req, res) => {
  try {
    if (!JWT_SECRET) {
      console.error("JWT_SECRET / PARENT_JWT_SECRET is not set");
      return res
        .status(500)
        .json({ error: "Server auth configuration missing" });
    }

    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
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
      { expiresIn: CHILD_TOKEN_EXPIRY },
    );

    setAuthCookie(res, "child_token", token, CHILD_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
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

router.post("/child-logout", (req, res) => {
  clearAuthCookie(res, "child_token");
  res.json({ ok: true });
});

module.exports = router;
