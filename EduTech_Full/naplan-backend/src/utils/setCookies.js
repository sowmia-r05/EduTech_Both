const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Sets an auth token as an httpOnly cookie.
 * @param {Response} res     - Express response object
 * @param {string}   name    - Cookie name, e.g. "parent_token" or "rt"
 * @param {string}   token   - Token string (JWT for access; opaque for refresh)
 * @param {number}   maxAge  - Milliseconds until expiry
 * @param {object}   [opts]
 * @param {string}   [opts.path="/"]       - use "/api/auth" for refresh tokens
 * @param {string}   [opts.sameSite="lax"] - "lax" survives OAuth/Stripe redirect returns
 */
function setAuthCookie(res, name, token, maxAge, { path = "/", sameSite = "lax" } = {}) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite,
    maxAge,
    path,
  });
}

/**
 * Clears an auth cookie. MUST pass the same `path`/`sameSite` used when setting,
 * or clearCookie silently no-ops and logout won't actually log out.
 */
function clearAuthCookie(res, name, { path = "/", sameSite = "lax" } = {}) {
  res.clearCookie(name, { httpOnly: true, secure: IS_PROD, sameSite, path });
}

module.exports = { setAuthCookie, clearAuthCookie };