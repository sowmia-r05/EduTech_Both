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

    // FlexiQuiz link (set during child creation)
    flexiquiz_user_id: { type: String, default: null, index: true },
    flexiquiz_password_enc: { type: String, default: null },
    flexiquiz_provisioned_at: { type: Date, default: null },

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
  { timestamps: true, versionKey: false }
);

// ---------- PIN hashing ----------
ChildSchema.pre("save", async function () {
  if (!this.isModified("pin_hash")) return;
  try {
    this.pin_hash = await bcrypt.hash(this.pin_hash, SALT_ROUNDS);
  } catch (err) {
    throw err;
  }
});

ChildSchema.methods.comparePin = async function (rawPin) {
  return bcrypt.compare(String(rawPin), this.pin_hash);
};

ChildSchema.statics.hashPin = async function (rawPin) {
  return bcrypt.hash(String(rawPin), SALT_ROUNDS);
};

module.exports = mongoose.model("Child", ChildSchema);