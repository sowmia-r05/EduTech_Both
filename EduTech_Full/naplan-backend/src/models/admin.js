/**
 * models/admin.js  (v2 — TUTOR ROLE)
 *
 * CHANGES:
 *   ✅ Added "tutor" to role enum
 *     Tutors can log in via the same admin login page but only have
 *     access to question verification endpoints.
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
      enum: ["super_admin", "admin", "tutor"],
      default: "admin",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "active",
    },
    // Approval fields (used when status is pending)
    approved_by: { type: String, default: null },
    approved_at: { type: Date, default: null },

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
  // Skip if already hashed
  if (
    this.password_hash.startsWith("$2b$") ||
    this.password_hash.startsWith("$2a$")
  )
    return;
  this.password_hash = await bcrypt.hash(this.password_hash, SALT_ROUNDS);
});

/**
 * Compare plain password with stored hash
 */
AdminSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password_hash);
};

module.exports = mongoose.model("Admin", AdminSchema);