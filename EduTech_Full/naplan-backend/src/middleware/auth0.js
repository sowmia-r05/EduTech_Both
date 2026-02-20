// Auth0 JWT validation middleware (Bearer access token)
// Requires:
//   AUTH0_DOMAIN=dev-xxxx.us.auth0.com
//   AUTH0_AUDIENCE=https://naplan-api
//
// Frontend should request access token with the same audience.

const { jwtVerify, createRemoteJWKSet } = require('jose');

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

let jwks = null;
let issuer = null;
let audience = null;

function init() {
  if (jwks) return;
  const domain = getRequiredEnv('AUTH0_DOMAIN');
  issuer = `https://${domain}/`;
  audience = getRequiredEnv('AUTH0_AUDIENCE');
  jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
}

module.exports = async function requireAuth0(req, res, next) {
  try {
    init();

    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Missing Bearer token' });

    const token = m[1];
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
    });

    req.auth0 = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', detail: err.message });
  }
};
