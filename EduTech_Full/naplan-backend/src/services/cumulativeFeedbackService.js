/**
 * services/cumulativeFeedbackService.js
 *
 * Generates and stores Gemini cumulative feedback for a child
 * across ALL their quiz attempts, broken down by subject + overall.
 *
 * Triggered:
 *   - After every quiz attempt completes AI feedback (via aiFeedbackService.js)
 *   - On-demand from the frontend (GET endpoint triggers refresh if stale)
 *
 * Storage:
 *   - CumulativeFeedback collection: one doc per (child_id × subject)
 *   - Subjects: "Overall", "Reading", "Writing", "Numeracy", "Language"
 */

const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

const CumulativeFeedback = require("../models/cumulativeFeedback");
const QuizAttempt = require("../models/quizAttempt");
const Result = require("../models/result");
const Child = require("../models/child");

// ─── Config ───
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");

const CUMULATIVE_SCRIPT = path.resolve(
  __dirname,
  "../../subject_feedback/cumulative_gemini_feedback.py"
);

const TIMEOUT_MS = Number(process.env.CUMULATIVE_FEEDBACK_TIMEOUT_MS || 60000);

const SUBJECTS = ["Overall", "Reading", "Writing", "Numeracy", "Language"];

// In-memory lock: prevent simultaneous runs for same child
const runningChildren = new Set();

// ─────────────────────────────────────────────────────────────
// Helper: normalize subject string
// ─────────────────────────────────────────────────────────────
function normalizeSubject(subject) {
  if (!subject) return "Other";
  const s = subject.toLowerCase().trim();
  if (s.includes("numeracy") || s.includes("math") || s.includes("maths") || s.includes("number"))
    return "Numeracy";
  if (s.includes("language") || s.includes("convention") || s.includes("grammar") || s.includes("spelling"))
    return "Language";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (["Reading", "Writing", "Numeracy", "Language"].includes(subject)) return subject;
  return "Other";
}

function inferSubjectFromQuizName(quizName) {
  const q = (quizName || "").toLowerCase();
  if (q.includes("numeracy") || q.includes("number") || q.includes("math")) return "Numeracy";
  if (q.includes("language") || q.includes("convention") || q.includes("grammar")) return "Language";
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";
  return "Other";
}

// ─────────────────────────────────────────────────────────────
// Fetch all quiz data for a child (both native + legacy)
// ─────────────────────────────────────────────────────────────
async function fetchAllTestsForChild(childId, child) {
  const tests = [];

  // ── Native QuizAttempts ──
  const attempts = await QuizAttempt.find({
    child_id: childId,
    status: { $in: ["scored", "ai_done", "submitted"] },
  })
    .select("quiz_name subject score submitted_at duration_sec topic_breakdown")
    .lean();

  for (const a of attempts) {
    const subj = normalizeSubject(a.subject || inferSubjectFromQuizName(a.quiz_name));
    if (subj === "Other") continue;

    // Convert topic_breakdown (may be Map)
    const tb = {};
    if (a.topic_breakdown) {
      const entries =
        a.topic_breakdown instanceof Map
          ? a.topic_breakdown.entries()
          : Object.entries(a.topic_breakdown);
      for (const [k, v] of entries) {
        tb[k] = { scored: v.scored || 0, total: v.total || 0 };
      }
    }

    tests.push({
      quiz_name: a.quiz_name || "Quiz",
      subject: subj,
      score: Math.round(a.score?.percentage || 0),
      date: a.submitted_at || a.createdAt,
      duration_sec: a.duration_sec || 0,
      topic_breakdown: tb,
    });
  }

  // ── Legacy Results (FlexiQuiz) ──
  if (child?.flexiquiz_user_id || child?.username) {
    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const legacyResults = await Result.find(matchQuery)
      .select("quiz_name subject score date_submitted duration topicBreakdown")
      .lean();

    for (const r of legacyResults) {
      const subj = normalizeSubject(r.subject || inferSubjectFromQuizName(r.quiz_name));
      if (subj === "Other") continue;
      tests.push({
        quiz_name: r.quiz_name || "Quiz",
        subject: subj,
        score: Math.round(r.score?.percentage || 0),
        date: r.date_submitted || r.createdAt,
        duration_sec: r.duration || 0,
        topic_breakdown: r.topicBreakdown || {},
      });
    }
  }

  return tests;
}

