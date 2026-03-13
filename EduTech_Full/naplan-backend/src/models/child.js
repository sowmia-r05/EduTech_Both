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

    // Parental consent
    parental_consent: {
      type: Boolean,
      required: true,
      default: false,
    },
    parental_consent_at: {
      type: Date,
      default: null,
    },

    // Email notifications
    email_notifications: {
      type: Boolean,
      default: false,
    },


    // Status
    status: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },

    // Entitlements
    // embed IDs → used by frontend for iframe display + filtering
    entitled_quiz_ids: [{ type: String }],
    // Bundle IDs → tracks which bundles were purchased
    entitled_bundle_ids: [{ type: String }],
  },
  { timestamps: true, versionKey: false },
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