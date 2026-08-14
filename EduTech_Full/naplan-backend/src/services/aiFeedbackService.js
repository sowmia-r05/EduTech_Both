/**
 * services/aiFeedbackService.js  (v5 — NO PYTHON IN THIS FILE)
 *
 * DATA STORAGE RULES (enforced by isWriting flag):
 *   - Non-writing (MCQ/Reading/Numeracy/Language): saved to QuizAttempt ONLY
 *   - Writing: saved to Writing collection ONLY, QuizAttempt is deleted after sync
 *
 * WHY this separation:
 *   - MCQ attempts have a score, topic_breakdown, and ai_feedback all in one doc
 *   - Writing attempts have free-text answers, no numeric score, AI evaluates the essay
 *     and the result is stored differently (criteria scores, not topic scores)
 *   - Writing data MUST NOT stay in QuizAttempts because saveWritingToCollection()
 *     calls QuizAttempt.deleteOne() at the end — mixing them would cause data loss
 *
 * Status lifecycle:
 *   MCQ:     queued → generating → done | error  (in QuizAttempt)
 *   Writing: queued → generating → done | error  (in Writing collection)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v5 CHANGE — THE WRITING PATH NO LONGER FORKS PYTHON EITHER
 *
 * WHAT CHANGED
 *   runWritingPythonModule() is GONE, along with the last spawn() in this file.
 *   The writing branch now awaits services/geminiWritingEval.js, a faithful
 *   Node port of ai/gemini_writing_eval.py (plus the parts of naplan_scoring.py,
 *   text_cleaning.py and gemini_config.py it depended on).
 *
 *   With that, `spawn`, `PYTHON_BIN`, `BACKEND_ROOT`, `path` and
 *   `runWithPythonLimit` are all unused here and have been removed.
 *
 * WHY
 *   Both AI paths in this file used to fork a Python interpreter. Each fork
 *   loads the interpreter plus the Gemini SDK (~150-200MB RSS), so
 *   MAX_CONCURRENT_PYTHON had to be 1 on a small instance — one job at a time,
 *   with a wait-queue of 10 before PythonBusyError/503. For writing that meant a
 *   class of 30 students finishing an essay together would see most of them fail
 *   to get feedback.
 *
 *   Each script's only network operation was a single HTTPS POST to
 *   generativelanguage.googleapis.com. Node makes that call natively. With no
 *   process to fork there is nothing to serialise, so feedback concurrency is
 *   now bounded by the event loop and the Gemini API quota, not by RAM.
 *
 * WHAT DID NOT CHANGE
 *   - Both payload builders are byte-identical.
 *   - Both result shapes are identical, so updateAttemptWithFeedback(),
 *     saveWritingToCollection() and every downstream reader are untouched.
 *   - Prompts, scoring, band thresholds and fallbacks are ported verbatim.
 *     Marks should not move.
 *
 * ⚠️ DO NOT DELETE utils/pythonSpawnLimiter.js
 *   This file no longer imports it, but four other services still do:
 *   subjectFeedbackService, resultAiService, cumulativeFeedbackService, and the
 *   two explanation routes. They remain on Python and still need the shared
 *   ceiling. Deleting the limiter would let those spawn unbounded and OOM the
 *   instance.
 *
 *   Note the consequence of this change: submissions no longer consume Python
 *   slots at all, so the tutor-chat and cumulative-feedback paths — unchanged
 *   in themselves — should get noticeably faster under load, because they are
 *   no longer queueing behind every quiz submission on the box.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OTHER FIXES (retained from v3):
 *   1. Cross-instance duplicate guard. The old in-memory Set only stopped
 *      duplicates within ONE process — useless behind a load balancer with
 *      >= 2 instances, where the same submission hitting two instances would
 *      run the whole pipeline twice (double Gemini spend + a race on the doc).
 *      triggerAiFeedback acquires the attempt with an ATOMIC Mongo
 *      findOneAndUpdate that flips ai_feedback_meta.status → "generating" only
 *      if it isn't already generating (or the lock has gone stale). Whoever
 *      wins the flip owns the job; every other caller gets null and bails.
 *      This is what makes the web tier safe to run stateless with >= 2
 *      instances. No Redis required — the status transition IS the lock, and
 *      generated_at is its heartbeat.
 *   2. QuizAttempt snapshot is fetched BEFORE the AI call (safe from deletion)
 *   3. question_text is enriched from Question collection BEFORE building payload
 */

