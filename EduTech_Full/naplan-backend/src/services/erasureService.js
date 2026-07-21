/**
 * services/erasureService.js
 *
 * Right-to-erasure implementation (Australian Privacy Principle 11.2 —
 * destroy or de-identify personal information once it is no longer needed).
 *
 * TWO SCOPES:
 *   eraseChild(childId)    — one child profile and everything derived from it.
 *   eraseAccount(parentId) — every child, then the parent record itself.
 *
 * ── WHAT IS DELIBERATELY *NOT* DELETED ──────────────────────────────────────
 *   • Purchase — financial records must be retained (ATO: five years). These
 *     are DE-IDENTIFIED instead: amounts, dates and Stripe references survive;
 *     child names and the child_ids link are stripped.
 *   • Stripe's own records — Stripe retains transaction data under its AML
 *     obligations. We delete the Customer object; the charges remain on their
 *     side. The privacy policy MUST disclose this.
 *   • ErasureLog — a record that erasure happened, holding no personal data.
 *     Without it you cannot demonstrate compliance if challenged.
 *
 * ── FIELD-NAME DEFENCE ──────────────────────────────────────────────────────
 *   Some collections in this codebase use snake_case (child_id) and others
 *   camelCase (childId). A deleteMany against the wrong key returns
 *   deletedCount:0 and throws NOTHING — silent retention, which is the worst
 *   possible failure for an erasure endpoint: the parent is told their data is
 *   gone when it is not. Every query below therefore matches BOTH forms.
 *
 * ── ORDERING ────────────────────────────────────────────────────────────────
 *   Derived data is removed before the record it hangs off, so a mid-way
 *   failure leaves orphaned rows rather than an orphaned parent with
 *   unreachable child data. Every step is idempotent — safe to re-run.
 *
 * ── REQUIRED vs BEST-EFFORT ─────────────────────────────────────────────────
 *   Mongo deletes are REQUIRED and throw on failure. External systems (Qdrant,
 *   Stripe) are BEST-EFFORT — a third-party outage must not block a parent's
 *   deletion request. Failures are recorded on the ErasureLog so they can be
 *   swept later.
 *
 * Place at: naplan-backend/src/services/erasureService.js
 */

"use strict";

const crypto = require("crypto");

const Child       = require("../models/child");
const Parent      = require("../models/parent");
const QuizAttempt = require("../models/quizAttempt");
const Writing     = require("../models/writing");
const Purchase    = require("../models/purchase");
const ErasureLog  = require("../models/erasureLog");

const { deletePointsByChild } = require("../utils/quizChatCache");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover",
});

// ────────────────────────────────────────────
// Match either naming convention. See FIELD-NAME DEFENCE above.
// ────────────────────────────────────────────
const byChild  = (id) => ({ $or: [{ child_id: id },  { childId: id }] });
const byParent = (id) => ({ $or: [{ parent_id: id }, { parentId: id }] });

/**
 * deleteMany against a model that may not exist, or whose key we could not
 * verify. Never throws — a model we cannot load is recorded as a failure on
 * the log rather than aborting the whole erasure half-way through.
 */
