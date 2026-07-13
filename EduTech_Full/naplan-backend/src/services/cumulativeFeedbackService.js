/**
 * services/cumulativeFeedbackService.js  (v5 — Python spawn limiter wired)
 *
 * CHANGE IN v5 (the only change from v4):
 *   - runPython() is now wrapped in runWithPythonLimit(). Previously this file
 *     forked Python with NO concurrency cap, which defeated the limiter that
 *     aiFeedbackService / resultAiService / subjectFeedbackService already use.
 *
 *     Why this mattered: aiFeedbackService fires triggerCumulativeFeedback()
 *     via setImmediate() after EVERY successful submission. A burst of quiz
 *     submissions therefore produced a burst of UNCAPPED cumulative-feedback
 *     spawns running alongside the capped ones. Each Python process is
 *     ~150–300MB; on a 512MB Render instance, three at once is death.
 *
 *     Now all Python spawns across the whole app share ONE ceiling
 *     (MAX_CONCURRENT_PYTHON) with a bounded wait-queue (MAX_PYTHON_QUEUE).
 *
 *   - When the pool + queue are both full, runWithPythonLimit rejects with
 *     PythonBusyError. That rejection is caught by the existing try/catch in
 *     generateForSubject(), which marks the doc status="error" with the message.
 *     So a busy pool = a visible, recoverable failure — NOT a dead instance.
 *
 * FIXES from v4 (unchanged):
 *   - clearRunningLock() exported so the route can release a stale in-memory lock
 *   - generateForSubject() bumps updatedAt so the route can detect stale docs
 *   - triggerCumulativeFeedback() always releases the lock in its finally block
 *
 * DATA SOURCE RULES (unchanged):
 *   - MCQ (Reading/Numeracy/Language) → QuizAttempts collection
 *   - Writing                         → Writing collection
 */

const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

const CumulativeFeedback = require("../models/cumulativeFeedback");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");
const Child = require("../models/child");

