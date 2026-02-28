/**
 * cron/cleanupExpiredBundles.js
 * ✅ Issue #4: Checks expired purchases hourly and downgrades children.
 * Place in: naplan-backend/src/cron/cleanupExpiredBundles.js
 */
const Purchase = require("../models/purchase");
const Child = require("../models/child");
const QuizCatalog = require("../models/quizCatalog");
const connectDB = require("../config/db");

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function cleanupExpiredBundles() {
  try {
    await connectDB();
    const now = new Date();
    const expiredPurchases = await Purchase.find({
      status: "paid", provisioned: true,
      expires_at: { $ne: null, $lt: now },
    }).lean();

    if (expiredPurchases.length === 0) return;
    console.log(`🔄 Processing ${expiredPurchases.length} expired bundle purchase(s)...`);

    for (const purchase of expiredPurchases) {
      try {
        const bundle = await QuizCatalog.findOne({ bundle_id: purchase.bundle_id }).lean();
        const quizIdsToRevoke = bundle?.flexiquiz_quiz_ids || [];

        for (const childId of purchase.child_ids || []) {
          const child = await Child.findById(childId);
          if (!child) continue;

          const updatedEntitledQuizIds = (child.entitled_quiz_ids || []).filter((id) => !quizIdsToRevoke.includes(id));
          const updatedBundleIds = (child.entitled_bundle_ids || []).filter((id) => id !== purchase.bundle_id);

          const otherActivePurchases = await Purchase.countDocuments({
            child_ids: childId, status: "paid", provisioned: true,
            _id: { $ne: purchase._id },
            $or: [{ expires_at: null }, { expires_at: { $gt: now } }],
          });

          const newStatus = otherActivePurchases > 0 ? "active" : "expired";
          await Child.findByIdAndUpdate(childId, {
            $set: { status: newStatus, entitled_quiz_ids: updatedEntitledQuizIds, entitled_bundle_ids: updatedBundleIds },
          });
          console.log(`  📦 Child ${child.username}: bundle "${purchase.bundle_id}" removed, status → "${newStatus}"`);
        }

        await Purchase.findByIdAndUpdate(purchase._id, { $set: { status: "expired" } });
        console.log(`  ✅ Purchase ${purchase._id} marked as expired`);
      } catch (err) {
        console.error(`  ❌ Error processing expired purchase ${purchase._id}:`, err.message);
      }
    }
    console.log(`🧹 Bundle expiry cleanup complete.`);
  } catch (err) {
    console.error("❌ Bundle expiry cleanup error:", err.message);
  }
}

function setupBundleExpiryCleanup() {
  cleanupExpiredBundles();
  const interval = setInterval(cleanupExpiredBundles, CLEANUP_INTERVAL_MS);
  if (interval.unref) interval.unref();
  console.log("⏰ Bundle expiry cleanup cron started (every 1 hour)");
  return interval;
}

module.exports = { cleanupExpiredBundles, setupBundleExpiryCleanup };
