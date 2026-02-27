/**
 * src/services/provisioningService.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Triggered after successful Stripe payment.
 * ═══════════════════════════════════════════════════════════════
 *
 * IMPORTANT: FlexiQuiz has TWO different IDs per quiz:
 *   - embed_id  → for iframe display (stored in quizMap.js / quiz_catalog)
 *   - quiz_id   → for API calls like assign/unassign
 *
 * This service AUTO-RESOLVES API quiz IDs by:
 *   1. Fetching all quizzes from FlexiQuiz API (GET /v1/quizzes)
 *   2. Matching them to our quiz names from quizMap.js
 *   3. Assigning using the correct API quiz IDs
 *   4. Storing embed IDs on child record (for frontend display)
 *
 * Idempotent: running twice produces the same result.
 */

const mongoose = require("mongoose");
const Child = require("../models/child");
const Purchase = require("../models/purchase");
const QuizCatalog = require("../models/quizCatalog");
const {
  fqAssignQuiz,
  fqGetUser,
  registerRespondent,
} = require("./flexiQuizUsersService");
const { encryptPassword } = require("../utils/flexiquizCrypto");
const Parent = require("../models/parent");

// ── Import quizMap for name-based matching ──
const { QUIZ_MAP } = require("../data/quizMap");

// ── FlexiQuiz API direct access for quiz listing ──
const axios = require("axios");
const FQ_BASE = "https://www.flexiquiz.com/api/v1";
const API_KEY = process.env.FLEXIQUIZ_API_KEY;

// ═══════════════════════════════════════════════════════════════
// In-memory cache for FlexiQuiz quiz list (refreshes every 10 min)
// ═══════════════════════════════════════════════════════════════

let _fqQuizCache = null;
let _fqQuizCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch all quizzes from FlexiQuiz API (cached).
 * Returns array of { quiz_id, name, status, ... }
 */
async function fetchFlexiQuizList() {
  const now = Date.now();
  if (_fqQuizCache && (now - _fqQuizCacheTime) < CACHE_TTL_MS) {
    return _fqQuizCache;
  }

  console.log("  📡 Fetching quiz list from FlexiQuiz API...");
  const res = await axios.get(`${FQ_BASE}/quizzes`, {
    headers: { "X-API-KEY": API_KEY },
    timeout: 20000,
  });

  _fqQuizCache = Array.isArray(res.data) ? res.data : [];
  _fqQuizCacheTime = now;
  console.log(`  📡 Found ${_fqQuizCache.length} quizzes on FlexiQuiz`);
  return _fqQuizCache;
}

// ═══════════════════════════════════════════════════════════════
// Name matching: embed_id → API quiz_id
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize quiz name for fuzzy matching.
 */
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/year\s*3/g, "year3")
    .replace(/year\s*5/g, "year5")
    .replace(/year\s*7/g, "year7")
    .replace(/year\s*9/g, "year9")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Calculate match score between two quiz names.
 */
function nameMatchScore(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 100;
  if (n1.includes(n2) || n2.includes(n1)) return 80;

  const words1 = name1.toLowerCase().replace(/&/g, "and").split(/\s+/);
  const words2 = name2.toLowerCase().replace(/&/g, "and").split(/\s+/);
  let shared = 0;
  for (const w of words1) {
    if (w.length > 2 && words2.some((w2) => w2.includes(w) || w.includes(w2))) {
      shared++;
    }
  }
  return Math.round((shared / Math.max(words1.length, words2.length)) * 60);
}

/**
 * Given an array of embed_ids, resolve them to FlexiQuiz API quiz_ids
 * by looking up the quiz name in quizMap.js and matching against
 * the FlexiQuiz API quiz list.
 *
 * Returns: Map<embed_id, api_quiz_id>
 */
