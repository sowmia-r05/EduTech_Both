/**
 * src/services/provisioningService.js
 *
 * Triggered after a successful Stripe payment.
 * For each child in the purchase:
 *   1. Ensure child has a FlexiQuiz user (should already exist from child creation)
 *   2. Assign purchased quizzes (or group) to the FlexiQuiz user
 *   3. Update child status from 'trial' → 'active'  ← ALWAYS RUNS
 *   4. Mark purchase as provisioned
 *
 * FIXED: Child status update is now OUTSIDE the FlexiQuiz try/catch
 * so it always runs even if FlexiQuiz API calls fail.
 *
 * Idempotent: running twice for the same purchase produces the same result.
 */

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

  const quizIds = bundle.flexiquiz_quiz_ids || [];
  const groupId = bundle.flexiquiz_group_id || null;

  // Fetch parent for email context
  const parent = await Parent.findById(purchase.parent_id).lean();

  const errors = [];

  for (const childId of purchase.child_ids) {
    const child = await Child.findById(childId);
    if (!child) {
      errors.push(`Child ${childId} not found`);
      continue;
    }

    // ────────────────────────────────────────
    // FlexiQuiz provisioning (best-effort)
    // If this fails, child STILL gets activated
    // ────────────────────────────────────────
    let flexiquizSuccess = true;

    try {
      // ── Step 1: Ensure child has FlexiQuiz account ──
      if (!child.flexiquiz_user_id) {
        console.log(
          `⚠️ Child ${child.username} missing FlexiQuiz user, creating now...`
        );
        const fqResult = await registerRespondent({
          firstName: child.display_name || child.username,
          lastName: "",
          email: parent?.email || "",
          userName: child.username,
        });

        if (fqResult?.userId) {
          await Child.findByIdAndUpdate(childId, {
            $set: {
              flexiquiz_user_id: fqResult.userId,
              flexiquiz_password_enc: fqResult.password
                ? encryptPassword(fqResult.password)
                : null,
              flexiquiz_provisioned_at: new Date(),
            },
          });
          child.flexiquiz_user_id = fqResult.userId;
          console.log(
            `✅ Created FlexiQuiz user for ${child.username}: ${fqResult.userId}`
          );
        } else {
          throw new Error("registerRespondent returned no userId");
        }
      }

      const fqUserId = child.flexiquiz_user_id;

      // ── Step 2: Assign quizzes ──
      if (groupId) {
        // Assign via group
        try {
          await fqAssignGroup(fqUserId, groupId);
          console.log(
            `✅ Assigned group ${groupId} to ${child.username}`
          );
        } catch (groupErr) {
          console.warn(
            `⚠️ Group assignment failed for ${child.username}:`,
            groupErr.message
          );
          // Fall back to individual quiz assignment
          for (const quizId of quizIds) {
            try {
              await fqAssignQuiz(fqUserId, quizId);
              console.log(
                `✅ Assigned quiz ${quizId} to ${child.username}`
              );
            } catch (quizErr) {
              console.warn(
                `⚠️ Quiz ${quizId} assignment failed for ${child.username}:`,
                quizErr.message
              );
            }
          }
        }
      } else if (quizIds.length > 0) {
        // Assign individual quizzes
        for (const quizId of quizIds) {
          try {
            await fqAssignQuiz(fqUserId, quizId);
            console.log(
              `✅ Assigned quiz ${quizId} to ${child.username}`
            );
          } catch (quizErr) {
            console.warn(
              `⚠️ Quiz ${quizId} assignment failed for ${child.username}:`,
              quizErr.message
            );
          }
        }
      }

      // ── Step 3: Verify assignment (optional) ──
      try {
        const fqUser = await fqGetUser(fqUserId);
        const assignedQuizIds = (fqUser?.quizzes || []).map(
          (q) => q.quiz_id || q.quizId
        );
        const missing = quizIds.filter(
          (qid) => !assignedQuizIds.includes(qid)
        );
        if (missing.length > 0) {
          console.warn(
            `⚠️ ${child.username} missing quizzes after assignment:`,
            missing
          );
        }
      } catch (verifyErr) {
        console.warn(
          `⚠️ Could not verify assignment for ${child.username}:`,
          verifyErr.message
        );
      }
    } catch (fqErr) {
      // FlexiQuiz failed — log it but DON'T skip child activation
      flexiquizSuccess = false;
      console.error(
        `⚠️ FlexiQuiz provisioning failed for ${child.username}:`,
        fqErr.message
      );
      errors.push(
        `Child ${childId} (${child.username}): FlexiQuiz error - ${fqErr.message}`
      );
    }

    // ────────────────────────────────────────
    // ✅ Step 4: ALWAYS update child status to 'active'
    // This runs regardless of FlexiQuiz success/failure
    // ────────────────────────────────────────
    try {
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_quiz_ids: { $each: quizIds },
          entitled_bundle_ids: purchase.bundle_id,
        },
      });
      console.log(
        `✅ Child ${child.username} status → active` +
          (flexiquizSuccess ? "" : " (FlexiQuiz pending)")
      );
    } catch (updateErr) {
      console.error(
        `❌ Failed to update child ${child.username} status:`,
        updateErr.message
      );
      errors.push(`Child ${childId}: DB update failed - ${updateErr.message}`);
    }
  }

  // ── Step 5: Mark purchase as provisioned ──
  // Mark provisioned even if FlexiQuiz had issues (child is active, quizzes can be retried)
  const hasOnlyFlexiQuizErrors =
    errors.length > 0 && errors.every((e) => e.includes("FlexiQuiz"));

  if (errors.length === 0 || hasOnlyFlexiQuizErrors) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: {
        provisioned: true,
        provisioned_at: new Date(),
        provision_error:
          errors.length > 0 ? errors.join("; ") : null,
      },
    });
    console.log(
      `✅ Purchase ${purchaseId} provisioned` +
        (hasOnlyFlexiQuizErrors
          ? " (with FlexiQuiz warnings)"
          : " successfully")
    );
    return { success: true };
  } else {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provision_error: errors.join("; ") },
    });
    console.error(
      `⚠️ Purchase ${purchaseId} partially provisioned. Errors:`,
      errors
    );
    return { success: false, error: errors.join("; ") };
  }
}

module.exports = { provisionPurchase };