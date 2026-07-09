// src/services/resultAiService.js
const path = require("path");
const { spawn } = require("child_process");
const Result = require("../models/result");

// ✅ Process-wide Python concurrency limiter (verify path: src/utils/pythonSpawnLimiter.js)
const { runWithPythonLimit } = require("../utils/pythonSpawnLimiter");

// ✅ Shared subject-normalization helper (single source of truth)
const { inferSubjectFromQuizName } = require("../utils/quizHelpers");

// NOTE: Python dependencies are installed at BUILD time
// (see nixpacks.toml / Render build command: `pip install -r requirements.txt`).
// Do NOT install them at runtime — it slows the first request and can hang/fail
// on the request path if the network is unavailable.

/**
 * Runs the Subject/Result feedback Python script for ONE response_id.
 *
 * The Python script:
 * - reads the result doc from MongoDB
 * - generates Gemini feedback
 * - writes back into the SAME result doc:
 *     performance_analysis, ai_feedback, ai_feedback_meta
 *
 * ✅ The spawn runs through runWithPythonLimit — shares the SAME process-wide
 *    pool as every other AI feature (MAX_CONCURRENT_PYTHON). When the pool +
 *    wait-queue are full it rejects with PythonBusyError (status 503). The
 *    CALLER of runResultFeedback should catch that and surface a 503 rather
 *    than a generic 500.
 */
async function runResultFeedback({ response_id }) {
  if (!response_id) throw new Error("response_id required");

  // Fetch quiz_name so we can infer subject
  let quiz_name = "";
  try {
    const doc = await Result.findOne({ response_id }, { quiz_name: 1 });
    quiz_name = doc?.quiz_name || "";
  } catch (e) {
    console.warn("⚠️ Could not fetch quiz_name to infer subject:", e.message);
  }

  // ✅ now from the shared helper
  const subject = inferSubjectFromQuizName(quiz_name);

  // ✅ Your python script path (unchanged)
  const script = path.join(__dirname, "..", "..", "subject_feedback", "run_feedback.py");

  // Ensure python sees the right mongo env var
  const env = {
    ...process.env,
    MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO,

    // ✅ Pass these to python
    RESPONSE_ID: response_id,
    QUIZ_NAME: quiz_name,          // useful for python prompts/logs
    SUBJECT_NAME: subject,         // ✅ this is what you asked

    // LangSmith controls (safe defaults)
    LANGSMITH_PROJECT:
      process.env.LANGSMITH_PROJECT_RESULTS ||
      process.env.LANGSMITH_PROJECT ||
      "",
    LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2 || "false",
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY || "",

    // your flag (kept)
    RESULT_SUBMITTED_ONLY: "false",
  };

  // Helpful log
  console.log("🤖 Running AI feedback:", {
    response_id,
    quiz_name,
    subject,
  });

  return runWithPythonLimit(() => new Promise((resolve, reject) => {
    const p = spawn("python", [script], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `Python exit code ${code}`));
      resolve({ ok: true, output: out.trim(), subject, quiz_name });
    });
  }));
}

module.exports = {
  runResultFeedback,
  // Re-exported from the shared helper so existing imports of this symbol
  // (e.g. tests) keep working after the move.
  inferSubjectFromQuizName,
};