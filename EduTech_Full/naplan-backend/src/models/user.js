const mongoose = require("mongoose");

/**
 * Users: one document per FlexiQuiz user ("respondent" etc.).
 *
 * We keep only the fields you asked:
 * first_name, last_name, email_address, user_id, user_name
 * plus a "deleted" flag so user.deleted webhooks are reflected.
 */
const UserSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    user_name: { type: String, default: null, index: true },
    first_name: { type: String, default: "" },
    last_name: { type: String, default: "" },
    email_address: { type: String, default: "", index: true },

    // reflects user.deleted
    deleted: { type: Boolean, default: false },

    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("User", UserSchema);
