/**
 * models/admin.js
 */

const mongoose = require("mongoose");
const bcrypt   = require("bcrypt");

const SALT_ROUNDS = 12;

const AdminSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, unique: true, trim: true, lowercase: true,
    },
    name: {
      type: String, required: true, trim: true,
    },
    password_hash: {
      type: String, required: true,
    },
    role: {
      type: String, enum: ["admin", "tutor"], default: "admin",
    },
    status: {
      type: String, enum: ["active", "suspended", "pending"], default: "active",
    },
    assigned_quiz_ids: { type: [String], default: [] },
    approved_by:   { type: String, default: null },
    approved_at:   { type: Date,   default: null },
    last_login_at: { type: Date,   default: null },
    login_count:   { type: Number, default: 0    },
  },
  { timestamps: true, versionKey: false }
);

AdminSchema.pre("save", async function () {
  if (!this.isModified("password_hash")) return;
  if (this.password_hash.startsWith("$2b$") || this.password_hash.startsWith("$2a$")) return;
  this.password_hash = await bcrypt.hash(this.password_hash, SALT_ROUNDS);
});

AdminSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password_hash);
};

module.exports = mongoose.model("Admin", AdminSchema);