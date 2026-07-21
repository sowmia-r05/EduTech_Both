/**
 * routes/childAuthRoutes.js  (v3 — SECRET SEPARATION + LOGIN STAMPING)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 FIX (v2)
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ✅ NEW (v3) — LOGIN STAMPING (ENGAGE-1)
 *
 *   Records last_login_at + login_count on every successful child login.
 *
 *   WHY: without it, "the parent bought this and the child never opened it"
 *   and "the child logs in every day but never finishes a quiz" are the same
 *   row in the database — a Child with zero QuizAttempt documents. They are
 *   opposite failures needing opposite responses (onboarding fix vs. quiz-flow
 *   fix), and you cannot tell them apart retrospectively. The field has to
 *   exist before the data it would have captured.
 *
 *   THREE DELIBERATE CHOICES:
 *
 *   1. updateOne(), NOT child.save(). The Child schema has a pre("save") hook
 *      that bcrypt-hashes pin_hash. It is guarded by isModified(), so a save()
 *      here would probably be safe today — but "probably safe, guarded by a
 *      hook in another file" is exactly the kind of coupling that breaks
 *      silently later and locks a child out of their own account. updateOne()
 *      bypasses the hook entirely and is a single atomic field write.
 *
 *   2. Fire-and-forget with a catch. An analytics write must NEVER be able to
 *      fail a login. If Mongo hiccups on the stamp, the child still gets in and
 *      we log the miss. Do not await this in a way that can throw into the
 *      401/500 path.
 *
 *   3. Stamped AFTER the consent gate, not before. A login that is rejected for
 *      missing parental consent is not a login — counting it would inflate
 *      engagement with sessions that never reached the product, and would
 *      record activity against a profile that is not lawfully usable yet.
 *
 *   ⚠️ RETENTION: last_login_at / login_count are personal data about a minor
 *      and are in scope for the retention policy (Tracker row RETENTION) and
 *      the deletion endpoint (DATA-DEL). They are stored as a single
 *      most-recent timestamp, NOT an append-only session history — a full log
 *      of when a child was online is more data than this feature needs.
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
 * Returns: { ok, child: { childId, parentId, username, displayName, yearLevel, status } }
 *
 * The session is carried ONLY by the httpOnly `child_token` cookie. The token
 * is deliberately NOT returned in the response body — that was removed as part
 * of LS-TOKEN, because a body-returned token exists to be put in localStorage,
 * and any XSS then yields full account takeover. The frontend reads session
 * state from GET /api/auth/me instead.
 *
 * (The v2 header note claiming the token is "returned in the body as well" was
 * stale — the code had already stopped doing that. Corrected here so a future
 * edit doesn't "restore" it.)
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

    // APP 3/5 — a profile without recorded guardian consent is not usable,
    // even with correct credentials. Gate runs before any session is issued.
    if (child.parental_consent !== true) {
      return res.status(403).json({
        error:
          "This profile needs a parent or guardian to confirm consent before it can be used. Please ask them to sign in and complete it.",
        code: "CONSENT_REQUIRED",
      });
    }

    // ── ENGAGE-1: stamp the login ──────────────────────────────────────────
    // Non-blocking. A failure here must not cost the child their session.
    Child.updateOne(
      { _id: child._id },
      { $set: { last_login_at: new Date() }, $inc: { login_count: 1 } },
    ).catch((stampErr) => {
      console.error(
        "[child-login] last_login_at stamp failed:",
        stampErr && stampErr.message,
      );
    });

    // signChild() stamps typ:"child", signs with SECRETS.child, expires per
    // TTL.child. No secret is read from process.env here — config/jwt.js owns that.
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