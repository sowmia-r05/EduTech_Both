/**
 * routes/childAuthRoutes.js  (v2 — SECRET SEPARATION)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX
 *
 * BEFORE:
 *     const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;
 *     const token = jwt.sign({ role: "child", ... }, JWT_SECRET, { expiresIn: "30d" });
 *
 *   Three problems:
 *   (a) CHILD tokens were signed with the PARENT (or legacy) secret. The moment
 *       CHILD_JWT_SECRET differs from PARENT_JWT_SECRET, sessionRoutes'
 *       verifyChild() rejects every child token → all children locked out.
 *   (b) The payload had no `typ` claim, so config/jwt.js verifyChild() could not
 *       reject a cross-audience token.
 *   (c) expiresIn "30d" contradicted the 7d cookie max-age AND TTL.child ("1d").
 *       Three different opinions about how long a child session lasts.
 *
 * AFTER: signChild() from config/jwt.js. It uses SECRETS.child, stamps
 * typ:"child", and takes its lifetime from TTL.child — one source of truth.
 * The cookie max-age is derived from the same TTL so they cannot drift.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const router = require("express").Router();
const Child = require("../models/child");

const { signChild, TTL } = require("../config/jwt");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");

// Keep the cookie alive exactly as long as the token it carries.
// TTL.child is a string like "1d" / "7d" / "12h" — convert it to ms.
function ttlToMs(ttl) {
  const m = String(ttl).match(/^(\d+)([smhd])$/);
  if (!m) return 24 * 60 * 60 * 1000; // safe default: 1 day
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}

const CHILD_COOKIE_MAX_AGE = ttlToMs(TTL.child);

/**
 * POST /api/auth/child-login
 * Body: { username, pin }
 * Returns: { ok, token, child: { childId, username, displayName, yearLevel, status } }
 *
 * NOTE: `token` is returned in the body as well as set as an httpOnly cookie.
 * Removing it from the body previously logged children out on refresh, because
 * the frontend cleared the parent token and had no child token to store.
 */
router.post("/child-login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!username) return res.status(400).json({ error: "Username is required" });
    if (!pin) return res.status(400).json({ error: "PIN is required" });

    const child = await Child.findOne({ username });
    // Same generic message for "no such user" and "wrong PIN" — do not leak
    // which usernames exist.
    if (!child) return res.status(401).json({ error: "Invalid username or PIN" });

    const valid = await child.comparePin(pin);
    if (!valid) return res.status(401).json({ error: "Invalid username or PIN" });

    // signChild() stamps typ:"child", signs with SECRETS.child, expires per TTL.child.
    // No secret is read from process.env here — config/jwt.js owns that.
    const token = signChild({
      role: "child",
      childId: child._id.toString(),
      parentId: child.parent_id.toString(),
      username: child.username,
      yearLevel: child.year_level,
    });

    setAuthCookie(res, "child_token", token, CHILD_COOKIE_MAX_AGE);

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

router.post("/child-logout", (req, res) => {
  clearAuthCookie(res, "child_token");
  res.json({ ok: true });
});

module.exports = router;