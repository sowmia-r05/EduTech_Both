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
 * Idempotent AND race-safe:
 *   - Running twice produces the same result (child writes use $set /
 *     $addToSet, which are idempotent).
 *   - The FINAL status write is guarded so that a concurrent run which
 *     hit a transient error can NOT overwrite a sibling run that already
 *     succeeded. The failure branch only writes when provisioned !== true.
 * ═══════════════════════════════════════════════════════════════
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

  // Fast-path: already done. (The race-safe writes below are the real
  // guard; this just avoids doing the work when it's clearly complete.)
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
    // Deterministic failure — but still guard against clobbering a success.
    await Purchase.findOneAndUpdate(
      { _id: purchaseId, provisioned: { $ne: true } },
      {
        $set: {
          provisioned: false,
          provision_error: `Bundle '${purchase.bundle_id}' not found in quiz_catalog`,
        },
      },
    );
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
      // Both operations are idempotent, so a concurrent/retried run is safe.
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

  // ── Mark purchase as provisioned (race-safe) ──
  const allSuccess = errors.length === 0;

  if (allSuccess) {
    // Success is authoritative — write it unconditionally.
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: {
        provisioned: true,
        provisioned_at: new Date(),
        provision_error: null,
      },
    });
    console.log(`\n✅ Purchase ${purchaseId} fully provisioned.`);
  } else {
    // Failure must NOT overwrite a concurrent run that already succeeded.
    // Only record the error if the purchase is still not provisioned.
    const updated = await Purchase.findOneAndUpdate(
      { _id: purchaseId, provisioned: { $ne: true } },
      {
        $set: {
          provisioned: false,
          provision_error: errors.join("; "),
        },
      },
      { new: true },
    );

    if (updated) {
      console.warn(`\n⚠️ Purchase ${purchaseId} had errors:`, errors);
    } else {
      // A sibling run already marked it provisioned — treat as success.
      console.log(
        `\nℹ️ Purchase ${purchaseId} already provisioned by a concurrent run; ` +
          `ignoring transient errors from this run:`,
        errors,
      );
      return { success: true, note: "provisioned by concurrent run" };
    }
  }

  return {
    success: allSuccess,
    error: allSuccess ? undefined : errors.join("; "),
  };
}

module.exports = { provisionPurchase };