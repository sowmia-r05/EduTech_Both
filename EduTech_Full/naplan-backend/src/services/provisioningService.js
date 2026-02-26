/**
 * src/services/provisioningService.js
 *
 * UPDATED: Now supports tiered bundles (A/B/C).
 *
 * Triggered after a successful Stripe payment.
 * For each child in the purchase:
 *   1. Ensure child has a FlexiQuiz user
 *   2. Determine which quizzes to assign based on:
 *      - The purchased bundle's tier
 *      - What the child already has (entitled_bundle_ids)
 *      - If child has lower tiers → assign only THIS tier's quizzes
 *      - If child DOESN'T have lower tiers → assign all quizzes including lower tiers
 *   3. Assign quizzes on FlexiQuiz
 *   4. Update child status → 'active'
 *   5. Mark purchase as provisioned
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

// Tier hierarchy: A < B < C
const TIER_HIERARCHY = { A: 1, B: 2, C: 3 };

/**
 * Given a child's existing entitled_bundle_ids and the purchased bundle,
 * determine exactly which quiz IDs to assign on FlexiQuiz.
 *
 * Logic:
 *   - If child has NO prior bundles for this year → assign flexiquiz_quiz_ids_with_lower (all tiers)
 *   - If child has lower tiers already → assign only flexiquiz_quiz_ids (this tier only)
 *   - Always deduplicate against child.entitled_quiz_ids to avoid re-assigning
 */
