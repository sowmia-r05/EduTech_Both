// src/middleware/requestContext.js
// Attaches a unique request id to every request and logs start/finish.
// Put this EARLY in app.js (right after helmet/cors, before routes).

const crypto = require("crypto");
const logger = require("../utils/logger");

function requestContext(req, res, next) {
  // Reuse an incoming id (from a proxy) or generate one.
  const id = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);

  // A child logger that stamps every line with this request's id.
  req.log = logger.child({ reqId: id });

  const start = Date.now();
  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
      },
      "request completed"
    );
  });

  next();
}

module.exports = requestContext;