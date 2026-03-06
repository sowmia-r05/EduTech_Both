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
 *
 * ═══════════════════════════════════════════════════════
 * FIXES:
 *   BUG 1 — Writing collection was NEVER queried. Writing attempts are
 *            deleted from QuizAttempt and stored in the Writing collection,
 *            so they were 100% invisible to cumulative feedback.
 *
 *   BUG 2 — QuizAttempt status filter used non-existent statuses
 *            ("scored", "ai_done") — only "submitted" exists in the schema.
 *
 *   BUG 3 — Legacy Result subject field is often null/empty. If
 *            inferSubjectFromQuizName() returned "Other", all legacy tests
 *            were silently skipped → tests array empty → no feedback generated.
 *
 *   BUG 4 — Writing has no score.percentage. Now derives a percentage from
 *            ai.feedback.overall.total_score / max_score, and builds a
 *            topic_breakdown from writing criteria scores.
 * ═══════════════════════════════════════════════════════
 */

const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

const CumulativeFeedback = require("../models/cumulativeFeedback");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");       // ✅ BUG 1 FIX: import Writing
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
  if (q.includes("language") || q.includes("convention") || q.includes("grammar") || q.includes("spelling")) return "Language";
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";
  return "Other";
}

// ─────────────────────────────────────────────────────────────
// ✅ BUG 4 FIX: Derive a writing score percentage from AI feedback
// Writing has no score.percentage — use total_score / max_score from criteria
// ─────────────────────────────────────────────────────────────
function writingScorePercent(writingDoc) {
  const overall = writingDoc?.ai?.feedback?.overall;
  if (!overall) return 0;
  const total = overall.total_score || 0;
  const max = overall.max_score || 0;
  if (max <= 0) return 0;
  return Math.round((total / max) * 100);
}

// ✅ BUG 4 FIX: Build topic_breakdown from writing criteria scores
// Maps each NAPLAN writing criterion → { scored, total }
function writingTopicBreakdown(writingDoc) {
  const criteria = writingDoc?.ai?.feedback?.criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) return {};
  const tb = {};
  for (const c of criteria) {
    if (!c?.name) continue;
    const scored = typeof c.score === "number" ? c.score : 0;
    const total = typeof c.max === "number" ? c.max : 0;
    if (total > 0) {
      tb[c.name] = { scored, total };
    }
  }
  return tb;
}

// ─────────────────────────────────────────────────────────────
// Fetch all quiz data for a child (native MCQ + Writing + legacy)
// ─────────────────────────────────────────────────────────────
async function fetchAllTestsForChild(childId, child) {
  const tests = [];

  // ── ✅ BUG 2 FIX: Native MCQ QuizAttempts ─────────────────────
  // Removed non-existent statuses "scored" and "ai_done".
  // QuizAttempt schema only has: "in_progress" | "submitted" | "expired"
  // Writing attempts are NOT here — they're in the Writing collection (see below)
  const attempts = await QuizAttempt.find({
    child_id: childId,
    status: "submitted",
    // Exclude writing attempts that were synced to Writing collection
    subject: { $not: /writing/i },
  })
    .select("quiz_name subject score submitted_at createdAt duration_sec topic_breakdown")
    .lean();

  for (const a of attempts) {
    const subj = normalizeSubject(a.subject || inferSubjectFromQuizName(a.quiz_name));
    if (subj === "Other" || subj === "Writing") continue; // Writing handled separately

    // Convert topic_breakdown (may be Map or plain object)
    const tb = {};
    if (a.topic_breakdown) {
      const entries =
        a.topic_breakdown instanceof Map
          ? a.topic_breakdown.entries()
          : Object.entries(a.topic_breakdown);
      for (const [k, v] of entries) {
        if (v && typeof v === "object") {
          tb[k] = { scored: v.scored || 0, total: v.total || 0 };
        }
      }
    }

    const score = Math.round(a.score?.percentage || 0);

    tests.push({
      quiz_name: a.quiz_name || "Quiz",
      subject: subj,
      score,
      date: a.submitted_at || a.createdAt,
      duration_sec: a.duration_sec || 0,
      topic_breakdown: tb,
    });
  }

  // ── ✅ BUG 1 FIX: Native Writing attempts ─────────────────────
  // Writing attempts are deleted from QuizAttempt and stored here.
  // This collection was COMPLETELY MISSING before — root cause of no Writing data.
  const writingDocs = await Writing.find({
    child_id: childId,
    "ai.status": "done",            // only include fully evaluated writing
  })
    .select("quiz_name subject submitted_at createdAt duration_sec ai")
    .lean();

  for (const w of writingDocs) {
    const score = writingScorePercent(w);
    const tb = writingTopicBreakdown(w);

    tests.push({
      quiz_name: w.quiz_name || "Writing Quiz",
      subject: "Writing",
      score,
      date: w.submitted_at || w.createdAt,
      duration_sec: w.duration_sec || 0,
      topic_breakdown: tb,
    });
  }

  // ── ✅ BUG 3 FIX: Legacy Results (FlexiQuiz) ─────────────────
  // Previously: if r.subject was null AND quiz name didn't match keywords,
  // inferSubjectFromQuizName returned "Other" → test was silently skipped.
  // Fix: try harder with the quiz name, and log skipped legacy results.
  if (child?.flexiquiz_user_id || child?.username) {
    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const legacyResults = await Result.find(matchQuery)
      .select("quiz_name subject score date_submitted createdAt duration topicBreakdown")
      .lean();

    let legacySkipped = 0;

    for (const r of legacyResults) {
      // Try subject field first, then infer from quiz name
      const subj = normalizeSubject(
        r.subject || inferSubjectFromQuizName(r.quiz_name)
      );

      if (subj === "Other") {
        legacySkipped++;
        continue;
      }

      tests.push({
        quiz_name: r.quiz_name || "Quiz",
        subject: subj,
        score: Math.round(r.score?.percentage || 0),
        date: r.date_submitted || r.createdAt,
        duration_sec: r.duration || 0,
        topic_breakdown: r.topicBreakdown || {},
      });
    }

    if (legacySkipped > 0) {
      console.warn(
        `⚠️ fetchAllTestsForChild: skipped ${legacySkipped} legacy results for child ${childId} ` +
        `because subject could not be inferred from quiz name. ` +
        `Fix: ensure legacy results have a 'subject' field, or update quiz names to include subject keywords.`
      );
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

    // Fetch all tests (MCQ native + Writing native + legacy)
    const allTests = await fetchAllTestsForChild(childId, child);

    if (!allTests.length) {
      console.log(`📭 No tests found for child ${childIdStr} — skipping cumulative feedback`);
      return;
    }

    console.log(
      `📊 Tests found for child ${childIdStr}: ` +
      `total=${allTests.length} | ` +
      Object.entries(
        allTests.reduce((acc, t) => { acc[t.subject] = (acc[t.subject] || 0) + 1; return acc; }, {})
      ).map(([s, n]) => `${s}=${n}`).join(", ")
    );

    // Determine which subjects actually have data
    const activeSubjects = new Set(allTests.map((t) => t.subject));
    const subjectsToGenerate = ["Overall", ...SUBJECTS.slice(1).filter((s) => activeSubjects.has(s))];

    console.log(`📋 Subjects to generate for child ${childIdStr}: ${subjectsToGenerate.join(", ")}`);

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
  generateForSubject,        // exported for admin re-gen endpoints
  fetchAllTestsForChild,     // exported for routes
};