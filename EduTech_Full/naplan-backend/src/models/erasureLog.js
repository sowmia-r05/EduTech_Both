const mongoose = require("mongoose");

/**
 * Proof that an erasure request was honoured, holding no personal data.
 * subject_hash is SHA-256 of the lower-cased email — enough to confirm a
 * specific request was actioned if challenged, not enough to identify anyone.
 */
const ErasureLogSchema = new mongoose.Schema(
  {
    subject_hash: { type: String, required: true, index: true },
    scope: { type: String, enum: ["child", "account"], required: true },
    reason: { type: String, default: "user_request" },
    counts: { type: Object, default: {} },
    external_failures: [{ type: String }],
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("ErasureLog", ErasureLogSchema);