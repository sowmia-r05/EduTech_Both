const crypto = require("crypto");
const env = require("../config/env");

module.exports = (req, res, next) => {
  // FlexiQuiz (and some configs) may use different signature header names.
  const signature =
    req.get("x-flexiquiz-signature") ||
    req.get("x-fq-signature") ||
    req.get("x-webhook-signature");

  const raw = req.rawBody; // Buffer (set in app.js express.json verify)

  if (!signature) {
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  if (!raw) {
    return res.status(400).json({ error: "Missing rawBody (signature verification misconfigured)" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.flexiQuizWebhookSecret || "")
    .update(raw)
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  next();
};
