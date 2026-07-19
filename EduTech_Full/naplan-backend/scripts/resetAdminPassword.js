/**
 * scripts/resetAdminPassword.js
 *
 * Resets an existing admin's password directly in MongoDB.
 * The pre-save hook bcrypt-hashes the raw password and bumps token_version
 * (which kills any outstanding JWTs — intended).
 *
 * Usage (PowerShell, from naplan-backend/):
 *   $env:RESET_EMAIL="sowmkrish4@gmail.com"; $env:RESET_PASSWORD="NewStrongPass123"; node scripts/resetAdminPassword.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin    = require("../src/models/admin");

const EMAIL    = (process.env.RESET_EMAIL    || "").trim().toLowerCase();
const PASSWORD =  process.env.RESET_PASSWORD || "";

async function run() {
  if (!EMAIL) {
    console.error("❌ RESET_EMAIL not set.");
    process.exit(1);
  }
  if (!PASSWORD || PASSWORD.length < 12) {
    console.error("❌ RESET_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  if (!/[A-Z]/.test(PASSWORD)) {
    console.error("❌ RESET_PASSWORD must contain at least one uppercase letter.");
    process.exit(1);
  }
  if (!/[0-9]/.test(PASSWORD)) {
    console.error("❌ RESET_PASSWORD must contain at least one number.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");
  console.log(`   DB: ${mongoose.connection.name}`);

  const admin = await Admin.findOne({ email: EMAIL });
  if (!admin) {
    console.error(`❌ No admin found with email: ${EMAIL}`);
    const all = await Admin.find({}, "email role status").lean();
    console.error("   Existing accounts:");
    all.forEach((a) => console.error(`     • ${a.email}  (${a.role}, ${a.status})`));
    await mongoose.disconnect();
    process.exit(1);
  }

  admin.password_hash = PASSWORD;   // pre-save hook hashes + bumps token_version
  if (admin.status !== "active") {
    console.log(`⚠️  Status was "${admin.status}" — setting to "active".`);
    admin.status = "active";
  }
  await admin.save();

  console.log("✅ Password reset:");
  console.log(`   Email:  ${admin.email}`);
  console.log(`   Role:   ${admin.role}`);
  console.log(`   Status: ${admin.status}`);
  console.log(`   token_version: ${admin.token_version}  (old sessions revoked)`);

  await mongoose.disconnect();
  console.log("✅ Done");
}

run().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});