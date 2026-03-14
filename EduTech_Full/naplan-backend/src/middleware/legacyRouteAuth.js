const crypto = require("crypto");
const { verifyToken, requireAuth } = require("./auth");


function secureLegacyResults(req, res, next) {
  if (req.method === "POST") return verifyWebhookSignature(req, res, next);
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

function secureLegacyWriting(req, res, next) {
  if (req.method === "POST") return verifyWebhookSignature(req, res, next);
  verifyToken(req, res, (err) => {
    if (err) return;
    requireAuth(req, res, next);
  });
}

module.exports = {
  secureLegacyResults,
  secureLegacyWriting,
};
