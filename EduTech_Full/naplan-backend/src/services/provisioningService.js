/**
 * src/services/provisioningService.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Triggered after successful Stripe payment.
 * ═══════════════════════════════════════════════════════════════
 *
 * For each child in the purchase:
 *   1. Ensure child has a FlexiQuiz user account
 *   2. Get the bundle's quiz IDs (standalone — only this tier)
 *   3. Filter out any the child already has
 *   4. Assign new quizzes on FlexiQuiz
 *   5. Update child record → active + entitled quiz/bundle IDs
 *   6. Mark purchase as provisioned
 *
 * NO stacking logic. NO tier resolution. NO checking what other
 * tiers the child has. Each bundle = its own quizzes, period.
 *
 * Idempotent: running twice produces the same result.
 */

const mongoose = require("mongoose");
const Child = require("../models/child");
const Purchase = require("../models/purchase");
const QuizCatalog = require("../models/quizCatalog");
const {
  fqAssignQuiz,
  fqAssignGroup,
  fqGetUser,
  registerRespondent,
} = require("./flexiQuizUsersService");
const { encryptPassword } = require("../utils/flexiquizCrypto");
const Parent = require("../models/parent");

// ═══════════════════════════════════════════════════════════════
// Simple quiz resolution — no tier logic
// ═══════════════════════════════════════════════════════════════

/**
 * Returns quiz IDs the child doesn't already have.
 * Just: bundle's quiz list minus child's existing entitled_quiz_ids.
 */
function getNewQuizIds(child, bundle) {
  const existing = new Set(child.entitled_quiz_ids || []);
  const bundleQuizIds = bundle.flexiquiz_quiz_ids || [];
  const newIds = bundleQuizIds.filter((qid) => !existing.has(qid));

  if (newIds.length < bundleQuizIds.length) {
    console.log(
      `  ℹ️ Skipping ${bundleQuizIds.length - newIds.length} already-assigned quizzes`
    );
  }

  return newIds;
}

// ═══════════════════════════════════════════════════════════════
// Main provisioning function
// ═══════════════════════════════════════════════════════════════

/**
 * Provision a single purchase.
 * @param {string} purchaseId - MongoDB _id of the Purchase doc
 * @returns {{ success: boolean, error?: string }}
 */
async function provisionPurchase(purchaseId) {
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    return { success: false, error: "Purchase not found" };
  }

  // Already provisioned — idempotent
  if (purchase.provisioned) {
    console.log(`✅ Purchase ${purchaseId} already provisioned, skipping.`);
    return { success: true };
  }

  // Must be paid
  if (purchase.status !== "paid") {
    return {
      success: false,
      error: `Purchase status is '${purchase.status}', expected 'paid'`,
    };
  }

  // Fetch the bundle from quiz_catalog
  const bundle = await QuizCatalog.findOne({ bundle_id: purchase.bundle_id });
  if (!bundle) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: {
        provision_error: `Bundle '${purchase.bundle_id}' not found in quiz_catalog`,
      },
    });
    return {
      success: false,
      error: `Bundle '${purchase.bundle_id}' not found`,
    };
  }

  // Fetch parent for email context
  const parent = await Parent.findById(purchase.parent_id).lean();
  const parentEmail = parent?.email || "";
  const parentLastName = parent?.last_name || "";

  const errors = [];

  for (const childId of purchase.child_ids) {
    const child = await Child.findById(childId);
    if (!child) {
      errors.push(`Child ${childId} not found`);
      continue;
    }

    console.log(
      `\n── Provisioning ${child.username} ` +
      `(Tier ${bundle.tier}, Year ${bundle.year_level}) ──`
    );

    // ── Get quiz IDs to assign (simple dedup) ──
    const quizIdsToAssign = getNewQuizIds(child, bundle);
    const allQuizIds = bundle.flexiquiz_quiz_ids || [];

    try {
      // ── Step 1: Ensure child has FlexiQuiz account ──
      if (!child.flexiquiz_user_id) {
        console.log(
          `  ⚠️ Child ${child.username} has no FlexiQuiz account, creating...`
        );
        const fqResult = await registerRespondent({
          firstName: child.display_name || child.username,
          lastName: parentLastName,
          email: parentEmail,
          username: child.username,
        });

        if (fqResult?.user_id) {
          await Child.findByIdAndUpdate(childId, {
            $set: {
              flexiquiz_user_id: fqResult.user_id,
              flexiquiz_password_enc: fqResult.password
                ? encryptPassword(fqResult.password)
                : null,
              flexiquiz_provisioned_at: new Date(),
            },
          });
          child.flexiquiz_user_id = fqResult.user_id;
          console.log(`  ✅ Created FlexiQuiz user: ${fqResult.user_id}`);
        } else {
          throw new Error("registerRespondent returned no user_id");
        }
      }

      const fqUserId = child.flexiquiz_user_id;

      // ── Step 2: Assign quizzes on FlexiQuiz ──
      if (quizIdsToAssign.length === 0) {
        console.log(`  ℹ️ No new quizzes to assign (all already assigned)`);
      } else {
        for (const quizId of quizIdsToAssign) {
          try {
            await fqAssignQuiz(fqUserId, quizId);
            console.log(`  ✅ Assigned quiz ${quizId}`);
          } catch (quizErr) {
            console.warn(
              `  ⚠️ Quiz ${quizId} assignment failed: ${quizErr.message}`
            );
          }
        }
      }

      // ── Step 3: Verify assignment ──
      try {
        const fqUser = await fqGetUser(fqUserId);
        const assignedQuizIds = (fqUser?.quizzes || []).map(
          (q) => q.quiz_id || q.quizId
        );
        const missing = allQuizIds.filter(
          (qid) => !assignedQuizIds.includes(qid)
        );
        if (missing.length > 0) {
          console.warn(
            `  ⚠️ ${child.username} missing quizzes after assignment:`,
            missing
          );
        } else {
          console.log(
            `  ✅ Verified: ${child.username} has all ${allQuizIds.length} quizzes`
          );
        }
      } catch (verifyErr) {
        console.warn(`  ⚠️ Verification skipped: ${verifyErr.message}`);
      }
    } catch (fqErr) {
      console.error(
        `  ❌ FlexiQuiz error for ${child.username}: ${fqErr.message}`
      );
      errors.push(`FlexiQuiz error for ${child.username}: ${fqErr.message}`);
    }

    // ── Step 4: Update child record in our DB ──
    try {
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_bundle_ids: purchase.bundle_id,
          entitled_quiz_ids: { $each: allQuizIds },
        },
      });
      console.log(`  ✅ Child record updated → active`);
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
