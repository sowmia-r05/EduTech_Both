/**
 * routes/childAuthRoutes.js  (v2 — SECRET SEPARATION + SANE TTL)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIXES
 *
 * FIX-1 — Signed with `JWT_SECRET || PARENT_JWT_SECRET`, i.e. the SAME key as
 *   admin tokens. Now signed via config/jwt.js signChild() → CHILD_JWT_SECRET,
 *   with `typ: "child"` stamped so it can never be replayed as another audience.
 *
 * FIX-2 — TTL was 30 DAYS ("30d"). A stolen child token was good for a month.
 *   TTL now comes from config/jwt.js (CHILD_JWT_TTL, default 1d).
 *
 * FIX-3 — Login is timing-safe against username enumeration: we run a bcrypt
 *   compare even when the username doesn't exist, so "no such user" and "wrong
 *   PIN" take the same time and return the same message.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ KNOWN REMAINING ISSUE (deliberate, tracked separately):
 *   We return `token` in the JSON body so the frontend can put it in
 *   localStorage. That makes it XSS-stealable and partly defeats the httpOnly
 *   cookie we also set. The correct end-state is cookie-only + a /me call to
 *   rehydrate (sessionRoutes already supports this). Removing the body token
 *   requires a frontend change, so it is NOT done here — see the migration note
 *   at the bottom of this file.
 */

const router = require("express").Router();
const bcrypt = require("bcrypt");
const Child = require("../models/child");

// ✅ Single source of truth for secrets, TTLs, and audience separation.
const { signChild, TTL } = require("../config/jwt");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");

// Cookie lifetime should track the token lifetime, not exceed it.
// TTL.child is a string like "1d" — convert to ms.
function ttlToMs(ttl) {
  const m = String(ttl || "1d").match(/^(\d+)\s*([smhd])$/);
  if (!m) return 24 * 60 * 60 * 1000; // safe default: 1 day
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}
const CHILD_COOKIE_MAX_AGE = ttlToMs(TTL.child);

// A throwaway hash used ONLY to burn the same CPU time as a real compare when
// the username doesn't exist. Prevents username enumeration by response timing.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

/**
 * POST /api/auth/child-login
 * Body:    { username, pin }
 * Returns: { ok, token, child: { childId, parentId, username, displayName, yearLevel, status } }
 */
router.post("/child-login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const pin = String(req.body?.pin || "").trim();

    if (!username) return res.status(400).json({ error: "Username is required" });
    if (!pin) return res.status(400).json({ error: "PIN is required" });

    const child = await Child.findOne({ username });

    // ✅ FIX-3: always do the work, always give the same answer.
    if (!child) {
      await bcrypt.compare(pin, DUMMY_HASH);
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    const valid = await child.comparePin(pin);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    // ✅ FIX-1 + FIX-2: signed with CHILD_JWT_SECRET, TTL from config.
    // signChild() stamps typ:"child" automatically.
    const token = signChild({
      role: "child",
      childId: child._id.toString(),
      parentId: child.parent_id.toString(),
      username: child.username,
      yearLevel: child.year_level,
    });

    // httpOnly cookie — the real credential.
    setAuthCookie(res, "child_token", token, CHILD_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      token, // ⚠️ see migration note below — remove once the frontend uses /me
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

/* ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION NOTE — removing the localStorage token (do this after launch)
 *
 * Today the frontend stores `token` in localStorage. Any XSS on the site can
 * read it and impersonate the child. The httpOnly cookie set above is immune to
 * that, but it's pointless while a copy sits in localStorage.
 *
 * To finish the job:
 *   1. Frontend: stop reading the token from the login response. Rely on the
 *      cookie (fetch with credentials: "include").
 *   2. Frontend: on mount, call GET /api/auth/me to rehydrate the session.
 *      sessionRoutes.js already returns exactly the `child` object above.
 *   3. Backend: delete the `token,` line from the response here.
 *   4. Add CSRF protection (SameSite=Lax already blocks the common cases;
 *      add a double-submit token for state-changing POSTs if you want belt+braces).
 * ═══════════════════════════════════════════════════════════════════════════ */