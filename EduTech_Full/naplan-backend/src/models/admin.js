/**
 * models/admin.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ✅ ADDED: token_version — enables ADMIN TOKEN REVOCATION.
 *
 * The problem it solves: a JWT is self-contained. Once signed, it is valid until
 * it expires, no matter what happens to the account. Suspending an admin, or
 * discovering a leaked token, did NOTHING — the token kept working for the full
 * 12h TTL and there was no way to kill it.
 *
 * How it works: the current token_version is stamped into every admin JWT at
 * sign time. requireAdmin re-reads it from the DB on each request and rejects
 * the token if the numbers don't match. So bumping token_version instantly
 * invalidates every token that admin holds.
 *
 * Bump it (via revokeTokens() below) whenever:
 *   • the admin is suspended or deleted
 *   • the password changes
 *   • a token is known or suspected to be leaked
 *   • the admin clicks "log out of all devices"
 *
 * NOTE the trade-off: this costs one DB read per authenticated admin request.
 * That is fine at admin volumes. Do NOT copy this pattern to parent/child
 * tokens without thinking about the read load first.
 * ═══════════════════════════════════════════════════════════════════════════
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

    // ✅ Incremented to invalidate every JWT this admin currently holds.
    // Stamped into the token at sign time; verified on every request.
    token_version: {
      type: Number, default: 0,
    },

    assigned_quiz_ids: { type: [String], default: [] },
    approved_by:   { type: String, default: null },
    approved_at:   { type: Date,   default: null },
    last_login_at: { type: Date,   default: null },
    login_count:   { type: Number, default: 0    },
  },
  { timestamps: true, versionKey: false }
);

// ─── Password hashing ────────────────────────────────────────────────────────
// The startsWith("$2b$") guard is load-bearing. Two call sites write to this
// field differently:
//   • adminRoutes /register passes an ALREADY-bcrypted string → skip, or we'd
//     double-hash and lock the admin out permanently.
//   • adminRoutes /tutors and seedAdmin.js pass the RAW password → hash it.
// Do not remove the guard without changing both call sites.
AdminSchema.pre("save", async function () {
  if (!this.isModified("password_hash")) return;
  if (this.password_hash.startsWith("$2b$") || this.password_hash.startsWith("$2a$")) return;
  this.password_hash = await bcrypt.hash(this.password_hash, SALT_ROUNDS);
});

// ─── Auto-revoke on password change ──────────────────────────────────────────
// If the password changed, any token issued under the old one must die.
AdminSchema.pre("save", function () {
  if (this.isModified("password_hash") && !this.isNew) {
    this.token_version = (this.token_version || 0) + 1;
  }
});

// ─── Auto-revoke on suspension ───────────────────────────────────────────────
// Without this, a suspended admin's existing token keeps working until it
// expires — the /login status check never runs again for an already-issued token.
AdminSchema.pre("save", function () {
  if (this.isModified("status") && this.status === "suspended") {
    this.token_version = (this.token_version || 0) + 1;
  }
});

AdminSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password_hash);
};

/**
 * Kill every token this admin currently holds. Call on "log out everywhere",
 * or when a token is known to be compromised.
 */
AdminSchema.methods.revokeTokens = async function () {
  this.token_version = (this.token_version || 0) + 1;
  await this.save();
  return this.token_version;
};

module.exports = mongoose.model("Admin", AdminSchema);