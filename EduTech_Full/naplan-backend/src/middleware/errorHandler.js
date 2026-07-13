// src/middleware/errorHandler.js
// Central error handler. Logs the FULL error server-side (with request id),
// but sends the CLIENT only a safe message + the request id to quote to support.
// Register this LAST in app.js, after all routes.

const logger = require("../utils/logger");

// eslint-disable-next-line no-unused-vars  (Express needs the 4-arg signature)
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const log = req.log || logger;

  // Full detail stays in the server logs only.
  log.error(
    { err: { message: err.message, stack: err.stack, name: err.name }, status },
    "request failed"
  );

  if (res.headersSent) return next(err);

  // Preserve a 503 (e.g. PythonBusyError) so clients can retry.
  if (status === 503) res.set("Retry-After", "30");

  // 4xx errors are usually safe to show (validation messages the user needs).
  // 5xx errors must NOT leak internals — send a generic message.
  const clientMessage =
    status >= 500
      ? "Something went wrong. Please try again."
      : err.message || "Request failed";

  res.status(status).json({
    error: clientMessage,
    requestId: req.id, // user can quote this to support; we grep logs by it
  });
}

module.exports = errorHandler;