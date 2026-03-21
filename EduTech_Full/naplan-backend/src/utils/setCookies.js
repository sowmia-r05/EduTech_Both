const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Sets a JWT as a httpOnly, Secure (in prod), SameSite=Strict cookie.
 * @param {Response} res    - Express response object
 * @param {string}   name   - Cookie name, e.g. "parent_token"
 * @param {string}   token  - JWT string
 * @param {number}   maxAge - Milliseconds until expiry
 */
function setAuthCookie(res, name, token, maxAge) {
  res.cookie(name, token, {
    httpOnly: true, // ✅ not readable by JavaScript
    secure: IS_PROD, // ✅ HTTPS only in production
    sameSite: "Strict", // ✅ not sent on cross-site requests (CSRF protection)
    maxAge, // milliseconds
    path: "/",
  });
}

/**
 * Clears a specific auth cookie.
 */
function clearAuthCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "Strict",
    path: "/",
  });
}

module.exports = { setAuthCookie, clearAuthCookie };