// ─────────────────────────────────────────────────────────────
// Run Python Gemini script for one subject
// ─────────────────────────────────────────────────────────────
function runPython(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [CUMULATIVE_SCRIPT], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      try { child.kill("SIGKILL"); } catch (_) {}
      reject(new Error(`Cumulative feedback Python timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (e) => {
      finished = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Python (${PYTHON_BIN}): ${e.message}`));
    });

    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Python exited ${code}: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Cannot parse Python output: ${e.message} | Output: ${stdout.slice(0, 300)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Core: generate + save cumulative feedback for one subject
// ─────────────────────────────────────────────────────────────
async function generateForSubject({ childId, subject, tests, displayName, yearLevel }) {
  const subjectTests = subject === "Overall"
    ? tests
    : tests.filter((t) => t.subject === subject);

  // Mark as generating
  await CumulativeFeedback.findOneAndUpdate(
    { child_id: childId, subject },
    {
      $set: {
        child_id: childId,
        subject,
        status: "generating",
        status_message: "Generating AI feedback…",
        attempt_count: subjectTests.length,
      },
    },
    { upsert: true, new: true }
  );

  try {
    const result = await runPython({
      child_id: String(childId),
      display_name: displayName,
      year_level: yearLevel,
      subject,
      tests: subjectTests,
    });

    if (!result.success) {
      throw new Error(result.error || "Python returned success=false");
    }

    const avgScore = subjectTests.length
      ? Math.round(subjectTests.reduce((a, t) => a + t.score, 0) / subjectTests.length)
      : 0;

    const lastTest = [...subjectTests].sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    await CumulativeFeedback.findOneAndUpdate(
      { child_id: childId, subject },
      {
        $set: {
          feedback: result.feedback,
          status: "done",
          status_message: "Feedback ready",
          model: result.meta?.model || "gemini-2.0-flash",
          generated_at: new Date(),
          attempt_count: subjectTests.length,
          average_score: avgScore,
          last_quiz_name: lastTest?.quiz_name || "",
        },
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Cumulative feedback done: child=${childId} subject=${subject} tests=${subjectTests.length}`);
    return { success: true };

  } catch (err) {
    console.error(`❌ Cumulative feedback error: child=${childId} subject=${subject}: ${err.message}`);

    await CumulativeFeedback.findOneAndUpdate(
      { child_id: childId, subject },
      {
        $set: {
          status: "error",
          status_message: err.message,
          generated_at: new Date(),
        },
      },
      { upsert: true }
    );

    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Main: trigger cumulative feedback for ALL subjects for a child
// Called after any quiz attempt finishes AI feedback
// ─────────────────────────────────────────────────────────────
async function triggerCumulativeFeedback(childId) {
  const childIdStr = String(childId);

  if (runningChildren.has(childIdStr)) {
    console.log(`⏳ Cumulative feedback already running for child ${childIdStr}, skipping`);
    return;
  }

  runningChildren.add(childIdStr);
  console.log(`🤖 Starting cumulative feedback for child ${childIdStr}`);

  try {
    const child = await Child.findById(childId).lean();
    if (!child) {
      console.warn(`⚠️ Child ${childId} not found — skipping cumulative feedback`);
      return;
    }

    const displayName = child.display_name || child.username || "Student";
    const yearLevel = child.year_level || null;

    // Fetch all tests (both native + legacy)
    const allTests = await fetchAllTestsForChild(childId, child);

    if (!allTests.length) {
      console.log(`📭 No tests found for child ${childIdStr} — skipping cumulative feedback`);
      return;
    }

    // Determine which subjects actually have data
    const activeSubjects = new Set(allTests.map((t) => t.subject));
    const subjectsToGenerate = ["Overall", ...SUBJECTS.slice(1).filter((s) => activeSubjects.has(s))];

    // Generate sequentially to avoid hammering Gemini rate limits
    for (const subject of subjectsToGenerate) {
      await generateForSubject({
        childId,
        subject,
        tests: allTests,
        displayName,
        yearLevel,
      });
    }

    console.log(`✅ All cumulative feedback done for child ${childIdStr}`);

  } catch (err) {
    console.error(`❌ triggerCumulativeFeedback failed for child ${childIdStr}:`, err.message);
  } finally {
    runningChildren.delete(childIdStr);
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch existing cumulative feedback docs for a child
// ─────────────────────────────────────────────────────────────
async function getCumulativeFeedback(childId) {
  const docs = await CumulativeFeedback.find({ child_id: childId })
    .select("-__v")
    .lean();

  // Return as a map: { Overall: {...}, Reading: {...}, ... }
  const map = {};
  for (const doc of docs) {
    map[doc.subject] = doc;
  }
  return map;
}

module.exports = {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
  generateForSubject,       // exported for admin re-gen endpoints
  fetchAllTestsForChild,    // exported for routes
};