const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");
const Child = require("../models/child");
const Question = require("../models/question");
const {
  sendQuizCompletionEmail,
  checkNotificationEligibility,
} = require("./emailNotifications");

const { triggerCumulativeFeedback } = require("./cumulativeFeedbackService");

// ✅ v4: Node port of subject_feedback/gemini_subject_feedback.py (MCQ path).
const { generateSubjectFeedback } = require("./geminiSubjectFeedback");

// ✅ v5: Node port of ai/gemini_writing_eval.py (writing path).
const { evaluateNaplanWriting } = require("./geminiWritingEval");

// ─── Config ───
// FEEDBACK_TIMEOUT_MS is retained ONLY as the basis for LOCK_STALE_MS below.
// The per-request timeouts now live inside each Gemini client module
// (GEMINI_TIMEOUT_MS), since there is no longer a spawn to time out.
const FEEDBACK_TIMEOUT_MS = 120000; // 2 min

// ─── Startup diagnostic ───
console.log(`🔑 GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}`);
console.log(`⚡ MCQ feedback:     direct Node → Gemini (no subprocess)`);
console.log(`⚡ Writing feedback: direct Node → Gemini (no subprocess)`);

// ─────────────────────────────────────────────────────────────
// FIX 1: Cross-instance duplicate guard via an ATOMIC Mongo lock.
//
// acquireAttemptLock() atomically flips ai_feedback_meta.status → "generating"
// ONLY if it isn't already generating (or the existing lock is older than
// LOCK_STALE_MS, i.e. a crashed run). Whoever wins the flip owns the job;
// everyone else gets null and bails. No Redis needed — Atlas gives us the
// atomicity for free.
//
// generated_at doubles as the lock heartbeat. We reuse it (rather than a new
// field) so this keeps working even if ai_feedback_meta is a strict subdocument
// that would silently strip an unknown field.
//
// The lock is SELF-RELEASING: writing any terminal status (done|error), or
// deleting the writing QuizAttempt, means the doc no longer matches
// status="generating", so the next call re-acquires cleanly. A run that dies
// without writing either is reclaimed automatically after LOCK_STALE_MS.
// ─────────────────────────────────────────────────────────────
const LOCK_STALE_MS = FEEDBACK_TIMEOUT_MS + 60000; // 3 min — longer than any AI call

async function acquireAttemptLock(attemptId) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  const locked = await QuizAttempt.findOneAndUpdate(
    {
      attempt_id: attemptId,
      $or: [
        { "ai_feedback_meta.status": { $ne: "generating" } },
        { "ai_feedback_meta.generated_at": { $lt: staleBefore } },
        { "ai_feedback_meta.generated_at": { $exists: false } },
      ],
    },
    {
      $set: {
        "ai_feedback_meta.status": "generating",
        "ai_feedback_meta.status_message": "Generating AI feedback...",
        "ai_feedback_meta.generated_at": new Date(), // heartbeat
      },
    },
    // NOTE: `new: true` is deprecated in current Mongoose in favour of
    // `returnDocument: "after"`. Swap it when you next touch this — it still
    // works today but will break on the next Mongoose major.
    { new: true }
  ).lean();

  return locked; // null → someone else owns it (or the attempt doesn't exist)
}

// ─────────────────────────────────────────────────────────────
// Payload builders
//
// UNCHANGED. Both still produce exactly the shapes the Python scripts read from
// stdin; the Node modules accept the same objects as function arguments.
// ─────────────────────────────────────────────────────────────
function buildSubjectFeedbackPayload({
  attemptId, quizName, subject, yearLevel, score,
  topicBreakdown, duration, scoredAnswers,
}) {
  const tb = {};
  if (topicBreakdown instanceof Map) {
    for (const [key, val] of topicBreakdown) {
      tb[key] = { scored: val.scored || 0, total: val.total || 0 };
    }
  } else if (topicBreakdown && typeof topicBreakdown === "object") {
    for (const [key, val] of Object.entries(topicBreakdown)) {
      tb[key] = { scored: val.scored || 0, total: val.total || 0 };
    }
  }

  return {
    doc: {
      response_id: attemptId,
      quiz_name: quizName,
      score: score || {},
      topicBreakdown: tb,
      duration: duration || 0,
      year_level: yearLevel,
      subject,
      questions: (scoredAnswers || []).map((a) => ({
        question_id: a.question_id,
        points_scored: a.points_scored || 0,
        points_available: a.points_available || 0,
        categories: [],
      })),
    },
  };
}

