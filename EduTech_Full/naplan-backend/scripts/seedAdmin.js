/**
 * scripts/seedAdmin.js
 *
 * Creates the FIRST super_admin directly in MongoDB.
 * Run this once on the server — never through the browser.
 *
 * Usage:
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD=StrongPass123 ADMIN_NAME="Your Name" node scripts/seedAdmin.js
 *
 * Or add to .env and run:
 *   node scripts/seedAdmin.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin    = require("../src/models/admin");

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "admin@yourdomain.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_NAME     = process.env.ADMIN_NAME     || "Admin";

async function seed() {
  // ✅ Updated to match new 12-char policy
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    console.error("❌ ADMIN_PASSWORD must be at least 12 characters.");
    console.error("   Example: ADMIN_PASSWORD=StrongPass123 node scripts/seedAdmin.js");
    process.exit(1);
  }

  if (!/[A-Z]/.test(ADMIN_PASSWORD)) {
    console.error("❌ ADMIN_PASSWORD must contain at least one uppercase letter.");
    process.exit(1);
  }

  if (!/[0-9]/.test(ADMIN_PASSWORD)) {
    console.error("❌ ADMIN_PASSWORD must contain at least one number.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const existing = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    console.log(`⚠️  Admin already exists: ${ADMIN_EMAIL}`);
    console.log(`   Status: ${existing.status} | Role: ${existing.role}`);
    console.log("   To reset, delete this account in MongoDB Compass and re-run.");
  } else {
    const admin = await Admin.create({
      email:         ADMIN_EMAIL.toLowerCase().trim(),
      name:          ADMIN_NAME,
      password_hash: ADMIN_PASSWORD, // pre-save hook bcrypt-hashes this
      role:          "super_admin",
      status:        "active",
    });
    console.log("✅ Super admin created:");
    console.log(`   Email:  ${admin.email}`);
    console.log(`   Name:   ${admin.name}`);
    console.log(`   Role:   ${admin.role}`);
    console.log(`   Status: ${admin.status}`);
    console.log("");
    console.log(`🔐 Login at: http://localhost:5173/#/kai-ops-9281`);
  }

  await mongoose.disconnect();
  console.log("✅ Done");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
