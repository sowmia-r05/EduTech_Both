/**
 * src/routes/quizExplanationsRoute.js
 *
 * Admin bulk job: generate per-year explanations for every question in a quiz.
 *
 *   POST /api/admin/quizzes/:quizId/generate-explanations
 *   GET  /api/admin/quizzes/:quizId/generate-explanations/status
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CHANGE: the Python spawn now goes through the SHARED limiter.
 *
 * Why this file mattered even though it was already sequential:
 *
 *   The for...of loop awaits each question, so this file never ran more than
 *   ONE Python process at a time on its own. That looked safe — but it was
 *   ungated against the SHARED pool. So an admin clicking "generate
 *   explanations" while a class was submitting quizzes meant:
 *
 *       admin's 1 Python  +  students' N Python  =  N+1 concurrent
 *
 *   ...with nothing enforcing a total ceiling. On a 512MB Render instance,
 *   two processes at ~250MB each is already the edge.
 *
 *   Now this job's spawn takes a slot from the same pool as everything else,
 *   so the app-wide total can never exceed MAX_CONCURRENT_PYTHON.
 *
 * BACKOFF ON BUSY (the important bit for a batch job):
 *
 *   If the pool is full, runWithPythonLimit rejects with PythonBusyError.
 *   For a user-facing route the right answer is "503, try again". For a
 *   BACKGROUND BATCH job it is NOT — marking a question permanently `failed`
 *   just because students happened to be busy at that moment would silently
 *   leave holes in the content.
 *
 *   So on PYTHON_BUSY we wait and retry (up to MAX_BUSY_RETRIES), with
 *   increasing delay. Student traffic always wins the slot; the admin job
 *   simply takes longer. Only a genuine Python error counts as `failed`.
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const connectDB = require("../config/db");
const Question = require("../models/question");
const { verifyToken, requireAuth } = require("../middleware/auth");

// ✅ Shared process-wide Python concurrency limiter
const { runWithPythonLimit } = require("../utils/pythonSpawnLimiter");

const router = express.Router();

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const TIMEOUT_MS = 60000;

// How many times a single question will wait-and-retry when the Python pool
// is saturated by live student traffic, before being counted as failed.
const MAX_BUSY_RETRIES = 5;
const BUSY_RETRY_BASE_MS = 3000; // 3s, 6s, 9s, 12s, 15s

// ✅ In-memory progress tracker — { quizId: { total, done, failed, status } }
//    NOTE: this is a Map in process memory. It does NOT survive a Render
//    restart or cold start — a job in flight will lose its progress record.
//    Acceptable for an admin tool; move to MongoDB if that ever matters.
const progressMap = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Raw spawn (unchanged logic) ───
function spawnExplainQuestion(question) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ["-m", "ai.gemini_explanation"], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      timeout: TIMEOUT_MS,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Python exited ${code}: ${stderr || stdout}`));
      const text = (stdout || "").trim();
      if (!text) return reject(new Error("Python returned empty output"));
      try {
        return resolve(JSON.parse(text));
      } catch (_) {
        const start = text.lastIndexOf("{");
        const end = text.lastIndexOf("}") + 1;
        if (start !== -1 && end > start) {
          try { return resolve(JSON.parse(text.slice(start, end))); } catch {}
        }
        return reject(new Error(`No JSON in output: ${text.slice(-200)}`));
      }
    });
    child.on("error", (err) => reject(new Error(`Spawn failed: ${err.message}`)));
    child.stdin.write(JSON.stringify({
      mode: "explain_question",
      question: {
        question_id:   question.question_id,
        question_text: question.question_text || question.text || "",
        correct_answer: (() => {
          const correct = (question.options || []).find((o) => o.correct);
          return correct?.text || question.correct_answer || "";
        })(),
        category: question.category || question.topic || "",
      },
    }));
    child.stdin.end();
  });
}

// ─── Gated + busy-retrying runner ───
//
// Takes a slot from the SHARED pool. If the pool + queue are full (because
// students are actively submitting quizzes), waits and retries rather than
// failing the question outright.
async function runExplainQuestion(question) {
  for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
    try {
      return await runWithPythonLimit(() => spawnExplainQuestion(question));
    } catch (err) {
      const isBusy = err.code === "PYTHON_BUSY" || err.status === 503;
      if (!isBusy || attempt === MAX_BUSY_RETRIES) {
        throw err; // real Python error, or we've waited long enough
      }
      const waitMs = BUSY_RETRY_BASE_MS * (attempt + 1);
      console.warn(
        `🚦 Python pool busy — retrying ${question.question_id} in ${waitMs}ms ` +
        `(attempt ${attempt + 1}/${MAX_BUSY_RETRIES})`
      );
      await sleep(waitMs);
    }
  }
}

// ═══════════════════════════════════════════════════
// GET /api/admin/quizzes/:quizId/generate-explanations/status
// ✅ Frontend polls this to check progress
// ═══════════════════════════════════════════════════
router.get(
  "/quizzes/:quizId/generate-explanations/status",
  verifyToken,
  requireAuth,
  (req, res) => {
    const progress = progressMap.get(req.params.quizId);
    if (!progress) {
      return res.json({ status: "idle" });
    }
    return res.json(progress);
  }
);

// ═══════════════════════════════════════════════════
// POST /api/admin/quizzes/:quizId/generate-explanations
// ═══════════════════════════════════════════════════
router.post(
  "/quizzes/:quizId/generate-explanations",
  verifyToken,
  requireAuth,
  async (req, res) => {
    try {
      await connectDB();
      const { quizId } = req.params;

      // ✅ Prevent double-running
      const existing = progressMap.get(quizId);
      if (existing?.status === "running") {
        return res.json({ success: true, message: "Already running", ...existing });
      }

      const questions = await Question.find({
        $or: [
            { quiz_ids: quizId },
            { quiz_id: quizId },
            { quiz_ids: { $in: [quizId] } },
        ]
        }).lean();

        console.log(`🔍 Found ${questions.length} questions for quiz ${quizId}`);
      if (questions.length === 0) {
        return res.status(404).json({ error: "No questions found for this quiz" });
      }

      // ✅ Set initial progress
      progressMap.set(quizId, {
        status: "running",
        total: questions.length,
        done: 0,
        failed: 0,
      });

      // ✅ Respond immediately
      res.json({ success: true, total: questions.length, status: "running" });

      // ✅ Run in background
      setImmediate(async () => {
        let done = 0, failed = 0;
        console.log(`🧠 Starting for quiz ${quizId} — ${questions.length} questions`);
        console.log(`🐍 Python: ${PYTHON_BIN} | Root: ${BACKEND_ROOT}`);

        // Sequential by design: one question at a time. Combined with the
        // shared limiter, this job can never hold more than one Python slot,
        // so it degrades gracefully instead of starving live student traffic.
        for (const q of questions) {
          try {
            const qText = q.question_text || q.text || "";
            console.log(`⏳ [${q.question_id}] text: "${qText.slice(0, 60)}"`);

            const result = await runExplainQuestion(q);
            console.log(`📦 [${q.question_id}] result:`, JSON.stringify(result).slice(0, 300));

            if (result.success && result.explanations_by_year) {
              await Question.updateOne(
                { question_id: q.question_id },
                { $set: { explanations_by_year: result.explanations_by_year } }
              );
              done++;
              console.log(`✅ [${done}/${questions.length}] saved: ${q.question_id}`);
            } else {
              failed++;
              console.warn(`⚠️ [${q.question_id}] no explanations:`, result.error || JSON.stringify(result));
            }
          } catch (err) {
            failed++;
            if (err.code === "PYTHON_BUSY" || err.status === 503) {
              console.error(
                `❌ [${q.question_id}] gave up — Python pool stayed busy through ` +
                `all ${MAX_BUSY_RETRIES} retries. Re-run this quiz when traffic is lower.`
              );
            } else {
              console.error(`❌ [${q.question_id}] threw:`, err.message);
            }
          }

          progressMap.set(quizId, {
            status: "running",
            total: questions.length,
            done: done + failed,
            failed,
          });
        }

        progressMap.set(quizId, { status: "done", total: questions.length, done, failed });
        setTimeout(() => progressMap.delete(quizId), 5 * 60 * 1000);
        console.log(`🏁 Done. ${done} saved, ${failed} failed for quiz ${quizId}`);
      });

    } catch (err) {
      console.error("generate-explanations error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;