const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Child: student profile under a parent.
 * Initially exists only in our system; linked to FlexiQuiz after purchase.
 * See Design Document v2.1 — Section 4.2
 */
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

    // Globally unique login identifier for the child
    // lowercase, alphanumeric + underscores, 3–20 characters
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return /^[a-z0-9_]{3,20}$/.test(v);
        },
        message:
          "Username must be 3–20 characters, lowercase letters, numbers, and underscores only.",
      },
    },

    // 4–6 digit PIN, bcrypt hashed
    pin_hash: {
      type: String,
      required: true,
    },

    // 3 | 5 | 7 | 9
    year_level: {
      type: Number,
      required: true,
      enum: [3, 5, 7, 9],
    },

    // Avatar identifier or URL (optional)
    avatar: {
      type: String,
      default: null,
    },

    // ─── FlexiQuiz fields (null until provisioned after purchase) ───

    flexiquiz_user_id: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    // Auto-generated FlexiQuiz password, AES-256 encrypted
    flexiquiz_password_enc: {
      type: String,
      default: null,
    },

    flexiquiz_provisioned_at: {
      type: Date,
      default: null,
    },

    // 'trial' | 'active' | 'expired'
    status: {
      type: String,
      default: "trial",
      enum: ["trial", "active", "expired"],
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
    versionKey: false,
  }
);

// ─── Pre-save: hash PIN if modified ───
// Note: Mongoose 9+ async pre hooks do NOT receive next(); just return or throw.
ChildSchema.pre("save", async function () {
  if (!this.isModified("pin_hash")) return;

  const salt = await bcrypt.genSalt(12);
  this.pin_hash = await bcrypt.hash(this.pin_hash, salt);
});

// ─── Instance method: compare PIN ───
ChildSchema.methods.comparePin = async function (candidatePin) {
  if (!this.pin_hash) return false;
  return bcrypt.compare(String(candidatePin), this.pin_hash);
};

// ─── Instance method: safe JSON ───
ChildSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.pin_hash;
  delete obj.flexiquiz_password_enc;
  return obj;
};

module.exports = mongoose.model("Child", ChildSchema);
