// src/services/resultAiService.js
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const Result = require("../models/result");

let depsInstalled = false;
let depsInstalling = null;

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0)
        return reject(new Error(err || `Command failed: ${cmd} ${args.join(" ")}`));
      resolve(out.trim());
    });
  });
}

/**
 * ✅ Install python deps from ONE requirements.txt (project root).
 * Runs once per Node process.
 */
async function ensurePythonDeps() {
  if (depsInstalled) return;
  if (depsInstalling) return depsInstalling;

  depsInstalling = (async () => {
    const reqPath = path.join(__dirname, "..", "..", "requirements.txt");
    if (!fs.existsSync(reqPath)) {
      depsInstalled = true;
      return;
    }
    try {
      await runCmd("python", ["-m", "pip", "install", "-r", reqPath]);
      depsInstalled = true;
    } finally {
      depsInstalling = null;
    }
  })();

  return depsInstalling;
}

function normalizeQuizName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ✅ Extract subject from quiz_name text.
 * Returns one of:
 * - Numeracy
 * - Numeracy_with_calculator
 * - Language_convention
 * - Reading
 * - Writing
 * - "" (unknown)
 */
function inferSubjectFromQuizName(quizName) {
  const q = normalizeQuizName(quizName);

  // Most specific first
  if (
    q.includes("numeracy with calculator") ||
    q.includes("with calculator") ||
    q.includes("calculator")
  ) {
    return "Numeracy_with_calculator";
  }

  if (
    q.includes("language convention") ||
    q.includes("language conventions") ||
    q.includes("conventions")
  ) {
    return "Language_convention";
  }

  if (q.includes("numeracy")) return "Numeracy";
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";

  return "";
}

/**
 * Runs the Subject/Result feedback Python script for ONE response_id.
 *
 * The Python script:
 * - reads the result doc from MongoDB
 * - generates Gemini feedback
 * - writes back into the SAME result doc:
 *     performance_analysis, ai_feedback, ai_feedback_meta
 */
async function runResultFeedback({ response_id }) {
  if (!response_id) throw new Error("response_id required");

  // Auto-install deps first (best effort)
  try {
    await ensurePythonDeps();
  } catch (e) {
    console.warn("⚠️ Python deps install failed:", e.message);
  }

  // Fetch quiz_name so we can infer subject
  let quiz_name = "";
  try {
    const doc = await Result.findOne({ response_id }, { quiz_name: 1 });
    quiz_name = doc?.quiz_name || "";
  } catch (e) {
    console.warn("⚠️ Could not fetch quiz_name to infer subject:", e.message);
  }

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

  return new Promise((resolve, reject) => {
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
  });
}

module.exports = {
  runResultFeedback,
  inferSubjectFromQuizName, // optional export for testing
};
