/**
 * scripts/adminTool.js
 *
 * List, create, or reset admin accounts directly against the database.
 * Consolidates what seedAdmin.js and resetAdminPassword.js do, plus a `list`
 * command — which is the one that answers "why is my login 401ing".
 *
 * Assigns the RAW password to password_hash: the pre-save hook in
 * models/admin.js bcrypt-hashes it AND bumps token_version. Hashing here
 * would double-hash and never match at login.
 *
 * Usage (PowerShell, from naplan-backend/):
 *   node scripts/adminTool.js list
 *   node scripts/adminTool.js create you@example.com "Your Name" "StrongPass123"
 *   node scripts/adminTool.js reset  you@example.com "NewStrongPass123"
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin    = require("../src/models/admin");

// config/db.js reads MONGODB_URI — match it exactly.
const URI = process.env.MONGODB_URI;

/** Mirrors validatePassword() in adminRoutes.js so this can't create an
 *  account that the app's own policy would reject. */
function checkPassword(pw) {
  if (!pw || pw.length < 12)  return "Password must be at least 12 characters.";
  if (!/[A-Z]/.test(pw))      return "Password must contain an uppercase letter.";
  if (!/[0-9]/.test(pw))      return "Password must contain a number.";
  return null;
}

async function main() {
  if (!URI) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });

  // The single most useful line here. A mystery 401 is almost always an
  // account sitting in a different database than the one Render uses.
  console.log(`Connected to database: ${mongoose.connection.name}\n`);

  const [cmd, rawEmail, a, b] = process.argv.slice(2);
  const email = String(rawEmail || "").trim().toLowerCase();

  if (cmd === "list") {
    const rows = await Admin.find(
      {},
      { email: 1, name: 1, role: 1, status: 1, token_version: 1 }
    ).lean();

    if (!rows.length) {
      console.log("No admin accounts exist in this database.");
      console.log("Run:  node scripts/adminTool.js create <email> <name> <password>");
    } else {
      console.table(rows.map((r) => ({
        email:  r.email,
        name:   r.name,
        role:   r.role,
        status: r.status,
        token_version: r.token_version || 0,
      })));
    }

  } else if (cmd === "create") {
    const pwError = checkPassword(b);
    if (!email || !a || pwError) {
      console.error(pwError || "Usage: create <email> <name> <password>");
    } else if (await Admin.findOne({ email })) {
      console.log(`${email} already exists — use \`reset\` instead.`);
    } else {
      await Admin.create({
        email,
        name: a,
        password_hash: b,     // raw; the pre-save hook hashes it
        role: "admin",
        status: "active",     // NOT "pending", or login returns 403
      });
      console.log(`Created active admin: ${email}`);
    }

  } else if (cmd === "reset") {
    const pwError = checkPassword(a);
    if (pwError) {
      console.error(pwError);
    } else {
      const admin = await Admin.findOne({ email });
      if (!admin) {
        console.log(`No admin found with email: ${email}`);
        const all = await Admin.find({}, "email role status").lean();
        if (all.length) {
          console.log("Accounts that DO exist here:");
          all.forEach((x) => console.log(`  - ${x.email} (${x.role}, ${x.status})`));
        }
      } else {
        admin.password_hash = a;   // hook hashes + bumps token_version
        if (admin.status !== "active") {
          console.log(`Status was "${admin.status}" — setting to "active".`);
          admin.status = "active";
        }
        await admin.save();
        console.log(`Reset password for ${admin.email} (${admin.role}, ${admin.status}).`);
        console.log(`token_version now ${admin.token_version} — old sessions revoked.`);
      }
    }

  } else {
    console.log("Commands:");
    console.log("  list");
    console.log("  create <email> <name> <password>");
    console.log("  reset  <email> <password>");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});