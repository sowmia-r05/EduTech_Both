/**
 * services/aiFeedbackService.js  (v2 — robust Python JSON parser)
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
 * FIXES:
 *   1. In-memory lock prevents duplicate triggerAiFeedback calls for same attempt
 *   2. QuizAttempt snapshot is fetched BEFORE Python runs (safe from deletion)
 *   3. question_text is enriched from Question collection BEFORE building payload
 *   4. NEW v2: runPythonScript() uses robust JSON extraction — extracts the last
 *      valid {...} block from stdout instead of hard JSON.parse(). This prevents
 *      ai_feedback_meta from getting stuck on status="error" when Python prints
 *      any warnings, pip output, or deprecation notices before the JSON.
 */

const { spawn } = require("child_process");
const path = require("path");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");
const Child = require("../models/child");
const Question = require("../models/question");

const { triggerCumulativeFeedback } = require("./cumulativeFeedbackService");

// ─── Config ───
const BACKEND_ROOT = path.resolve(__dirname, "../..");

const SUBJECT_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../../subject_feedback/gemini_subject_feedback.py"
);

const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");

const FEEDBACK_TIMEOUT_MS = 120000; // 2 min

// ─── Startup diagnostic ───
console.log(`🐍 Python binary: ${PYTHON_BIN}`);
console.log(`📁 Backend root: ${BACKEND_ROOT}`);
console.log(`🔑 GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}`);

// ─────────────────────────────────────────────────────────────
// FIX 1: In-memory lock — prevents double-trigger race condition
// ─────────────────────────────────────────────────────────────
const activeAttempts = new Set();

// ─────────────────────────────────────────────────────────────
// Python runner — MCQ subject feedback
//
// ✅ FIX v2: Robust JSON parser
// Old code: resolve(JSON.parse(stdout))
//   → crashes if Python prints ANY log line before the JSON
//   → catch block sets status="error", nothing saved to QuizAttempt
//
// New code: tries direct parse first, then extracts last {...} block
//   → handles pip output, deprecation warnings, debug prints
//   → only rejects if truly no JSON found at all
// ─────────────────────────────────────────────────────────────
function runPythonScript(scriptPath, inputData, timeoutMs = FEEDBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}: ${stderr || stdout}`));
      }

      const text = String(stdout || "").trim();

      if (!text) {
        return reject(new Error(`Python returned empty output. stderr: ${stderr.slice(-1000)}`));
      }

      // Try direct parse first (clean output path)
      try {
        return resolve(JSON.parse(text));
      } catch (_) {
        // Fall back: extract the last valid {...} block
        // Handles cases where Python prints log lines before the JSON
        const start = text.lastIndexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          try {
            return resolve(JSON.parse(text.slice(start, end + 1)));
          } catch (e2) {
            return reject(
              new Error(
                `Failed to parse Python output. ParseError: ${e2.message}. ` +
                `Output tail: ${text.slice(-500)}`
              )
            );
          }
        }
        return reject(
          new Error(`No JSON found in Python output: ${text.slice(-500)}`)
        );
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Python runner — Writing only (runs as module so imports work)
// Same robust JSON parser applied here too
// ─────────────────────────────────────────────────────────────
function runWritingPythonModule(inputData, timeoutMs = FEEDBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ["-m", "ai.gemini_writing_eval"], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}: ${stderr || stdout}`));
      }

      const text = String(stdout || "").trim();

      if (!text) {
        return reject(new Error(`Python returned empty output. stderr: ${stderr.slice(-1000)}`));
      }

      // Robust parse — same pattern as MCQ runner
      try {
        return resolve(JSON.parse(text));
      } catch (_) {
        const start = text.lastIndexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          try {
            return resolve(JSON.parse(text.slice(start, end + 1)));
          } catch (e2) {
            return reject(
              new Error(`Failed to parse Writing Python output: ${e2.message}\nTail: ${text.slice(-500)}`)
            );
          }
        }
        return reject(new Error(`No JSON in Writing Python output: ${text.slice(-500)}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Payload builders
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
// After saving, the QuizAttempt is DELETED — writing data lives here permanently
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

  // FIX 1: Prevent duplicate execution for the same attempt
  if (activeAttempts.has(attemptId)) {
    console.warn(`⚠️ triggerAiFeedback already running for ${attemptId} — skipping duplicate`);
    return;
  }
  activeAttempts.add(attemptId);

  try {
    // Mark as generating in QuizAttempt first (applies to both paths at this stage)
    await QuizAttempt.updateOne(
      { attempt_id: attemptId },
      {
        $set: {
          "ai_feedback_meta.status": "generating",
          "ai_feedback_meta.status_message": "Generating AI feedback...",
        },
      }
    );

    let result;

    if (isWriting) {
      // ═══════════════════════════════════════════════════════
      // WRITING PATH → result goes to Writing collection ONLY
      // ═══════════════════════════════════════════════════════

      // FIX 2: Fetch snapshot BEFORE Python runs
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

      try {
        result = await runWritingPythonModule(payload);
        console.log(`🐍 Writing Python result: success=${result?.success}, has_result=${!!result?.result}`);
      } catch (pythonErr) {
        console.error(`❌ Writing Python FULL ERROR: ${pythonErr.message}`);
        result = { success: false, error: pythonErr.message };
      }

      // Save to Writing collection — QuizAttempt deleted inside saveWritingToCollection
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
      // ═══════════════════════════════════════════════════════
      const payload = buildSubjectFeedbackPayload(params);
      console.log(`🤖 Triggering subject AI feedback for attempt ${attemptId}`);

      try {
        result = await runPythonScript(SUBJECT_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Subject feedback Python failed: ${pythonErr.message}`);
        result = { success: false, error: `Subject feedback failed: ${pythonErr.message}` };
      }

      // Save ai_feedback + ai_feedback_meta + performance_analysis to QuizAttempt
      await updateAttemptWithFeedback(attemptId, result);
    }

    if (result.success) {
      console.log(`✅ AI feedback done for attempt ${attemptId}`);
    } else {
      console.warn(`⚠️ AI feedback issues for attempt ${attemptId}: ${result.error}`);
    }

    // Trigger cumulative feedback regeneration (fire-and-forget)
    if (result.success && params.childId) {
      setImmediate(() => {
        triggerCumulativeFeedback(params.childId).catch((e) =>
          console.warn(`⚠️ Cumulative feedback failed for child ${params.childId}:`, e.message)
        );
      });
    }

  } catch (err) {
    console.error(`❌ AI feedback failed for attempt ${attemptId}:`, err.message);

    // Only update QuizAttempt on error for MCQ — writing QuizAttempt may already be deleted
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
  } finally {
    activeAttempts.delete(attemptId);
  }
}

module.exports = { triggerAiFeedback, syncWritingAttempt };