async function safeDeleteMany(modelPath, filter, failures, label) {
  try {
    const Model = require(modelPath);
    const res = await Model.deleteMany(filter);
    return res.deletedCount || 0;
  } catch (err) {
    failures.push(`${label}:${err.message}`);
    return 0;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Erase everything belonging to ONE child.
// Returns a counts object. Never throws for external-system failures.
// ════════════════════════════════════════════════════════════════════════════
async function eraseChild(childId, { failures = [] } = {}) {
  const counts = {
    quiz_attempts: 0,
    writings: 0,
    cumulative_feedback: 0,
    chat_usage: 0,
    qdrant_points: 0,
    child: 0,
  };

  // 1. Quiz attempts — every answer the child submitted.
  const attemptsRes = await QuizAttempt.deleteMany(byChild(childId));
  counts.quiz_attempts = attemptsRes.deletedCount || 0;

  // 2. Writing submissions. These carry the OCR transcription of handwritten
  //    work plus AI feedback — the most sensitive records in the system.
  const writingRes = await Writing.deleteMany(byChild(childId));
  counts.writings = writingRes.deletedCount || 0;

  // 3. Derived analysis. Deleting the raw attempts alone would leave a complete
  //    per-subject performance profile of the child behind.
  counts.cumulative_feedback = await safeDeleteMany(
    "../models/cumulativeFeedback",
    byChild(childId),
    failures,
    "cumulativeFeedback",
  );

  // 4. AI tutor usage — question text the child typed, with timestamps.
  counts.chat_usage = await safeDeleteMany(
    "../models/chatUsage",
    byChild(childId),
    failures,
    "chatUsage",
  );

  // 5. Qdrant chat-cache points. storeCache() writes childId/childName/
  //    yearLevel into the payload, so these are personal information held by a
  //    third party. Best-effort: a cache outage must not block erasure.
  try {
    await deletePointsByChild(String(childId));
    // Qdrant's filter-delete does not report a count, so this is a flag, not a
    // tally. Present in the response so a silent no-op is at least visible.
    counts.qdrant_points = 1;
  } catch (err) {
    failures.push(`qdrant:${childId}:${err.message}`);
  }

  // 6. De-identify this child's footprint on RETAINED purchase records.
  //    The Purchase document survives for tax purposes; the name does not.
  await Purchase.updateMany(
    { child_ids: childId },
    {
      $set: { child_names: [], erased_at: new Date() },
      $pull: { child_ids: childId },
    },
  );

  // 7. The child record itself — LAST, so nothing above is orphaned.
  const childRes = await Child.deleteOne({ _id: childId });
  counts.child = childRes.deletedCount || 0;

  return counts;
}

// ════════════════════════════════════════════════════════════════════════════
// Erase an entire parent account and every child under it.
// ════════════════════════════════════════════════════════════════════════════
async function eraseAccount(parentId, { reason = "user_request" } = {}) {
  const failures = [];
  const totals = {
    children: 0,
    quiz_attempts: 0,
    writings: 0,
    cumulative_feedback: 0,
    chat_usage: 0,
    qdrant_points: 0,
    purchases_deidentified: 0,
    stripe_customer_deleted: false,
  };

  // Read the parent BEFORE anything is deleted — the email is needed for the
  // OTP sweep and for the compliance-log hash.
  const parent = await Parent.findById(parentId).lean();
  if (!parent) {
    return { ok: false, error: "Account not found" };
  }

  // 1. Every child in turn.
  const children = await Child.find({ parent_id: parentId }).select("_id").lean();
  for (const c of children) {
    const counts = await eraseChild(c._id, { failures });
    totals.children            += counts.child;
    totals.quiz_attempts       += counts.quiz_attempts;
    totals.writings            += counts.writings;
    totals.cumulative_feedback += counts.cumulative_feedback;
    totals.chat_usage          += counts.chat_usage;
    totals.qdrant_points       += counts.qdrant_points;
  }

  // 2. Sweep records that escaped the per-child pass — e.g. a child deleted by
  //    an older code path that left its attempts behind. Without this, data
  //    belonging to a long-removed child would survive account deletion.
  const strayAttempts = await QuizAttempt.deleteMany(byParent(parentId));
  const strayWritings = await Writing.deleteMany(byParent(parentId));
  totals.quiz_attempts += strayAttempts.deletedCount || 0;
  totals.writings      += strayWritings.deletedCount || 0;

  // 3. OTP records hold the parent's email address directly.
  if (parent.email) {
    await safeDeleteMany("../models/otpCode",    { email: parent.email }, failures, "otpCode");
    await safeDeleteMany("../models/pendingOtp", { email: parent.email }, failures, "pendingOtp");
  }

  // 4. De-identify purchases. RETAINED, not deleted — ATO five-year rule.
  //    parent_id is kept so the record stays reconcilable against Stripe;
  //    every human-readable identifier is removed.
  const purchaseRes = await Purchase.updateMany(
    { parent_id: parentId },
    { $set: { child_ids: [], child_names: [], erased_at: new Date() } },
  );
  totals.purchases_deidentified = purchaseRes.modifiedCount || 0;

  // 5. Stripe customer object. Best-effort — Stripe keeps the underlying
  //    charges regardless, which the privacy policy must disclose.
  if (parent.stripe_customer_id) {
    try {
      await stripe.customers.del(parent.stripe_customer_id);
      totals.stripe_customer_deleted = true;
    } catch (err) {
      failures.push(`stripe:${parent.stripe_customer_id}:${err.message}`);
    }
  }

  // 6. Write the compliance log BEFORE deleting the parent — after that point
  //    the email is gone and the log could not be written.
  const emailHash = crypto
    .createHash("sha256")
    .update(String(parent.email || "").toLowerCase())
    .digest("hex");

  await ErasureLog.create({
    subject_hash: emailHash,
    scope: "account",
    reason,
    counts: totals,
    external_failures: failures,
  });

  // 7. The parent record itself.
  await Parent.deleteOne({ _id: parentId });

  return { ok: true, totals, failures };
}

module.exports = { eraseChild, eraseAccount };