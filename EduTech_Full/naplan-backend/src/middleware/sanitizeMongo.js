/**
 * middleware/sanitizeMongo.js
 * NoSQL-injection sanitizer — Express 5 safe.
 */

function deepStrip(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (obj instanceof Date || Buffer.isBuffer(obj)) return obj;

  if (Array.isArray(obj)) {
    for (const item of obj) deepStrip(item);
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (
      key.startsWith("$") ||        // Mongo operators: $gt, $ne, $where …
      key.includes(".") ||          // dot-path traversal: "user.role"
      key === "__proto__" ||        // prototype pollution
      key === "constructor" ||
      key === "prototype"
    ) {
      delete obj[key];
      continue;
    }
    const val = obj[key];
    if (val && typeof val === "object") deepStrip(val);
  }
  return obj;
}

function sanitizeMongo(req, res, next) {
  deepStrip(req.body);     // writable — in-place mutation persists
  deepStrip(req.params);   // writable — in-place mutation persists

  // Express 5 RE-PARSES req.query on every access, so mutating the object
  // you read back is discarded on the next read. Grab it ONCE, clean it,
  // then pin the cleaned object onto req so all downstream reads see it.
  const query = req.query;
  if (query) {
    deepStrip(query);
    Object.defineProperty(req, "query", {
      value: query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  next();
}

module.exports = sanitizeMongo;
module.exports.deepStrip = deepStrip;