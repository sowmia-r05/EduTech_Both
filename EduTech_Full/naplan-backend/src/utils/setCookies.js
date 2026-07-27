/**
 * utils/setCookies.js
 *
 * Cross-subdomain cookie helper.
 * Frontend: naplan.kaisolutions.ai   API: naplanapi.kaisolutions.ai
 *
 * Production requires:
 *   domain   = .kaisolutions.ai  → without it the cookie is host-only and the
 *                                  browser won't attach it to requests from
 *                                  the frontend subdomain
 *   sameSite = "none"            → required for cross-origin XHR
 *   secure   = true              → mandatory whenever sameSite is "none"
 *
 * IS_PROD no longer depends on NODE_ENV alone. If NODE_ENV is unset on the
 * host, the old code silently fell back to dev cookie settings and every
 * authenticated request 401'd. Render sets RENDER=true automatically, so that
 * is the reliable signal. Localhost has none of these set and stays on dev.
 */

const IS_PROD =
  process.env.NODE_ENV === "production" ||
  !!process.env.RENDER ||
  !!process.env.COOKIE_DOMAIN;

const COOKIE_DOMAIN = IS_PROD
  ? process.env.COOKIE_DOMAIN || ".kaisolutions.ai"
  : undefined;

const DEFAULT_SAMESITE = IS_PROD ? "none" : "lax";

// Printed once at boot. Check this in the Render logs to confirm the
// resolved config without guessing at env vars.
console.log("[cookies] resolved config:", {
  IS_PROD,
  NODE_ENV: process.env.NODE_ENV || "(unset)",
  RENDER: process.env.RENDER || "(unset)",
  domain: COOKIE_DOMAIN || "(host-only)",
  sameSite: DEFAULT_SAMESITE,
  secure: IS_PROD,
});

/**
 * Sets an auth token as an httpOnly cookie.
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
 * Clears an auth cookie. Attributes MUST match those used when setting, or
 * clearCookie silently no-ops and logout doesn't log out.
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