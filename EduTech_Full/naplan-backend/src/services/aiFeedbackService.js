/**
 * services/aiFeedbackService.js
 *
 * AI Feedback Bridge — native QuizAttempt → Gemini pipelines
 *
 * - MCQ subjects  : gemini_subject_feedback.py
 * - Writing       : gemini_writing_evaluator.py
 *
 * After writing AI completes, the attempt is also mirrored into the
 * Writing collection so the writing-feedback UI still works.
 *
 * Status lifecycle: queued → generating → done | error
 */

const { spawn } = require("child_process");
const path = require("path");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");       // ✅ NEW
const Child = require("../models/child");           // ✅ NEW
const Question = require("../models/question");     // ✅ NEW

// ─── Config ───
const SUBJECT_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../../subject_feedback/gemini_subject_feedback.py"
);
const WRITING_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../../writing_feedback/gemini_writing_evaluator.py"
);
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const FEEDBACK_TIMEOUT_MS = 60000; // 60s max for AI generation

// ─────────────────────────────────────────────────────────────
// Python runner
// ─────────────────────────────────────────────────────────────
function runPythonScript(scriptPath, inputData, timeoutMs = FEEDBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath], {
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
  attemptId,
  quizName,
  subject,
  yearLevel,
  score,
  topicBreakdown,
  duration,
  scoredAnswers,
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

function buildWritingFeedbackPayload({ attemptId, quizName, yearLevel, scoredAnswers }) {
  const writingResponses = (scoredAnswers || [])
    .filter((a) => a.text_answer && a.text_answer.trim())
    .map((a) => ({ question_id: a.question_id, answer_text: a.text_answer }));

  return {
    doc: {
      response_id: attemptId,
      quiz_name: quizName,
      year_level: yearLevel,
      writing_responses: writingResponses,
      writing_text: writingResponses.map((r) => r.answer_text).join("\n\n"),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Save AI result back to QuizAttempt
// ─────────────────────────────────────────────────────────────
async function updateAttemptWithFeedback(attemptId, feedbackResult, isWriting) {
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

    if (isWriting) {
      if (feedbackResult.performance_analysis) {
        const perf = feedbackResult.performance_analysis;
        update.score = {
          points: perf.overall_percentage || 0,
          available: 100,
          percentage: perf.overall_percentage || 0,
          grade: perf.grade || "",
          pass: (perf.overall_percentage || 0) >= 50,
        };
      }
      update.status = "ai_done";
    } else {
      update.status = "ai_done";
    }

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
    if (isWriting) {
      update.status = "scored";
    }
  }

  await QuizAttempt.updateOne({ attempt_id: attemptId }, { $set: update });
}

// ─────────────────────────────────────────────────────────────
// ✅ NEW: Mirror completed writing attempt → Writing collection
// Keeps the /writing-feedback/result UI working without FlexiQuiz
// ─────────────────────────────────────────────────────────────
async function syncWritingAttempt({
  attemptId,
  quizId,
  quizName,
  yearLevel,
  childId,
  scoredAnswers,
}) {
  try {
    // Fetch the latest attempt state (has AI feedback already saved)
    const attempt = await QuizAttempt.findOne({ attempt_id: attemptId }).lean();
    if (!attempt) {
      console.warn(`⚠️ syncWritingAttempt: attempt ${attemptId} not found`);
      return;
    }

    // Fetch child info for user fields
    const child = await Child.findById(childId).lean();

    // Enrich qna with question text from Question collection
    const questionIds = (scoredAnswers || [])
      .map((a) => a.question_id)
      .filter(Boolean);

    const questions = questionIds.length
      ? await Question.find({ question_id: { $in: questionIds } }).lean()
      : [];
    const qMap = Object.fromEntries(questions.map((q) => [q.question_id, q]));

    const qna = (scoredAnswers || []).map((a) => ({
      question_id: a.question_id,
      type: "free_text",
      question_text: qMap[a.question_id]?.text || "",
      answer_text: a.text_answer || "",
    }));

    const aiMeta = attempt.ai_feedback_meta || {};
    const aiStatus = aiMeta.status === "done" ? "done" : aiMeta.status === "error" ? "error" : "pending";

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
          submitted_at: attempt.submitted_at,
          status: "submitted",
          duration_sec: attempt.duration_sec,
          attempt: attempt.attempt_number,
          qna,
          // Keep user fields for legacy UI compatibility
          user: {
            user_name: child?.username || null,
            first_name: child?.display_name || "",
            last_name: "",
            email_address: "",
          },
          ai: {
            status: aiStatus,
            message: aiMeta.status_message || "",
            evaluated_at: aiMeta.generated_at || null,
            feedback: attempt.ai_feedback || null,
            error: aiStatus === "error" ? (aiMeta.status_message || "AI failed") : null,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Writing synced for attempt ${attemptId}`);
  } catch (err) {
    console.error(`❌ syncWritingAttempt failed for ${attemptId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Main entry point — called non-blocking from quizRoutes submit
// ─────────────────────────────────────────────────────────────
async function triggerAiFeedback(params) {
  const { attemptId, isWriting } = params;

  try {
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
      const payload = buildWritingFeedbackPayload(params);
      console.log(`🤖 Triggering writing AI feedback for attempt ${attemptId}`);
      try {
        result = await runPythonScript(WRITING_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Writing Python script failed: ${pythonErr.message}`);
        result = { success: false, error: `Writing evaluation failed: ${pythonErr.message}` };
      }
    } else {
      const payload = buildSubjectFeedbackPayload(params);
      console.log(`🤖 Triggering subject AI feedback for attempt ${attemptId}`);
      try {
        result = await runPythonScript(SUBJECT_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Subject feedback Python script failed: ${pythonErr.message}`);
        result = { success: false, error: `Subject feedback failed: ${pythonErr.message}` };
      }
    }

    // Save AI result to QuizAttempt
    await updateAttemptWithFeedback(attemptId, result, isWriting);

    // ✅ NEW: Mirror writing attempt → Writing collection (non-blocking)
    if (isWriting) {
      setImmediate(() => syncWritingAttempt(params).catch(console.error));
    }

    if (result.success) {
      console.log(`✅ AI feedback saved for attempt ${attemptId}`);
    } else {
      console.warn(`⚠️ AI feedback had issues for attempt ${attemptId}: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ AI feedback failed for attempt ${attemptId}:`, err.message);

    await QuizAttempt.updateOne(
      { attempt_id: attemptId },
      {
        $set: {
          "ai_feedback_meta.status": "error",
          "ai_feedback_meta.status_message": `Feedback generation error: ${err.message}`,
          "ai_feedback_meta.generated_at": new Date(),
          ...(params.isWriting ? { status: "scored" } : {}),
        },
      }
    );
  }
}

module.exports = { triggerAiFeedback, syncWritingAttempt };