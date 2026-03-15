/**
 * routes/childAuthRoutes.js
 *
 * FIX: POST /api/auth/child-login now returns `token` in the JSON body.
 *
 * WHAT WAS BROKEN:
 *   The route was only setting an httpOnly cookie (setAuthCookie) but was
 *   NOT returning the token in the response JSON. So every frontend call:
 *     const data = await res.json();
 *     loginChild(data.token, data.child);   ← data.token was ALWAYS undefined
 *
 *   loginChild(undefined, child) then:
 *     1. REMOVED the parent token from localStorage
 *     2. Did NOT store a child token (because token was undefined)
 *     → User was completely logged out immediately after child login
 *     → Refresh → no tokens in localStorage → logout on refresh
 *     → Navigate to result page → RequireAuth fails → landing page shown
 *
 * FIX: Add `token` to the JSON response. The httpOnly cookie is still set
 *      for security; the token in the body lets the frontend store it in
 *      localStorage so refresh works correctly.
 */

const { setAuthCookie } = require("../utils/setCookies");
const CHILD_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const router     = require("express").Router();
const jwt        = require("jsonwebtoken");
const Child      = require("../models/child");

const JWT_SECRET        = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
const CHILD_TOKEN_EXPIRY = "365d";

/**
 * POST /api/auth/child-login
 * Body: { username, pin }
 * Returns: { ok, token, child: { childId, username, displayName, yearLevel, status } }
 */
router.post("/child-login", async (req, res) => {
  try {
    if (!JWT_SECRET) {
      console.error("JWT_SECRET / PARENT_JWT_SECRET is not set");
      return res.status(500).json({ error: "Server auth configuration missing" });
    }

    const username = String(req.body.username || "").trim().toLowerCase();
    const pin      = String(req.body.pin      || "").trim();

    if (!username) return res.status(400).json({ error: "Username is required" });
    if (!pin)      return res.status(400).json({ error: "PIN is required" });

    const child = await Child.findOne({ username });
    if (!child) return res.status(401).json({ error: "Invalid username or PIN" });

    const valid = await child.comparePin(pin);
    if (!valid)  return res.status(401).json({ error: "Invalid username or PIN" });

    const token = jwt.sign(
      {
        role:     "child",
        childId:  child._id.toString(),
        parentId: child.parent_id.toString(),
        username: child.username,
        yearLevel: child.year_level,
      },
      JWT_SECRET,
      { expiresIn: CHILD_TOKEN_EXPIRY }
    );

    // Set httpOnly cookie (security layer)
    setAuthCookie(res, "child_token", token, CHILD_COOKIE_MAX_AGE);

    // ✅ FIX: Also return token in body so frontend can store it in localStorage
    return res.json({
      ok: true,
      token,                          // ← THIS WAS MISSING — caused all logout issues
      child: {
        childId:     child._id.toString(),
        parentId:    child.parent_id.toString(),
        username:    child.username,
        displayName: child.display_name,
        yearLevel:   child.year_level,
        status:      child.status,
      },
    });
  } catch (err) {
    console.error("Child login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/child-logout", (req, res) => {
  const { clearAuthCookie } = require("../utils/setCookies");
  clearAuthCookie(res, "child_token");
  res.json({ ok: true });
});

module.exports = router;