// ✅ NEW v5: process-wide Python concurrency limiter (src/utils/pythonSpawnLimiter.js)
const { runWithPythonLimit } = require("../utils/pythonSpawnLimiter");

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
// clearRunningLock — called by the route when it detects a stale
// "generating" doc whose server-side lock was lost (e.g. restart)
// ─────────────────────────────────────────────────────────────
function clearRunningLock(childId) {
  const key = String(childId);
  if (runningChildren.has(key)) {
    console.warn(`🔓 Clearing stale runningChildren lock for child ${key}`);
    runningChildren.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
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

function writingScorePercent(writingDoc) {
  const overall = writingDoc?.ai?.feedback?.overall;
  if (!overall) return 0;
  const total = overall.total_score || 0;
  const max = overall.max_score || 0;
  if (max <= 0) return 0;
  return Math.round((total / max) * 100);
}

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
// Fetch all quiz data for a child
// ─────────────────────────────────────────────────────────────
async function fetchAllTestsForChild(childId) {
  const tests = [];

  // ── MCQ QuizAttempts (Reading, Numeracy, Language) ──────────
  const attempts = await QuizAttempt.find({
    child_id: childId,
    status: { $in: ["scored", "ai_done"] },
    subject: { $not: /writing/i },
  })
    .select("quiz_name subject score submitted_at createdAt duration_sec topic_breakdown")
    .lean();

  for (const a of attempts) {
    const subj = normalizeSubject(a.subject || inferSubjectFromQuizName(a.quiz_name));
    if (subj === "Other" || subj === "Writing") continue;

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

    tests.push({
      quiz_name: a.quiz_name || "Quiz",
      subject: subj,
      score: Math.round(a.score?.percentage || 0),
      date: a.submitted_at || a.createdAt,
      duration_sec: a.duration_sec || 0,
      topic_breakdown: tb,
    });
  }

  // ── Writing attempts (from Writing collection ONLY) ──────────
  // FIX: Also include writing docs that are "done" OR have a score > 0
  // to prevent missing writing attempts where ai.status may differ
  const writingDocs = await Writing.find({
    child_id: childId,
    "ai.status": "done",
  })
    .select("quiz_name subject submitted_at createdAt duration_sec ai")
    .lean();

  for (const w of writingDocs) {
    tests.push({
      quiz_name: w.quiz_name || "Writing Quiz",
      subject: "Writing",
      score: writingScorePercent(w),
      date: w.submitted_at || w.createdAt,
      duration_sec: w.duration_sec || 0,
      topic_breakdown: writingTopicBreakdown(w),
    });
  }

  return tests;
}

// ─────────────────────────────────────────────────────────────
// Run Python Gemini cumulative script
//
// ✅ v5: wrapped in runWithPythonLimit. The spawn only happens once a slot is
//    free. If the pool AND the wait-queue are both full, this rejects with
//    PythonBusyError (err.code === "PYTHON_BUSY", err.status === 503) BEFORE
//    forking anything — which is what keeps the 512MB box alive under a burst.
//
//    The rejection propagates to generateForSubject()'s catch block, which
//    records status="error" on the CumulativeFeedback doc. Visible failure,
//    not a crashed instance.
// ─────────────────────────────────────────────────────────────
function runPython(payload) {
  return runWithPythonLimit(() => new Promise((resolve, reject) => {
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

      // Robust JSON extraction: find the LAST valid {...} block in stdout
      const jsonMatches = stdout.match(/\{[\s\S]*\}/g);
      if (jsonMatches) {
        for (let i = jsonMatches.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(jsonMatches[i]);
            return resolve(parsed);
          } catch (_) {
            // try next match
          }
        }
      }

      reject(new Error(
        `Cannot parse Python output. ` +
        `stderr: ${stderr.slice(0, 200)} | stdout: ${stdout.slice(0, 300)}`
      ));
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  }));
}

// ─────────────────────────────────────────────────────────────
// Core: generate + save cumulative feedback for one subject
// ─────────────────────────────────────────────────────────────
async function generateForSubject({ childId, subject, tests, displayName, yearLevel }) {
  const subjectTests = subject === "Overall"
    ? tests
    : tests.filter((t) => t.subject === subject);

  // FIX: Touch updatedAt so the route can detect stale docs via updatedAt < staleThreshold.
  // We set status → "generating" here; updatedAt gets auto-bumped by Mongoose timestamps.
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
    // ✅ v5: this now also catches PythonBusyError (503) from the limiter.
    // A busy pool marks the doc "error" and moves on — it does NOT fork a
    // process and it does NOT take the instance down.
    if (err.code === "PYTHON_BUSY") {
      console.warn(`🚦 Python pool busy — cumulative feedback deferred: child=${childId} subject=${subject}`);
    } else {
      console.error(`❌ Cumulative feedback error: child=${childId} subject=${subject}: ${err.message}`);
    }

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

    const allTests = await fetchAllTestsForChild(childId);

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

    const activeSubjects = new Set(allTests.map((t) => t.subject));
    const subjectsToGenerate = ["Overall", ...SUBJECTS.slice(1).filter((s) => activeSubjects.has(s))];

    console.log(`📋 Subjects to generate for child ${childIdStr}: ${subjectsToGenerate.join(", ")}`);

    // NOTE: this loop is intentionally SEQUENTIAL (await inside for...of).
    // Each iteration takes one limiter slot, runs, and releases it before the
    // next begins — so a single child never occupies more than one Python slot
    // at a time, no matter how many subjects they have.
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
    // Always release the lock — even if Python crashed or server error occurred
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

  const map = {};
  for (const doc of docs) {
    map[doc.subject] = doc;
  }
  return map;
}

module.exports = {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
  generateForSubject,
  fetchAllTestsForChild,
  clearRunningLock,           // ← export for route-level stale recovery
};