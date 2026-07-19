const IS_PROD = process.env.NODE_ENV === "production";

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-SUBDOMAIN COOKIE CONFIG
//
// Frontend is naplan.kaisolutions.ai, API is naplanapi.kaisolutions.ai —
// different hosts. Two things were wrong for that topology:
//
//   1. NO `domain` → the cookie is host-only, scoped to naplanapi. The browser
//      will not attach it to a request initiated from naplan. Setting the
//      shared parent domain (.kaisolutions.ai) makes both subdomains see it.
//
//   2. sameSite: "lax" → lax only sends the cookie on same-site top-level
//      navigations, not on cross-origin XHR/fetch. "none" is required for XHR
//      across subdomains, and "none" is only accepted alongside Secure=true.
//
// This never surfaced before because the frontend was authenticating with a
// Bearer token from localStorage; the cookie was set but never actually used.
// Once the token leaves localStorage, cookie auth has to genuinely work.
//
// Dev stays on lax with no domain — localhost is same-origin and cannot use
// Secure cookies over http.
//
// The API server must also send:
//   Access-Control-Allow-Credentials: true
//   Access-Control-Allow-Origin: <exact origin>   ← "*" silently kills cookies
// ═══════════════════════════════════════════════════════════════════════════
const COOKIE_DOMAIN = IS_PROD
  ? process.env.COOKIE_DOMAIN || ".kaisolutions.ai"
  : undefined;

const DEFAULT_SAMESITE = IS_PROD ? "none" : "lax";

/**
 * Sets an auth token as an httpOnly cookie.
 * @param {Response} res     - Express response object
 * @param {string}   name    - Cookie name, e.g. "parent_token" or "rt"
 * @param {string}   token   - Token string (JWT for access; opaque for refresh)
 * @param {number}   maxAge  - Milliseconds until expiry
 * @param {object}   [opts]
 * @param {string}   [opts.path="/"]       - use "/api/auth" for refresh tokens
 * @param {string}   [opts.sameSite]       - defaults to "none" in prod, "lax" in dev
 */
function setAuthCookie(res, name, token, maxAge, { path = "/", sameSite = DEFAULT_SAMESITE } = {}) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite,
    maxAge,
    path,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

/**
 * Clears an auth cookie. MUST pass the same `path`/`sameSite` used when setting —
 * and the domain must match too, which is why it is applied here automatically.
 * Any attribute mismatch makes clearCookie silently no-op and logout won't
 * actually log out.
 */
function clearAuthCookie(res, name, { path = "/", sameSite = DEFAULT_SAMESITE } = {}) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite,
    path,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

module.exports = { setAuthCookie, clearAuthCookie };