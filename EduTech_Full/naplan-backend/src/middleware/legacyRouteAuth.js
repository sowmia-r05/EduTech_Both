/**
 * middleware/legacyRouteAuth.js
 * ✅ Issue #6: Auth middleware for legacy /api/results and /api/writing routes.
 * Place in: naplan-backend/src/middleware/legacyRouteAuth.js
 *
 * Usage in app.js:
 *   const { secureLegacyResults, secureLegacyWriting } = require("./middleware/legacyRouteAuth");
 *   app.use("/api/results", secureLegacyResults, resultsRoutes);
 *   app.use("/api/writing", secureLegacyWriting, writingRoutes);
 */
const { verifyToken, requireAuth } = require("./auth");

function secureLegacyResults(req, res, next) {
  // Allow webhook POSTs through (FlexiQuiz sends these)
  if (req.method === "POST") return next();
  // All other methods (GET, PUT, DELETE) require auth
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

function secureLegacyWriting(req, res, next) {
  if (req.method === "POST") return next();
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

module.exports = { secureLegacyResults, secureLegacyWriting };
