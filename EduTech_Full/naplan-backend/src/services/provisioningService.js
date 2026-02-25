/**
 * src/services/provisioningService.js
 *
 * Triggered after a successful Stripe payment.
 * For each child in the purchase:
 *   1. Ensure child has a FlexiQuiz user (should already exist from child creation)
 *   2. Assign purchased quizzes (or group) to the FlexiQuiz user
 *   3. Update child status from 'trial' → 'active'
 *   4. Mark purchase as provisioned
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
    return { success: false, error: `Purchase status is '${purchase.status}', expected 'paid'` };
  }

  // Fetch the bundle
  const bundle = await QuizCatalog.findOne({ bundle_id: purchase.bundle_id });
  if (!bundle) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provision_error: `Bundle '${purchase.bundle_id}' not found in quiz_catalog` },
    });
    return { success: false, error: `Bundle '${purchase.bundle_id}' not found` };
  }

  const quizIds = bundle.flexiquiz_quiz_ids || [];
  const groupId = bundle.flexiquiz_group_id || null;

  // Fetch parent for email context
  const parent = await Parent.findById(purchase.parent_id).lean();

  const errors = [];

  for (const childId of purchase.child_ids) {
    try {
      const child = await Child.findById(childId);
      if (!child) {
        errors.push(`Child ${childId} not found`);
        continue;
      }

      // ── Step 1: Ensure child has FlexiQuiz account ──
      if (!child.flexiquiz_user_id) {
        // Create FlexiQuiz user (shouldn't normally happen since we create at child add)
        console.log(`⚠️ Child ${child.username} missing FlexiQuiz user, creating now...`);
        const fqResult = await registerRespondent({
          firstName: child.display_name,
          lastName: parent?.lastName || "",
          yearLevel: child.year_level,
          email: parent?.email || "",
          username: child.username,
          sendWelcomeEmail: false,
        });

        if (!fqResult?.user_id) {
          errors.push(`Failed to create FlexiQuiz user for ${child.username}`);
          continue;
        }

        let encPw = null;
        try {
          if (fqResult.password) encPw = encryptPassword(fqResult.password);
        } catch (e) {
          console.error("Password encryption warning:", e.message);
        }

        child.flexiquiz_user_id = fqResult.user_id;
        child.flexiquiz_password_enc = encPw;
        child.flexiquiz_provisioned_at = new Date();
        await child.save();
      }

      const fqUserId = child.flexiquiz_user_id;

      // ── Step 2: Assign quizzes or group ──
      if (groupId) {
        // Group-based assignment (1 API call)
        await fqAssignGroup(fqUserId, groupId);
        console.log(`✅ Assigned group ${groupId} to ${child.username}`);
      } else {
        // Individual quiz assignment
        for (const qid of quizIds) {
          try {
            await fqAssignQuiz(fqUserId, qid);
            console.log(`✅ Assigned quiz ${qid} to ${child.username}`);
          } catch (assignErr) {
            // 409 = already assigned (idempotent)
            if (assignErr?.response?.status === 409) {
              console.log(`ℹ️ Quiz ${qid} already assigned to ${child.username}`);
            } else {
              console.error(`❌ Failed to assign quiz ${qid} to ${child.username}:`, assignErr.message);
              errors.push(`Quiz ${qid} assignment failed for ${child.username}`);
            }
          }
        }
      }

      // ── Step 3: Verify assignment (optional but recommended) ──
      try {
        const fqUser = await fqGetUser(fqUserId);
        const assignedQuizIds = (fqUser?.quizzes || []).map((q) => q.quiz_id || q.quizId);
        const missing = quizIds.filter((qid) => !assignedQuizIds.includes(qid));
        if (missing.length > 0) {
          console.warn(`⚠️ ${child.username} missing quizzes after assignment:`, missing);
        }
      } catch (verifyErr) {
        console.warn(`⚠️ Could not verify assignment for ${child.username}:`, verifyErr.message);
      }

      // ── Step 4: Update child status to 'active' ──
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_quiz_ids: { $each: quizIds },
          entitled_bundle_ids: purchase.bundle_id,
        },
      });

      console.log(`✅ Child ${child.username} status → active`);
    } catch (childErr) {
      console.error(`❌ Provisioning failed for child ${childId}:`, childErr.message);
      errors.push(`Child ${childId}: ${childErr.message}`);
    }
  }

  // ── Step 5: Mark purchase as provisioned ──
  if (errors.length === 0) {
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: {
        provisioned: true,
        provisioned_at: new Date(),
        provision_error: null,
      },
    });
    console.log(`✅ Purchase ${purchaseId} fully provisioned`);
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