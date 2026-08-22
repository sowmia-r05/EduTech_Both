// src/middleware/legacyRouteAuth.js
//
// Guards the legacy /api/results and /api/writing route trees.
//
// 👈 CHANGED: removed the `if (req.method === "POST") return
// verifyWebhookSignature(req, res, next);` line from BOTH functions.
// That function was never defined anywhere in the backend (confirmed by a
// full `findstr /s` over src/ — the only two hits were these two call
// sites). Every POST to these routes therefore threw
// `ReferenceError: verifyWebhookSignature is not defined` instead of
// authenticating. That includes POST /api/results/:id/regenerate-ai, which
// the results dashboard calls to kick off AI feedback generation.
//
// The unused `crypto` require went with it — it existed only for the
// signature check that no longer exists.
//
// All HTTP methods now follow the same path: verify the token, then require
// a logged-in user. This is the correct behaviour; these routes serve a
// child's own quiz results and should never have had an unauthenticated
// POST bypass in the first place.

const { verifyToken, requireAuth } = require("./auth");

function secureLegacyResults(req, res, next) {
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

function secureLegacyWriting(req, res, next) {
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

module.exports = {
  secureLegacyResults,
  secureLegacyWriting,
};