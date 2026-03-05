/**
 * services/aiFeedbackService.js
 *
 * AI Feedback Bridge — native QuizAttempt → Gemini pipelines
 *
 * DATA STORAGE RULES:
 *   - Non-writing (MCQ): saved to QuizAttempt only
 *   - Writing: saved to Writing collection only, QuizAttempt deleted after sync
 *
 * Status lifecycle:
 *   MCQ:     queued → generating → done | error  (in QuizAttempt)
 *   Writing: queued → generating → done | error  (in Writing collection)
 *
 * FIXES:
 *   1. In-memory lock prevents duplicate triggerAiFeedback calls for same attempt
 *   2. QuizAttempt data is fetched BEFORE Python runs (not after deletion)
 *   3. question_text is enriched from Question collection BEFORE building Python payload
 */

const { spawn } = require("child_process");
const path = require("path");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");
const Child = require("../models/child");
const Question = require("../models/question");

// ─── Config ───
const BACKEND_ROOT = path.resolve(__dirname, "../..");

const SUBJECT_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../../subject_feedback/gemini_subject_feedback.py"
);

const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");

const FEEDBACK_TIMEOUT_MS = 120000; // 2 min for writing (can be slow)

// ─── Startup diagnostic ───
console.log(`🐍 Python binary: ${PYTHON_BIN}`);
console.log(`📁 Backend root: ${BACKEND_ROOT}`);
console.log(`🔑 GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}`);

// ─────────────────────────────────────────────────────────────
// ✅ FIX 1: In-memory lock — prevents double-trigger race condition
// If triggerAiFeedback is called twice for same attempt, second call is ignored
// ─────────────────────────────────────────────────────────────
const activeAttempts = new Set();

// ─────────────────────────────────────────────────────────────
// Python runner — generic (MCQ subject feedback)
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
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout.slice(0, 500)}`));
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
// Python runner — writing only (runs as module so imports work)
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
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout.slice(0, 500)}`));
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

// ✅ FIX 2: question_text is now passed in (pre-enriched before this function is called)
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
// Save AI result to QuizAttempt (MCQ only)
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
// ✅ FIX 3: WRITING: Save directly to Writing collection
// - attemptSnapshot is passed in (fetched BEFORE Python runs)
//   so deletion of QuizAttempt mid-flight doesn't break anything
// - enrichedQna is built BEFORE Python runs (question_text populated)
// ─────────────────────────────────────────────────────────────
async function saveWritingToCollection({
  attemptId, quizId, quizName, yearLevel, childId,
  feedbackResult,
  attemptSnapshot,   // ✅ pre-fetched QuizAttempt data
  enrichedQna,       // ✅ pre-built qna with question_text + answer_text
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
          response_id: attemptId,
          quiz_id: quizId,
          quiz_name: quizName,
          child_id: childId,
          subject: "Writing",
          year_level: yearLevel,
          submitted_at: attemptSnapshot.submitted_at,
          status: "submitted",
          duration_sec: attemptSnapshot.duration_sec,
          attempt: attemptSnapshot.attempt_number,
          qna: enrichedQna,   // ✅ has question_text + answer_text
          user: {
            user_name: child?.username || null,
            first_name: child?.display_name || "",
            last_name: "",
            email_address: "",
          },
          ai: {
            status: aiStatus,
            message: aiSuccess ? "Feedback ready" : "AI evaluation failed",
            evaluated_at: new Date(),
            feedback: aiFeedback,
            error: aiError,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Writing saved to Writing collection for attempt ${attemptId} — AI: ${aiStatus}`);

    // Delete QuizAttempt — writing data lives only in Writing collection
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

  // Build enrichedQna from scoredAnswers
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
// ─────────────────────────────────────────────────────────────
async function triggerAiFeedback(params) {
  const { attemptId, isWriting } = params;

  // ✅ FIX 1: Prevent duplicate execution for the same attempt
  if (activeAttempts.has(attemptId)) {
    console.warn(`⚠️ triggerAiFeedback already running for ${attemptId} — skipping duplicate`);
    return;
  }
  activeAttempts.add(attemptId);

  try {
    // Mark as generating
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
      // ✅ FIX 2+3: Fetch attempt + enrich question_text BEFORE running Python
      // This way, even if QuizAttempt is deleted mid-flight, we have the data
      const attemptSnapshot = await QuizAttempt.findOne({ attempt_id: attemptId }).lean();
      if (!attemptSnapshot) {
        console.warn(`⚠️ triggerAiFeedback: QuizAttempt not found for ${attemptId}`);
        return;
      }

      // Enrich scoredAnswers with question_text from Question collection
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

      // Build Python payload using enriched data (question_text now populated)
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

      // Save to Writing collection using pre-fetched snapshot + enriched qna
      await saveWritingToCollection({
        ...params,
        feedbackResult: result,
        attemptSnapshot,    // ✅ pre-fetched — not affected by deletion
        enrichedQna,        // ✅ question_text + answer_text already populated
      });

    } else {
      // ─── MCQ: run AI then save to QuizAttempt ───
      const payload = buildSubjectFeedbackPayload(params);
      console.log(`🤖 Triggering subject AI feedback for attempt ${attemptId}`);

      try {
        result = await runPythonScript(SUBJECT_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Subject feedback Python failed: ${pythonErr.message}`);
        result = { success: false, error: `Subject feedback failed: ${pythonErr.message}` };
      }

      await updateAttemptWithFeedback(attemptId, result);
    }

    if (result.success) {
      console.log(`✅ AI feedback done for attempt ${attemptId}`);
    } else {
      console.warn(`⚠️ AI feedback issues for attempt ${attemptId}: ${result.error}`);
    }

  } catch (err) {
    console.error(`❌ AI feedback failed for attempt ${attemptId}:`, err.message);

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
    // ✅ Always release the lock when done
    activeAttempts.delete(attemptId);
  }
}

module.exports = { triggerAiFeedback, syncWritingAttempt };