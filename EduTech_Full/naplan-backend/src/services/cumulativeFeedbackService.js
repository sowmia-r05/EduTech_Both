/**
 * services/cumulativeFeedbackService.js  (v6 — cross-instance atomic lock)
 *
 * CHANGE IN v6 (the only change from v5):
 *   - The in-memory `runningChildren` Set is GONE. It only prevented duplicate
 *     regens within ONE process — useless behind a load balancer with >= 2
 *     instances, where two submissions for the same child (or one submission
 *     double-firing across instances) both passed the Set check and both ran
 *     the FULL subject loop. Each loop is up to 5 Gemini calls, so that was a
 *     straight doubling of spend plus a race on every CumulativeFeedback doc.
 *
 *   - Replaced with a DISTRIBUTED lock stored in the CumulativeFeedback
 *     collection on a sentinel document (subject === LOCK_SUBJECT "__lock__").
 *     acquireChildLock() atomically flips that doc's status → "generating" only
 *     if it isn't already held (or the hold is older than LOCK_STALE_MS, i.e. a
 *     crashed run). Whoever wins owns the regen; every other trigger — on this
 *     or any other instance — fails to acquire and skips. Released in the
 *     finally block. No Redis needed; Atlas gives us the atomicity for free.
 *
 *   - The lock spans the WHOLE subject loop (acquire at top, release at end),
 *     so Overall + Reading + Writing + Numeracy + Language can never double-run.
 *
 *   REQUIREMENTS / NOTES:
 *     • There MUST be a unique index on { child_id, subject } (you already rely
 *       on it — every findOneAndUpdate here upserts on that key). The lock uses
 *       it: a duplicate-key error on acquire is treated as "already locked".
 *     • The sentinel doc (subject "__lock__") is filtered OUT of
 *       getCumulativeFeedback(), so the frontend never sees it. Any OTHER code
 *       that reads CumulativeFeedback directly should also skip subject
 *       === "__lock__".
 *
 * FIXES from v5 (unchanged behaviour, now DB-backed):
 *   - clearRunningLock() still exported for route-level stale recovery — it now
 *     releases the DB lock instead of clearing the old in-memory Set.
 *   - generateForSubject() bumps updatedAt so the route can detect stale docs.
 *
 * v5 (unchanged):
 *   - runPython() wrapped in runWithPythonLimit() — one process-wide Python
 *     ceiling (MAX_CONCURRENT_PYTHON) shared with every other AI feature.
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

// ✅ v5: process-wide Python concurrency limiter (src/utils/pythonSpawnLimiter.js)
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

// ─────────────────────────────────────────────────────────────
// v6: Cross-instance distributed lock (replaces the in-memory Set)
//
// Held on a sentinel CumulativeFeedback doc: { child_id, subject: "__lock__" }.
// status === "generating" means locked; anything else (or a stale updatedAt)
// means free. Reuses the existing "generating"/"done" status values so it can't
// trip a status enum, and reuses Mongoose's updatedAt as the staleness clock.
//
// LOCK_STALE_MS is generous on purpose: the whole loop can legitimately take a
// few minutes (up to 5 sequential Python calls), so we must never yank a lock
// that's still live. A crashed run therefore holds the lock for up to this long
// — which is harmless here, because cumulative feedback re-triggers on the next
// submission anyway.
// ─────────────────────────────────────────────────────────────
const LOCK_SUBJECT = "__lock__";
const LOCK_STALE_MS = Number(process.env.CUMULATIVE_LOCK_STALE_MS || 10 * 60 * 1000); // 10 min

async function acquireChildLock(childId) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  try {
    const locked = await CumulativeFeedback.findOneAndUpdate(
      {
        child_id: childId,
        subject: LOCK_SUBJECT,
        $or: [
          { status: { $ne: "generating" } },
          { updatedAt: { $lt: staleBefore } },
          { updatedAt: { $exists: false } },
        ],
      },
      {
        $set: {
          child_id: childId,
          subject: LOCK_SUBJECT,
          status: "generating",
          status_message: "Cumulative feedback in progress (lock held)",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return !!locked;
  } catch (err) {
    // Duplicate key (E11000): the lock doc exists AND our filter didn't match
    // it — i.e. another instance holds a LIVE lock and the upsert tried to
    // insert a second one. That's exactly "busy": refuse.
    if (err && (err.code === 11000 || err.codeName === "DuplicateKey")) {
      return false;
    }
    // Any other error — don't run unprotected. Log and refuse; next submission
    // will retrigger.
    console.error(`❌ acquireChildLock error for child ${childId}: ${err.message}`);
    return false;
  }
}

async function releaseChildLock(childId) {
  try {
    await CumulativeFeedback.updateOne(
      { child_id: childId, subject: LOCK_SUBJECT },
      { $set: { status: "done", status_message: "Idle" } }
    );
  } catch (err) {
    console.warn(`⚠️ releaseChildLock failed for child ${childId}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// clearRunningLock — called by the route when it detects a stale
// "generating" doc whose lock needs manual release. Now DB-backed.
// ─────────────────────────────────────────────────────────────
async function clearRunningLock(childId) {
  console.warn(`🔓 Clearing cumulative-feedback lock for child ${childId}`);
  await releaseChildLock(childId);
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

  // ✅ v6: cross-instance atomic lock (replaces the in-memory runningChildren Set).
  // Only ONE regen per child runs at a time across ALL instances. A second
  // trigger — here or on another box — fails to acquire and skips. A crashed
  // run's lock is reclaimed after LOCK_STALE_MS.
  const acquired = await acquireChildLock(childId);
  if (!acquired) {
    console.log(`⏳ Cumulative feedback already running for child ${childIdStr} (lock held) — skipping`);
    return;
  }

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
    // ✅ v6: always release the distributed lock — even on crash, early return,
    // or server error inside the try.
    await releaseChildLock(childId);
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch existing cumulative feedback docs for a child
//
// ✅ v6: the internal "__lock__" sentinel is excluded so it never reaches the UI.
// ─────────────────────────────────────────────────────────────
async function getCumulativeFeedback(childId) {
  const docs = await CumulativeFeedback.find({
    child_id: childId,
    subject: { $ne: LOCK_SUBJECT },
  })
    .select("-__v")
    .lean();

  const map = {};
  for (const doc of docs) {
    if (doc.subject === LOCK_SUBJECT) continue; // belt & suspenders
    map[doc.subject] = doc;
  }
  return map;
}

module.exports = {
  triggerCumulativeFeedback,
  getCumulativeFeedback,
  generateForSubject,
  fetchAllTestsForChild,
  clearRunningLock,           // ← export for route-level stale recovery (now DB-backed)
};