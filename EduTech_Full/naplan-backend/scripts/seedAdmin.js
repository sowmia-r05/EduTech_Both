/**
 * scripts/seedAdmin.js
 *
 * Creates the first admin user with email + password in MongoDB.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword ADMIN_NAME="Your Name" node scripts/seedAdmin.js
 *
 * Or set these in your .env file and run:
 *   node scripts/seedAdmin.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../src/models/admin");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@yourdomain.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

async function seed() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
    console.error("❌ ADMIN_PASSWORD must be at least 6 characters.");
    console.error("   Set it via env: ADMIN_PASSWORD=yourpassword node scripts/seedAdmin.js");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const existing = await Admin.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`⚠️  Admin already exists: ${ADMIN_EMAIL}`);
    console.log(`   Status: ${existing.status} | Role: ${existing.role}`);
    console.log(`   To reset password, delete and re-run, or update manually.`);
  } else {
    const admin = await Admin.create({
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password_hash: ADMIN_PASSWORD, // pre-save hook will bcrypt hash this
      role: "super_admin",
      status: "active",
    });
    console.log(`✅ Admin created:`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Name:     ${admin.name}`);
    console.log(`   Role:     ${admin.role}`);
    console.log(`   Password: (the one you provided)`);
  }

  await mongoose.disconnect();
  console.log("✅ Done");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});