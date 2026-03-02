/**
 * services/aiFeedbackService.js
 *
 * ✅ Gap 2 + Gap 4: AI Feedback Bridge
 *
 * Connects native quiz attempts (QuizAttempt model) to the existing
 * Gemini feedback pipelines:
 *   - MCQ subjects: gemini_subject_feedback.py (Python subprocess)
 *   - Writing: gemini_writing_evaluator.py (Python subprocess)
 *
 * This runs ASYNC (non-blocking) after quiz submission.
 * The frontend polls GET /api/attempts/:attemptId/result until
 * ai_feedback_meta.status === "done" (or "error").
 *
 * Status lifecycle: queued → generating → done | error
 */

const { spawn } = require("child_process");
const path = require("path");
const QuizAttempt = require("../models/quizAttempt");

// ─── Config ───
const SUBJECT_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../subject_feedback/gemini_subject_feedback.py"
);
const WRITING_FEEDBACK_SCRIPT = path.resolve(
  __dirname,
  "../writing_feedback/gemini_writing_evaluator.py"
);
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const FEEDBACK_TIMEOUT_MS = 60000; // 60s max for AI generation

/**
 * Run a Python script with JSON on stdin, return parsed JSON from stdout.
 */
function runPythonScript(scriptPath, inputData, timeoutMs = FEEDBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath], {
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}: ${stderr || stdout}`));
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout.slice(0, 500)}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    // Write input and close stdin
    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

/**
 * Build the payload format that gemini_subject_feedback.py expects.
 * Maps from QuizAttempt fields → the legacy "doc" format.
 */
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
  // Convert topicBreakdown from Map/Object to the format expected
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
      response_id: attemptId, // Use attempt_id as the response identifier
      quiz_name: quizName,
      score: score || {},
      topicBreakdown: tb,
      duration: duration || 0,
      year_level: yearLevel,
      subject: subject,
      // Include per-question data for detailed analysis
      questions: (scoredAnswers || []).map((a) => ({
        question_id: a.question_id,
        points_scored: a.points_scored || 0,
        points_available: a.points_available || 0,
        categories: [], // Categories are already aggregated in topicBreakdown
      })),
    },
  };
}

/**
 * Build the payload for writing evaluation.
 * Writing quizzes have free_text answers that need AI evaluation.
 */
function buildWritingFeedbackPayload({
  attemptId,
  quizName,
  yearLevel,
  scoredAnswers,
}) {
  // Extract all text answers (writing responses)
  const writingResponses = (scoredAnswers || [])
    .filter((a) => a.text_answer && a.text_answer.trim())
    .map((a) => ({
      question_id: a.question_id,
      answer_text: a.text_answer,
    }));

  return {
    doc: {
      response_id: attemptId,
      quiz_name: quizName,
      year_level: yearLevel,
      writing_responses: writingResponses,
      // Concatenate all text for the main writing sample
      writing_text: writingResponses.map((r) => r.answer_text).join("\n\n"),
    },
  };
}

/**
 * Update the QuizAttempt with AI feedback results.
 */
async function updateAttemptWithFeedback(attemptId, feedbackResult, isWriting) {
  const update = {};

  if (feedbackResult.success === true) {
    // ─── Success: Save feedback ───
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

    // ✅ Gap 4: Transition status for writing quizzes
    if (isWriting) {
      // Writing: score from AI evaluation
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
      update.status = "ai_done"; // ✅ Writing: submitted → ai_done
    } else {
      // MCQ: already scored, just mark AI as done
      update.status = "ai_done"; // scored → ai_done
    }

    // Save performance analysis if present
    if (feedbackResult.performance_analysis) {
      update.performance_analysis = feedbackResult.performance_analysis;
    }
  } else {
    // ─── Error: Save error state ───
    const errMsg = feedbackResult.error || "AI feedback generation failed";
    update.ai_feedback_meta = {
      status: "error",
      status_message: errMsg,
      generated_at: new Date(),
    };

    // ✅ Gap 4: Even on AI error, writing quizzes should transition
    // Mark as "scored" without AI so child can at least see their submission
    if (isWriting) {
      update.status = "scored";
    }
  }

  await QuizAttempt.updateOne({ attempt_id: attemptId }, { $set: update });
}

/**
 * Main entry point: trigger AI feedback generation.
 * Called async (non-blocking) from the submit route.
 *
 * @param {Object} params
 * @param {string} params.attemptId
 * @param {string} params.quizId
 * @param {string} params.subject
 * @param {boolean} params.isWriting
 * @param {Array} params.scoredAnswers
 * @param {Object} params.topicBreakdown
 * @param {Object} params.score
 * @param {number} params.yearLevel
 * @param {string} params.quizName
 * @param {string} params.childId
 * @param {number} params.duration
 */
async function triggerAiFeedback(params) {
  const { attemptId, isWriting } = params;

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
      // ─── Writing evaluation ───
      const payload = buildWritingFeedbackPayload(params);
      console.log(`🤖 Triggering writing AI feedback for attempt ${attemptId}`);

      try {
        result = await runPythonScript(WRITING_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Writing Python script failed: ${pythonErr.message}`);
        // Fallback: mark as error but keep the submission
        result = {
          success: false,
          error: `Writing evaluation failed: ${pythonErr.message}`,
        };
      }
    } else {
      // ─── MCQ subject feedback ───
      const payload = buildSubjectFeedbackPayload(params);
      console.log(`🤖 Triggering subject AI feedback for attempt ${attemptId}`);

      try {
        result = await runPythonScript(SUBJECT_FEEDBACK_SCRIPT, payload);
      } catch (pythonErr) {
        console.warn(`⚠️ Subject feedback Python script failed: ${pythonErr.message}`);
        result = {
          success: false,
          error: `Subject feedback failed: ${pythonErr.message}`,
        };
      }
    }

    // Save results back to the attempt
    await updateAttemptWithFeedback(attemptId, result, isWriting);

    if (result.success) {
      console.log(`✅ AI feedback saved for attempt ${attemptId}`);
    } else {
      console.warn(`⚠️ AI feedback had issues for attempt ${attemptId}: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ AI feedback failed for attempt ${attemptId}:`, err.message);

    // Ensure attempt doesn't stay stuck in "generating" forever
    await QuizAttempt.updateOne(
      { attempt_id: attemptId },
      {
        $set: {
          "ai_feedback_meta.status": "error",
          "ai_feedback_meta.status_message": `Feedback generation error: ${err.message}`,
          "ai_feedback_meta.generated_at": new Date(),
          // ✅ Gap 4: Still transition writing status on error
          ...(params.isWriting ? { status: "scored" } : {}),
        },
      }
    );
  }
}

module.exports = { triggerAiFeedback };
