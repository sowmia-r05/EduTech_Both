// src/config/jwt.js
//
// SINGLE SOURCE OF TRUTH for JWT secrets and token signing/verifying.
//
// Why this module exists:
//   - Secrets were read ad-hoc via process.env.* across many auth files, so a
//     typo or a missing var failed silently at request time (401s) instead of
//     loudly at boot.
//   - Admin tokens must NOT share a secret with parent/child tokens. If the
//     user-token secret ever leaks or is weak, the highest-privilege role must
//     remain uncompromised. This module enforces that separation.
//
// Env vars:
//   ADMIN_JWT_SECRET   (required)  — admin tokens. MUST be distinct.
//   PARENT_JWT_SECRET  (optional)  — parent tokens; falls back to JWT_SECRET.
//   CHILD_JWT_SECRET   (optional)  — child tokens;  falls back to JWT_SECRET.
//   JWT_SECRET         (optional)  — legacy shared secret for parent/child so
//                                    existing user sessions survive the rollout.
//   *_JWT_TTL          (optional)  — token lifetimes (default below).
//
// Each secret must be at least 32 characters.
//
// ═══════════════════════════════════════════════════════════════════════════
// TTL CHANGE (2026-08-05)
//
//   child: "1d"  → "365d"   admin: "12h" → "24h"   parent: "7d" (unchanged)
//
//   Cookie max-age is derived from these values by ttlToMs() in the auth route
//   files, so the cookie and the token cannot drift apart. Both new values
//   match that parser's ^(\d+)\s*([smhd])$ pattern.
//
//   ⚠️ SHIPPING THIS LOGS EVERY CHILD OUT ONCE. Existing child tokens were
//      signed with a 1d expiry; they are not re-stamped retroactively. Deploy
//      at a quiet hour.
//
//   ⚠️ CHILD TOKENS NOW LIVE FOR A YEAR WITH NO KILL SWITCH. The Admin model
//      has token_version, so requireAdmin can revoke an admin session instantly
//      (see models/admin.js). The Child model has no equivalent, so a stolen
//      child token stays valid for the full 365 days and the only remedy is
//      rotating CHILD_JWT_SECRET — which logs out every child on the platform.
//      Given the platform serves minors, adding token_version to the Child
//      model is the correct follow-up. Note the trade-off called out in
//      models/admin.js: it costs one DB read per authenticated request, and the
//      child path serves every quiz request, so measure before shipping it.
// ═══════════════════════════════════════════════════════════════════════════

const jwt = require("jsonwebtoken");

const MIN_LEN = 32;

function validate(name, value, { required }) {
  if (!value) {
    if (required) throw new Error(`[jwt config] ${name} is not set`);
    return null;
  }
  if (value.length < MIN_LEN) {
    throw new Error(`[jwt config] ${name} must be at least ${MIN_LEN} characters`);
  }
  return value;
}

// Legacy shared secret — lets parent/child keep working during migration.
const SHARED = validate("JWT_SECRET", process.env.JWT_SECRET, { required: false });

const SECRETS = {
  parent: validate("PARENT_JWT_SECRET", process.env.PARENT_JWT_SECRET, { required: false }) || SHARED,
  child:  validate("CHILD_JWT_SECRET",  process.env.CHILD_JWT_SECRET,  { required: false }) || SHARED,
  admin:  validate("ADMIN_JWT_SECRET",  process.env.ADMIN_JWT_SECRET,  { required: true }),
};

// Fail fast if parent/child couldn't resolve to any secret.
if (!SECRETS.parent) throw new Error("[jwt config] no parent secret (set PARENT_JWT_SECRET or JWT_SECRET)");
if (!SECRETS.child)  throw new Error("[jwt config] no child secret (set CHILD_JWT_SECRET or JWT_SECRET)");

// THE KEY GUARANTEE: admin secret must differ from parent AND child.
if (SECRETS.admin === SECRETS.parent || SECRETS.admin === SECRETS.child) {
  throw new Error("[jwt config] ADMIN_JWT_SECRET must be different from the parent/child secret");
}

const TTL = {
  parent: process.env.PARENT_JWT_TTL || "7d",
  child:  process.env.CHILD_JWT_TTL  || "365d",
  admin:  process.env.ADMIN_JWT_TTL  || "24h",
};

function secretFor(audience) {
  const s = SECRETS[audience];
  if (!s) throw new Error(`[jwt config] unknown token audience: ${audience}`);
  return s;
}

/**
 * Sign a token for a given audience ("parent" | "child" | "admin").
 * Always stamps `typ` so verify can reject cross-audience tokens.
 */
function signToken(audience, payload, opts = {}) {
  return jwt.sign(
    { ...payload, typ: audience },
    secretFor(audience),
    { expiresIn: TTL[audience], ...opts }
  );
}

/**
 * Verify a token against a specific audience's secret. Because each audience
 * uses a different secret, a parent token simply won't verify as an admin token
 * — but we also reject on a `typ` mismatch as defense-in-depth.
 */
function verifyToken(audience, token) {
  const decoded = jwt.verify(token, secretFor(audience));
  if (decoded.typ && decoded.typ !== audience) {
    const err = new Error("Token audience mismatch");
    err.name = "JsonWebTokenError";
    throw err;
  }
  return decoded;
}

module.exports = {
  SECRETS,
  TTL,
  signToken,
  verifyToken,
  // Convenience wrappers
  signParent: (p, o) => signToken("parent", p, o),
  signChild:  (p, o) => signToken("child",  p, o),
  signAdmin:  (p, o) => signToken("admin",  p, o),
  verifyParent: (t) => verifyToken("parent", t),
  verifyChild:  (t) => verifyToken("child",  t),
  verifyAdmin:  (t) => verifyToken("admin",  t),
};