/**
 * src/services/provisioningService.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Triggered after successful Stripe payment.
 * ═══════════════════════════════════════════════════════════════
 *
 * ✅ SIMPLIFIED: Uses BUNDLE-BASED LOOKUP now.
 *    Provisioning only needs to:
 *      1. Set child status → "active"
 *      2. Add bundle_id to child's entitled_bundle_ids
 *
 *    entitled_quiz_ids is NO LONGER the source of truth.
 *    The bundle's quiz_ids array IS the source of truth.
 *    Provisioning can NEVER fail due to "0 quiz IDs" anymore —
 *    admin can add quizzes to the bundle at any time and children
 *    see them immediately via availableQuizzesRoute + quizRoutes.
 *
 * Idempotent: running twice produces the same result.
 */

const Child = require("../models/child");
const Purchase = require("../models/purchase");
const QuizCatalog = require("../models/quizCatalog");
const connectDB = require("../config/db");

// ═══════════════════════════════════════════════════════════════
// Main provisioning function
// ═══════════════════════════════════════════════════════════════

async function provisionPurchase(purchaseId) {
  await connectDB();

  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    return { success: false, error: "Purchase not found" };
  }

  if (purchase.provisioned) {
    console.log(`✅ Purchase ${purchaseId} already provisioned, skipping.`);
    return { success: true };
  }

  if (purchase.status !== "paid") {
    return {
      success: false,
      error: `Purchase status is '${purchase.status}', expected 'paid'`,
    };
  }

  const bundle = await QuizCatalog.findOne({ bundle_id: purchase.bundle_id });
  if (!bundle) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provisioned: false, provision_error: `Bundle '${purchase.bundle_id}' not found in quiz_catalog` },
    });
    return { success: false, error: `Bundle '${purchase.bundle_id}' not found` };
  }

  // ✅ REMOVED: No longer check quiz_ids count or fail on 0 quizzes.
  // Quizzes are looked up dynamically from the bundle when the child
  // views their dashboard. Admin can add quizzes at any time.

  console.log(`\n🔧 Provisioning purchase ${purchaseId}`);
  console.log(`   Bundle: ${bundle.bundle_name} (${bundle.bundle_id})`);
  console.log(`   Children: ${purchase.child_ids.length}`);

  const errors = [];

  for (const childId of purchase.child_ids) {
    const child = await Child.findById(childId);
    if (!child) {
      errors.push(`Child ${childId} not found`);
      continue;
    }

    console.log(`\n── Provisioning ${child.username} ──`);

    try {
      // ✅ SIMPLIFIED: Only set status + add bundle ID.
      // No entitled_quiz_ids needed — bundles are looked up dynamically.
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_bundle_ids: purchase.bundle_id,
        },
      });

      console.log(`  ✅ Child ${child.username} → active (bundle: ${purchase.bundle_id})`);
    } catch (dbErr) {
      console.error(`  ❌ DB error for ${child.username}: ${dbErr.message}`);
      errors.push(`DB error for ${child.username}: ${dbErr.message}`);
    }
  }

  // ── Mark purchase as provisioned ──
  const allSuccess = errors.length === 0;
  await Purchase.findByIdAndUpdate(purchaseId, {
    $set: {
      provisioned: allSuccess,
      provisioned_at: allSuccess ? new Date() : undefined,
      provision_error: allSuccess ? null : errors.join("; "),
    },
  });

  if (allSuccess) {
    console.log(`\n✅ Purchase ${purchaseId} fully provisioned.`);
  } else {
    console.warn(`\n⚠️ Purchase ${purchaseId} had errors:`, errors);
  }

  return {
    success: allSuccess,
    error: allSuccess ? undefined : errors.join("; "),
  };
}

module.exports = { provisionPurchase };