async function resolveApiQuizIds(embedIds) {
  // Build embed_id → quiz_name lookup from quizMap
  const embedToName = {};
  for (const [year, tiers] of Object.entries(QUIZ_MAP)) {
    for (const [tier, quizzes] of Object.entries(tiers)) {
      for (const q of quizzes) {
        // quizMap stores embed_id as "quiz_id"
        embedToName[q.quiz_id] = q.quiz_name;
      }
    }
  }

  // Fetch all quizzes from FlexiQuiz API
  const fqQuizzes = await fetchFlexiQuizList();

  // Match each embed_id to an API quiz_id by name
  const result = new Map();

  for (const embedId of embedIds) {
    const ourName = embedToName[embedId];
    if (!ourName) {
      console.warn(`  ⚠️ No quiz name found in quizMap for embed_id: ${embedId}`);
      continue;
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const fq of fqQuizzes) {
      const score = nameMatchScore(ourName, fq.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = fq;
      }
    }

    if (bestScore >= 40 && bestMatch) {
      result.set(embedId, bestMatch.quiz_id);
      console.log(`  🔗 "${ourName}" → API: ${bestMatch.quiz_id} (${bestMatch.name}) [score: ${bestScore}]`);
    } else {
      console.warn(`  ❌ No match for "${ourName}" (best score: ${bestScore})`);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Quiz dedup helpers
// ═══════════════════════════════════════════════════════════════

function getNewEmbedIds(child, bundle) {
  const existing = new Set(child.entitled_quiz_ids || []);
  const bundleIds = bundle.flexiquiz_quiz_ids || [];
  return bundleIds.filter((id) => !existing.has(id));
}

// ═══════════════════════════════════════════════════════════════
// Main provisioning function
// ═══════════════════════════════════════════════════════════════

async function provisionPurchase(purchaseId) {
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
      $set: { provision_error: `Bundle '${purchase.bundle_id}' not found in quiz_catalog` },
    });
    return { success: false, error: `Bundle '${purchase.bundle_id}' not found` };
  }

  const allEmbedIds = bundle.flexiquiz_quiz_ids || [];

  if (allEmbedIds.length === 0) {
    console.error(`❌ Bundle '${bundle.bundle_id}' has 0 embed IDs. Run seedBundles.js first.`);
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provisioned: false, provision_error: `Bundle has 0 quiz IDs` },
    });
    return { success: false, error: "Bundle has no quiz IDs" };
  }

  // ── AUTO-RESOLVE: Fetch API quiz IDs from FlexiQuiz by matching names ──
  console.log(`\n🔄 Auto-resolving API quiz IDs for bundle: ${bundle.bundle_id}`);
  let embedToApiMap;
  try {
    embedToApiMap = await resolveApiQuizIds(allEmbedIds);
  } catch (err) {
    console.error(`❌ Failed to fetch FlexiQuiz quiz list: ${err.message}`);
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provisioned: false, provision_error: `FlexiQuiz API unreachable: ${err.message}` },
    });
    return { success: false, error: `FlexiQuiz API unreachable: ${err.message}` };
  }

  if (embedToApiMap.size === 0) {
    console.error(`❌ Could not resolve any API quiz IDs for bundle '${bundle.bundle_id}'`);
    await Purchase.findByIdAndUpdate(purchaseId, {
      $set: { provisioned: false, provision_error: "No quiz name matches found on FlexiQuiz" },
    });
    return { success: false, error: "No quiz name matches found on FlexiQuiz" };
  }

  const allApiQuizIds = [...embedToApiMap.values()];
  console.log(`  ✅ Resolved ${embedToApiMap.size} of ${allEmbedIds.length} quizzes to API IDs`);

  // ── Also cache the API IDs back to quiz_catalog for future reference ──
  try {
    await QuizCatalog.updateOne(
      { _id: bundle._id },
      { $set: { flexiquiz_api_quiz_ids: allApiQuizIds } }
    );
  } catch (cacheErr) {
    console.warn(`  ⚠️ Could not cache API IDs to quiz_catalog: ${cacheErr.message}`);
  }

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
      `\n── Provisioning ${child.username} (Tier ${bundle.tier}, Year ${bundle.year_level}) ──`
    );

    try {
      // ── Step 1: Ensure child has FlexiQuiz account ──
      if (!child.flexiquiz_user_id) {
        console.log(`  ⚠️ Child ${child.username} has no FlexiQuiz account, creating...`);
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

      // ── Step 2: Assign quizzes using API quiz IDs ──
      // Figure out which API quiz IDs are new for this child
      const childExistingApiIds = new Set(child.entitled_api_quiz_ids || []);
      const newApiIds = allApiQuizIds.filter((id) => !childExistingApiIds.has(id));

      if (newApiIds.length === 0) {
        console.log(`  ℹ️ No new quizzes to assign (all already assigned)`);
      } else {
        let assignSuccess = 0;
        let assignFail = 0;

        for (const apiQuizId of newApiIds) {
          try {
            await fqAssignQuiz(fqUserId, apiQuizId);
            console.log(`  ✅ Assigned quiz ${apiQuizId}`);
            assignSuccess++;
          } catch (quizErr) {
            const status = quizErr.response?.status;
            const body = quizErr.response?.data;
            console.error(
              `  ❌ Quiz ${apiQuizId} failed: status=${status} body=${JSON.stringify(body)}`
            );
            errors.push(`Quiz ${apiQuizId} assignment failed: ${quizErr.message}`);
            assignFail++;
          }
        }

        console.log(`  📊 Assignment: ${assignSuccess} success, ${assignFail} failed`);
      }

      // ── Step 3: Verify assignment on FlexiQuiz ──
      try {
        const fqUser = await fqGetUser(fqUserId);
        const assignedIds = (fqUser?.quizzes || []).map((q) => q.quiz_id || q.quizId);
        const missing = allApiQuizIds.filter((qid) => !assignedIds.includes(qid));
        if (missing.length > 0) {
          console.warn(`  ⚠️ ${child.username} missing ${missing.length} quizzes after assignment`);
        } else {
          console.log(`  ✅ Verified: ${child.username} has all ${allApiQuizIds.length} quizzes on FlexiQuiz`);
        }
      } catch (verifyErr) {
        console.warn(`  ⚠️ Verification skipped: ${verifyErr.message}`);
      }
    } catch (fqErr) {
      console.error(`  ❌ FlexiQuiz error for ${child.username}: ${fqErr.message}`);
      errors.push(`FlexiQuiz error for ${child.username}: ${fqErr.message}`);
    }

    // ── Step 4: Update child record in our DB ──
    // entitled_quiz_ids     = embed IDs (frontend uses for display)
    // entitled_api_quiz_ids = API IDs (for future re-assignment)
    try {
      await Child.findByIdAndUpdate(childId, {
        $set: { status: "active" },
        $addToSet: {
          entitled_bundle_ids: purchase.bundle_id,
          entitled_quiz_ids: { $each: allEmbedIds },
          entitled_api_quiz_ids: { $each: allApiQuizIds },
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
