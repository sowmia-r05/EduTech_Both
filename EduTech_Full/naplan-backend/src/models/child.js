const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

const ChildSchema = new mongoose.Schema(
  {
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      index: true,
    },
    display_name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => /^[a-z0-9_]{3,20}$/.test(v),
        message:
          "Username must be 3–20 characters, lowercase alphanumeric + underscores only.",
      },
    },
    year_level: {
      type: Number,
      required: true,
      enum: [3, 5, 7, 9],
    },
    pin_hash: {
      type: String,
      required: true,
    },

    // FlexiQuiz link (set after purchase + auto-provisioning)
    flexiquiz_user_id: { type: String, default: null, index: true },
    flexiquiz_password_enc: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },

    // Entitlements
    entitled_quiz_ids: [{ type: String }],
    entitled_bundle_ids: [{ type: String }],
  },
  { timestamps: true, versionKey: false },
);

// ---------- PIN hashing ----------
// Accepts raw PIN via virtual setter, hashes before save
ChildSchema.pre("save", async function () {
  if (!this.isModified("pin_hash")) return;
  try {
    this.pin_hash = await bcrypt.hash(this.pin_hash, SALT_ROUNDS);
  } catch (err) {
    throw err; // Mongoose will catch and reject save
  }
});

ChildSchema.methods.comparePin = async function (rawPin) {
  return bcrypt.compare(String(rawPin), this.pin_hash);
};

// ---------- Static helper for PIN update (findOneAndUpdate won't trigger pre-save) ----------
ChildSchema.statics.hashPin = async function (rawPin) {
  return bcrypt.hash(String(rawPin), SALT_ROUNDS);
};

module.exports = mongoose.model("Child", ChildSchema);