function buildWritingFeedbackPayload({ quizName, yearLevel, enrichedAnswers }) {
  const writingAnswers = (enrichedAnswers || []).filter(
    (a) => a.answer_text && a.answer_text.trim()
  );

  const writing_prompt = writingAnswers[0]?.question_text || quizName || "";
  const student_writing = writingAnswers.map((a) => a.answer_text).join("\n\n");

  console.log(`📝 Writing payload — prompt: "${writing_prompt.slice(0, 80)}", words: ${student_writing.split(/\s+/).filter(Boolean).length}`);

  return {
    student_year: yearLevel || 3,
    writing_prompt,
    student_writing,
  };
}

// ─────────────────────────────────────────────────────────────
// Save AI result to QuizAttempt (NON-WRITING / MCQ ONLY)
//
// Called ONLY when isWriting === false
// Stores: ai_feedback, ai_feedback_meta, performance_analysis, status="ai_done"
//
// Writing a terminal status here also RELEASES the distributed lock, because
// the doc no longer matches status="generating".
// ─────────────────────────────────────────────────────────────
async function updateAttemptWithFeedback(attemptId, feedbackResult) {
  const update = {};

  if (feedbackResult.success === true) {
    const generatedAt = feedbackResult.ai_feedback_meta?.generated_at
      ? new Date(feedbackResult.ai_feedback_meta.generated_at)
      : new Date();

    update.ai_feedback = feedbackResult.ai_feedback || {};
    update.ai_feedback_meta = {
      ...(feedbackResult.ai_feedback_meta || {}),
      generated_at: generatedAt,
      status: "done",
      status_message: "Feedback ready",
    };
    update.status = "ai_done";

    if (feedbackResult.performance_analysis) {
      update.performance_analysis = feedbackResult.performance_analysis;
    }
  } else {
    const errMsg = feedbackResult.error || "AI feedback generation failed";
    update.ai_feedback_meta = {
      status: "error",
      status_message: errMsg,
      generated_at: new Date(),
    };
  }

  await QuizAttempt.updateOne({ attempt_id: attemptId }, { $set: update });
}