async function resolveQuizIdsToAssign(child, bundle) {
  const existingBundleIds = child.entitled_bundle_ids || [];
  const existingQuizIds = new Set(child.entitled_quiz_ids || []);
  const yearLevel = bundle.year_level;

  // Find what tiers the child already has for THIS year level
  const existingBundlesForYear = await QuizCatalog.find({
    bundle_id: { $in: existingBundleIds },
    year_level: yearLevel,
  }).lean();

  const existingTiers = existingBundlesForYear.map((b) => b.tier).filter(Boolean);
  const hasLowerTiers = existingTiers.length > 0;

  let quizIdsToAssign;

  if (hasLowerTiers) {
    // Child already has some bundles for this year — only assign THIS tier's quizzes
    quizIdsToAssign = bundle.flexiquiz_quiz_ids || [];
    console.log(
      `  ℹ️ Child already has tiers [${existingTiers.join(", ")}] for Year ${yearLevel}. ` +
      `Assigning only Tier ${bundle.tier} quizzes (${quizIdsToAssign.length})`
    );
  } else {
    // Child has nothing for this year — assign all including lower tiers
    quizIdsToAssign = bundle.flexiquiz_quiz_ids_with_lower || bundle.flexiquiz_quiz_ids || [];
    console.log(
      `  ℹ️ Child has no prior bundles for Year ${yearLevel}. ` +
      `Assigning all quizzes including lower tiers (${quizIdsToAssign.length})`
    );
  }

  // Deduplicate: remove any quiz IDs the child already has
  const newQuizIds = quizIdsToAssign.filter((qid) => !existingQuizIds.has(qid));

  if (newQuizIds.length < quizIdsToAssign.length) {
    console.log(
      `  ℹ️ Skipping ${quizIdsToAssign.length - newQuizIds.length} already-assigned quizzes`
    );
  }

  return { quizIdsToAssign: newQuizIds, allQuizIds: quizIdsToAssign };
}

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

  // Fetch the bundle
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

  const groupId = bundle.flexiquiz_group_id || null;

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

    console.log(`\n── Provisioning ${child.username} (Tier ${bundle.tier}, Year ${bundle.year_level}) ──`);

    // ── Resolve which quiz IDs to actually assign ──
    const { quizIdsToAssign, allQuizIds } = await resolveQuizIdsToAssign(child, bundle);

    // ────────────────────────────────────────
    // FlexiQuiz provisioning (best-effort)
    // ────────────────────────────────────────
    let flexiquizSuccess = true;

    try {
      // ── Step 1: Ensure child has FlexiQuiz account ──
      if (!child.flexiquiz_user_id) {
        console.log(`  ⚠️ Child ${child.username} missing FlexiQuiz user, creating now...`);
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

      // ── Step 2: Assign quizzes ──
      if (quizIdsToAssign.length === 0) {
        console.log(`  ℹ️ No new quizzes to assign (all already assigned)`);
      } else if (groupId) {
        // Assign via group
        try {
          await fqAssignGroup(fqUserId, groupId);
          console.log(`  ✅ Assigned group ${groupId} to ${child.username}`);
        } catch (groupErr) {
          console.warn(`  ⚠️ Group assignment failed, falling back to individual: ${groupErr.message}`);
          // Fall back to individual quiz assignment
          for (const quizId of quizIdsToAssign) {
            try {
              await fqAssignQuiz(fqUserId, quizId);
              console.log(`  ✅ Assigned quiz ${quizId}`);
            } catch (quizErr) {
              console.warn(`  ⚠️ Quiz ${quizId} assignment failed: ${quizErr.message}`);
            }
          }
        }
      } else {
        // Assign individual quizzes
        for (const quizId of quizIdsToAssign) {
          try {
            await fqAssignQuiz(fqUserId, quizId);
            console.log(`  ✅ Assigned quiz ${quizId}`);
          } catch (quizErr) {
            console.warn(`  ⚠️ Quiz ${quizId} assignment failed: ${quizErr.message}`);
          }
        }
      }

      // ── Step 3: Verify assignment (optional) ──
      try {
        const fqUser = await fqGetUser(fqUserId);
        const assignedQuizIds = (fqUser?.quizzes || []).map(
          (q) => q.quiz_id || q.quizId
        );
        const missing = allQuizIds.filter(
          (qid) => !assignedQuizIds.includes(qid)
        );
        if (missing.length > 0) {
          console.warn(`  ⚠️ ${child.username} missing quizzes after assignment:`, missing);
        } else {
          console.log(`  ✅ Verified: all ${allQuizIds.length} quizzes assigned on FlexiQuiz`);
        }
      } catch (verifyErr) {
        console.warn(`  ⚠️ Could not verify: ${verifyErr.message}`);
      }
    } catch (fqErr) {
      flexiquizSuccess = false;
      console.error(`  ❌ FlexiQuiz provisioning failed: ${fqErr.message}`);
      errors.push(`Child ${childId} (${child.username}): FlexiQuiz error - ${fqErr.message}`);
    }

    // ────────────────────────────────────────
    // ✅ Step 4: ALWAYS update child status + entitlements
    // Runs regardless of FlexiQuiz success/failure
    // ────────────────────────────────────────
    try {
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_quiz_ids: { $each: allQuizIds },
          entitled_bundle_ids: purchase.bundle_id,
        },
      });
      console.log(
        `  ✅ Child ${child.username} status → active, ` +
        `+${allQuizIds.length} quiz entitlements, bundle: ${purchase.bundle_id}` +
        (flexiquizSuccess ? "" : " (FlexiQuiz pending)")
      );
    } catch (updateErr) {
      console.error(`  ❌ DB update failed: ${updateErr.message}`);
      errors.push(`Child ${childId}: DB update failed - ${updateErr.message}`);
    }
  }

  // ── Step 5: Mark purchase as provisioned ──
  const hasOnlyFlexiQuizErrors =
    errors.length > 0 && errors.every((e) => e.includes("FlexiQuiz"));

  if (errors.length === 0 || hasOnlyFlexiQuizErrors) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: {
        provisioned: true,
        provisioned_at: new Date(),
        provision_error: errors.length > 0 ? errors.join("; ") : null,
      },
    });
    console.log(
      `\n✅ Purchase ${purchaseId} provisioned` +
      (hasOnlyFlexiQuizErrors ? " (with FlexiQuiz warnings)" : " successfully")
    );
    return { success: true };
  } else {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provision_error: errors.join("; ") },
    });
    console.error(`⚠️ Purchase ${purchaseId} partially provisioned. Errors:`, errors);
    return { success: false, error: errors.join("; ") };
  }
}

module.exports = { provisionPurchase };
