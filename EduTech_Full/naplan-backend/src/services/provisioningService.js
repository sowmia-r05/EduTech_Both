/**
 * src/services/provisioningService.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Triggered after successful Stripe payment.
 * ═══════════════════════════════════════════════════════════════
 *
 * REWRITTEN: Removed all FlexiQuiz API dependencies.
 * Now works entirely with native quizzes (admin-uploaded via Quiz model).
 *
 * Flow:
 *   1. Find the purchase + bundle
 *   2. Get quiz IDs from bundle (native quiz_ids)
 *   3. For each child: update status → "active", add entitled quiz IDs
 *   4. Mark purchase as provisioned
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

  // ── Get quiz IDs: prefer native quiz_ids, fall back to flexiquiz_quiz_ids for backward compat ──
  const quizIds = (bundle.quiz_ids && bundle.quiz_ids.length > 0)
    ? bundle.quiz_ids
    : bundle.flexiquiz_quiz_ids || [];

  if (quizIds.length === 0) {
    console.error(`❌ Bundle '${bundle.bundle_id}' has 0 quiz IDs. Run seedBundles.js or map quizzes in Admin.`);
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provisioned: false, provision_error: `Bundle has 0 quiz IDs` },
    });
    return { success: false, error: "Bundle has no quiz IDs" };
  }

  console.log(`\n🔧 Provisioning purchase ${purchaseId}`);
  console.log(`   Bundle: ${bundle.bundle_name} (${bundle.bundle_id})`);
  console.log(`   Quiz IDs: ${quizIds.length} quizzes`);
  console.log(`   Children: ${purchase.child_ids.length}`);

  const errors = [];

  for (const childId of purchase.child_ids) {
    const child = await Child.findById(childId);
    if (!child) {
      errors.push(`Child ${childId} not found`);
      continue;
    }

    console.log(`\n── Provisioning ${child.username} (Year ${bundle.year_level}) ──`);

    try {
      // ── Determine which quiz IDs are new for this child ──
      const existingQuizIds = new Set(child.entitled_quiz_ids || []);
      const newQuizIds = quizIds.filter((id) => !existingQuizIds.has(id));

      if (newQuizIds.length === 0) {
        console.log(`  ℹ️ No new quizzes to add (all already entitled)`);
      } else {
        console.log(`  📚 Adding ${newQuizIds.length} new quiz entitlements`);
      }

      // ── Update child: status → active, add entitlements ──
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_bundle_ids: purchase.bundle_id,
          entitled_quiz_ids: { $each: quizIds },
        },
      });

      console.log(`  ✅ Child ${child.username} → active (${quizIds.length} quizzes entitled)`);
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