// ─────────────────────────────────────────────────────────────
// Save AI result to Writing collection (WRITING ONLY)
//
// Called ONLY when isWriting === true
// After saving, the QuizAttempt is DELETED — writing data lives here permanently.
// Deleting the QuizAttempt also releases the distributed lock for that attempt.
// ─────────────────────────────────────────────────────────────
async function saveWritingToCollection({
  attemptId, quizId, quizName, yearLevel, childId,
  feedbackResult,
  attemptSnapshot,
  enrichedQna,
}) {
  try {
    if (!attemptSnapshot) {
      console.warn(`⚠️ saveWritingToCollection: no attemptSnapshot for ${attemptId}, skipping`);
      return;
    }

    const child = await Child.findById(childId).lean();

    const aiSuccess = feedbackResult?.success === true;
    const aiStatus = aiSuccess ? "done" : "error";
    const aiFeedback = feedbackResult?.result || null;
    const aiError = aiSuccess ? null : (feedbackResult?.error || "AI evaluation failed");

    await Writing.findOneAndUpdate(
      { response_id: attemptId },
      {
        $set: {
          // ─── Identifiers ───
          response_id: attemptId,
          attempt_id:  attemptId,

          // ─── Quiz ───
          quiz_id:    quizId,
          quiz_name:  quizName,
          subject:    "Writing",
          year_level: yearLevel,

          // ─── Ownership ───
          child_id:  childId,
          parent_id: attemptSnapshot.parent_id || null,

          // ─── Timing ───
          started_at:    attemptSnapshot.started_at   || null,
          submitted_at:  attemptSnapshot.submitted_at,
          expires_at:    attemptSnapshot.expires_at   || null,
          duration_sec:  attemptSnapshot.duration_sec,
          timer_expired: attemptSnapshot.timer_expired || false,

          // ─── Attempt tracking ───
          status:  "submitted",
          attempt: attemptSnapshot.attempt_number,

          // ─── Proctoring ───
          proctoring: attemptSnapshot.proctoring || null,

          // ─── Content ───
          qna: enrichedQna,

          // ─── User ───
          user: {
            user_name:     child?.username || null,
            first_name:    child?.display_name || "",
            last_name:     "",
            email_address: "",
          },

          // ─── AI ───
          ai: {
            status:       aiStatus,
            message:      aiSuccess ? "Evaluation complete" : aiError,
            evaluated_at: aiSuccess ? new Date() : null,
            feedback:     aiFeedback,
            error:        aiError,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Writing saved for attempt ${attemptId} — AI: ${aiStatus}`);

    // Delete QuizAttempt — writing data now fully lives in Writing collection
    await QuizAttempt.deleteOne({ attempt_id: attemptId });
    console.log(`🗑️ QuizAttempt deleted for writing attempt ${attemptId}`);

    // ✅ Send quiz completion email to parent (respects email_notifications checkbox)
    ;(async () => {
      try {
        const eligibility = await checkNotificationEligibility(childId);
        if (!eligibility.shouldSend) return; // ✅ checkbox off — skip silently
        const writingScore = aiSuccess && aiFeedback ? {
            points:    aiFeedback.overall?.total_score ?? null,
            available: aiFeedback.overall?.max_score   ?? null,
            band:      aiFeedback.overall?.band        || null,
            summary:   aiFeedback.overall?.summary     || null,
          } : null;

        await sendQuizCompletionEmail({
          parentEmail:    eligibility.parentEmail,
          childName:      eligibility.childName,
          quizName:       quizName || "Writing Quiz",
          score:          writingScore,         // writing has no instant score
          topicBreakdown: {},
          duration:       attemptSnapshot?.duration_sec,
          subject:        "Writing",
        });
        console.log(`📧 Writing completion email sent to ${eligibility.parentEmail} for ${eligibility.childName}`);
      } catch (emailErr) {
        console.error("⚠️ Writing completion email failed:", emailErr.message);
      }
    })();

  } catch (err) {
    console.error(`❌ saveWritingToCollection failed for ${attemptId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// syncWritingAttempt — kept for backward compat (admin retry)
// ─────────────────────────────────────────────────────────────
async function syncWritingAttempt(params) {
  const attempt = await QuizAttempt.findOne({ attempt_id: params.attemptId }).lean();
  if (!attempt) return;

  const aiMeta = attempt.ai_feedback_meta || {};
  const feedbackResult = aiMeta.status === "done"
    ? { success: true, result: attempt.ai_feedback || null }
    : { success: false, error: aiMeta.status_message || "Unknown error" };

  const scoredAnswers = params.scoredAnswers || [];
  const questionIds = scoredAnswers.map((a) => a.question_id).filter(Boolean);
  const questions = questionIds.length
    ? await Question.find({ question_id: { $in: questionIds } }).lean()
    : [];
  const qMap = Object.fromEntries(questions.map((q) => [q.question_id, q]));
  const enrichedQna = scoredAnswers.map((a) => ({
    question_id: a.question_id,
    type: "free_text",
    question_text: qMap[a.question_id]?.text || a.question_text || "",
    answer_text: a.text_answer || "",
  }));

  await saveWritingToCollection({
    ...params,
    feedbackResult,
    attemptSnapshot: attempt,
    enrichedQna,
  });
}

// ─────────────────────────────────────────────────────────────
// Main entry point — called from quizRoutes submit
//
// ROUTING LOGIC (the key decision point):
//   isWriting = true  → Writing pipeline → Writing collection → QuizAttempt deleted
//   isWriting = false → MCQ pipeline    → QuizAttempt only   → nothing deleted
// ─────────────────────────────────────────────────────────────
async function triggerAiFeedback(params) {
  const { attemptId, isWriting } = params;

  // FIX 1: Atomically acquire the attempt. If another call — on this or any
  // other instance — is already generating (and its lock isn't stale), we get
  // null and bail. This single op also performs the "mark generating" that the
  // old code did in a separate, non-atomic updateOne.
  const lock = await acquireAttemptLock(attemptId);
  if (!lock) {
    console.warn(`⚠️ triggerAiFeedback: lock held for ${attemptId} (already generating or attempt missing) — skipping duplicate`);
    return;
  }

  try {
    let result;

    if (isWriting) {
      // ═══════════════════════════════════════════════════════
      // WRITING PATH → result goes to Writing collection ONLY
      //
      // ✅ v5: direct Node → Gemini. No spawn, no pool, no queue, no 503.
      // ═══════════════════════════════════════════════════════

      // FIX 2: Fetch snapshot BEFORE the AI call, because
      // saveWritingToCollection() deletes the QuizAttempt afterwards.
      const attemptSnapshot = await QuizAttempt.findOne({ attempt_id: attemptId }).lean();
      if (!attemptSnapshot) {
        console.warn(`⚠️ triggerAiFeedback: QuizAttempt not found for ${attemptId}`);
        return;
      }

      // FIX 3: Enrich question_text BEFORE building payload
      const scoredAnswers = params.scoredAnswers || [];
      const questionIds = scoredAnswers.map((a) => a.question_id).filter(Boolean);
      const questions = questionIds.length
        ? await Question.find({ question_id: { $in: questionIds } }).lean()
        : [];
      const qMap = Object.fromEntries(questions.map((q) => [q.question_id, q]));

      const enrichedQna = scoredAnswers.map((a) => ({
        question_id: a.question_id,
        type: "free_text",
        question_text: qMap[a.question_id]?.text || a.question_text || "",
        answer_text: a.text_answer || "",
      }));

      const payload = buildWritingFeedbackPayload({
        quizName: params.quizName,
        yearLevel: params.yearLevel,
        enrichedAnswers: enrichedQna,
      });

      console.log(`🤖 Triggering writing AI feedback for attempt ${attemptId}`);

      // evaluateNaplanWriting never throws — on failure it returns a degraded
      // but structurally valid result (success:true with valid_response:false),
      // exactly as the Python did. The try/catch is a guard against an
      // unexpected programming error inside the module only.
      try {
        result = await evaluateNaplanWriting(payload);
        console.log(`⚡ Writing result: success=${result?.success}, has_result=${!!result?.result}`);
      } catch (aiErr) {
        console.error(`❌ Writing evaluation FULL ERROR: ${aiErr.message}`);
        result = { success: false, error: aiErr.message };
      }

      // Save to Writing collection — QuizAttempt deleted inside saveWritingToCollection
      // (which also releases the distributed lock for this attempt).
      await saveWritingToCollection({
        ...params,
        feedbackResult: result,
        attemptSnapshot,
        enrichedQna,
      });

    } else {
      // ═══════════════════════════════════════════════════════
      // MCQ PATH → result goes to QuizAttempt ONLY
      // (Reading, Numeracy, Language, any non-writing subject)
      //
      // ✅ v4: direct Node → Gemini. No spawn, no pool, no queue, no 503.
      //    generateSubjectFeedback resolves with {success:false, error} rather
      //    than throwing, so the shape below is guaranteed either way; the
      //    try/catch stays only as a guard against an unexpected throw.
      // ═══════════════════════════════════════════════════════
      const payload = buildSubjectFeedbackPayload(params);
      console.log(`🤖 Triggering subject AI feedback for attempt ${attemptId}`);

      try {
        result = await generateSubjectFeedback(payload);
      } catch (aiErr) {
        console.warn(`⚠️ Subject feedback failed: ${aiErr.message}`);
        result = { success: false, error: `Subject feedback failed: ${aiErr.message}` };
      }

      // Save ai_feedback + ai_feedback_meta + performance_analysis to QuizAttempt.
      // Writing a terminal status (done|error) here releases the distributed lock.
      await updateAttemptWithFeedback(attemptId, result);
    }

    if (result.success) {
      console.log(`✅ AI feedback done for attempt ${attemptId}`);
    } else {
      console.warn(`⚠️ AI feedback issues for attempt ${attemptId}: ${result.error}`);
    }

    // Trigger cumulative feedback regeneration (fire-and-forget).
    // NOTE: this one is STILL Python (cumulativeFeedbackService), so it still
    // takes a slot from the shared pool. It runs off the request path, so a
    // busy pool delays the cumulative report rather than the student's result.
    if (result.success && params.childId) {
      setImmediate(() => {
        triggerCumulativeFeedback(params.childId).catch((e) =>
          console.warn(`⚠️ Cumulative feedback failed for child ${params.childId}:`, e.message)
        );
      });
    }

  } catch (err) {
    console.error(`❌ AI feedback failed for attempt ${attemptId}:`, err.message);

    // Only update QuizAttempt on error for MCQ — writing QuizAttempt may already
    // be deleted. Writing "error" (a non-generating status) also RELEASES the
    // distributed lock. A run that dies before writing any terminal status is
    // reclaimed automatically after LOCK_STALE_MS, so no finally/unlock is needed.
    if (!isWriting) {
      await QuizAttempt.updateOne(
        { attempt_id: attemptId },
        {
          $set: {
            "ai_feedback_meta.status": "error",
            "ai_feedback_meta.status_message": `Feedback generation error: ${err.message}`,
            "ai_feedback_meta.generated_at": new Date(),
          },
        }
      ).catch(() => {});
    }
  }
}

module.exports = { triggerAiFeedback, syncWritingAttempt };