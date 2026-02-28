/**
 * models/admin.js
 *
 * Admin user model with email + password authentication.
 * Stored in MongoDB — completely separate from Parent/Child auth.
 *
 * To seed your first admin, run:
 *   node scripts/seedAdmin.js
 */

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

const AdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "admin"],
      default: "admin",
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    last_login_at: { type: Date, default: null },
    login_count: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

/**
 * Hash password before saving
 */
AdminSchema.pre("save", async function () {
  if (!this.isModified("password_hash")) return;
  this.password_hash = await bcrypt.hash(this.password_hash, SALT_ROUNDS);
});

/**
 * Compare plain password with stored hash
 */
AdminSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password_hash);
};

module.exports = mongoose.model("Admin", AdminSchema);