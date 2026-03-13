/**
 * scripts/fixStuckPurchases.js
 *
 * ONE-TIME SCRIPT: Re-provisions all paid-but-unprovisioned purchases.
 * Run AFTER deploying the new provisioningService.js.
 *
 * Usage:  node scripts/fixStuckPurchases.js
 * Env:    MONGODB_URI must be set
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const Purchase = require(path.join(__dirname, "..", "src", "models", "purchase"));
const { provisionPurchase } = require(path.join(__dirname, "..", "src", "services", "provisioningService"));

async function fixStuckPurchases() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB\n");

  // Find all paid but unprovisioned purchases
  const stuck = await Purchase.find({
    status: "paid",
    provisioned: false,
  }).lean();

  if (stuck.length === 0) {
    console.log("✅ No stuck purchases found — all good!");
    await mongoose.disconnect();
    return;
  }

  console.log(`🔧 Found ${stuck.length} stuck purchase(s). Re-provisioning...\n`);

  let fixed = 0;
  let failed = 0;

  for (const purchase of stuck) {
    console.log(`── Purchase ${purchase._id} ──`);
    console.log(`   Bundle: ${purchase.bundle_name || purchase.bundle_id}`);
    console.log(`   Children: ${purchase.child_ids.length}`);
    console.log(`   Created: ${purchase.createdAt}`);

    try {
      const result = await provisionPurchase(purchase._id.toString());
      if (result.success) {
        console.log(`   ✅ Provisioned successfully\n`);
        fixed++;
      } else {
        console.log(`   ❌ Failed: ${result.error}\n`);
        failed++;
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}\n`);
      failed++;
    }
  }

  console.log("═══════════════════════════════════════");
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${stuck.length}`);
  console.log("═══════════════════════════════════════");

  await mongoose.disconnect();
}

fixStuckPurchases().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
