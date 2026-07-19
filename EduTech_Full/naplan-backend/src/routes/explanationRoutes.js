/**
 * src/routes/explanationRoutes.js
 *
 * POST /api/attempts/:attemptId/explain
 *   → Returns per-question explanations from pre-stored data (no Python)
 *
 * POST /api/attempts/:attemptId/chat
 *   → Child sends a follow-up chat message about one question
 *   → Calls ai/gemini_explanation.py with mode="chat"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CHANGE: replaced this file's PRIVATE Python limiter with the SHARED one.
 *
 * This file used to define its own pool:
 *
 *     const MAX_CONCURRENT_PYTHON = Number(process.env.MAX_CONCURRENT_PYTHON || 3);
 *     let activePython = 0;              // ← its own counter
 *     const pythonQueue = [];            // ← its own queue
 *
 * That was worse than having no limiter, because it looked safe but wasn't:
 *
 *   1. TWO INDEPENDENT POOLS. This counter had no idea about the counter in
 *      utils/pythonSpawnLimiter.js (used by aiFeedbackService, resultAiService,
 *      subjectFeedbackService, cumulativeFeedbackService). Real concurrency was
 *      shared_pool + this_pool. With MAX_CONCURRENT_PYTHON=1 you could still get
 *      2 simultaneous Python processes — one from each pool.
 *
 *   2. DEFAULT OF 3. On a 512MB Render instance, 3 × ~250MB = OOM.
 *
 *   3. UNBOUNDED QUEUE. pythonQueue.push(resolve) never rejected. Under a burst,
 *      waiters piled up in memory and requests hung indefinitely instead of
 *      failing fast.
 *
 * Now every Python spawn in the app shares ONE ceiling (MAX_CONCURRENT_PYTHON)
 * and ONE bounded wait-queue (MAX_PYTHON_QUEUE). When both are full, the chat
 * route returns a clean 503 instead of forking another process.
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Question = require("../models/question");
const Child = require("../models/child");

// ✅ Shared process-wide Python concurrency limiter.
// Same module singleton used by every other AI feature.
const { runWithPythonLimit } = require("../utils/pythonSpawnLimiter");

const router = express.Router();
router.use(verifyToken, requireAuth);

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const EXPLANATION_SCRIPT = path.resolve(__dirname, "../../ai/gemini_explanation.py");
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const TIMEOUT_MS = 120000; // 2 min

// --- Raw Python runner (the spawn itself) ---
function spawnExplanationScript(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ["-m", "ai.gemini_explanation"], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited ${code}: ${stderr || stdout}`));
      }
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
        return reject(new Error(`No JSON in Python output: ${text.slice(-300)}`));
      }
    });

    child.on("error", (err) => reject(new Error(`Spawn failed: ${err.message}`)));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// --- Gated runner: shared pool, bounded queue, always releases the slot ---
//
// runWithPythonLimit handles acquire/release for us (including on throw), and
// rejects with PythonBusyError (err.code === "PYTHON_BUSY", err.status === 503)
// BEFORE forking anything if the pool AND queue are both full.
function runExplanationScript(payload) {
  return runWithPythonLimit(() => spawnExplanationScript(payload));
}

// --- Helper: verify child owns this attempt ---
async function resolveAttemptAndChild(req, attemptId) {
  const attempt = await QuizAttempt.findOne({ attempt_id: attemptId }).lean();
  if (!attempt) return { error: "Attempt not found", status: 404 };

  const isChildOwner = String(attempt.child_id) === String(req.user.childId);
  const isParentOwner =
    req.user.role === "parent" &&
    String(attempt.parent_id) === String(req.user.parentId);

  if (!isChildOwner && !isParentOwner) {
    return { error: "Access denied", status: 403 };
  }

  const child = await Child.findById(attempt.child_id).lean();
  return { attempt, child };
}

// ===========================================================
// POST /api/attempts/:attemptId/explain   (no Python - reads stored data)
// ===========================================================
router.post("/attempts/:attemptId/explain", async (req, res) => {
  try {
    await connectDB();
    const { attemptId } = req.params;

    const { attempt, child, error, status } = await resolveAttemptAndChild(req, attemptId);
    if (error) return res.status(status).json({ error });

    const yearLevel = String(child?.year_level || attempt.year_level || "3");

    const allAnswers = attempt.answers || [];
    if (allAnswers.length === 0) {
      return res.json({ explanations: [] });
    }

    const questionIds = allAnswers.map((a) => a.question_id);
    const questions = await Question.find({ question_id: { $in: questionIds } }).lean();

    // ✅ FIX: Question.find({ $in }) returns Mongo's order, NOT quiz order.
    // Index by id, then rebuild in the SAME order as attempt.answers so the
    // returned explanations line up with the questions the child actually saw
    // (protects any consumer that pairs by position instead of question_id).
    const qById = new Map(questions.map((q) => [String(q.question_id), q]));

    const explanations = allAnswers.map((answerRecord) => {
      const q = qById.get(String(answerRecord.question_id));
      if (!q) {
        return {
          question_id: answerRecord.question_id,
          is_correct:  answerRecord?.is_correct || false,
          explanation: "",
          tip:         "",
        };
      }
      const expl = (q.explanations_by_year || {})[yearLevel] || {};
      return {
        question_id: q.question_id,
        is_correct:  answerRecord?.is_correct || false,
        explanation: expl.explanation || q.explanation || "",
        tip:         expl.tip || "",
      };
    });

    return res.json({ success: true, explanations });

} catch (err) {
    req.log.error({ err }, "explain route failed");
    return res.status(500).json({ error: "Could not load explanations. Please try again." });
  }
});

// ===========================================================
// POST /api/attempts/:attemptId/chat   (spawns Python — shared cap)
// ===========================================================
router.post("/attempts/:attemptId/chat", async (req, res) => {
  try {
    await connectDB();
    const { attemptId } = req.params;
    const { question_id, message, chat_history, question_number } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const { attempt, child, error, status } = await resolveAttemptAndChild(req, attemptId);
    if (error) return res.status(status).json({ error });

    // Build question context
    let questionContext = {};
    if (question_id) {
      const q = await Question.findOne({ question_id }).lean();
      if (q) {
        const answers = attempt.answers || [];
        const answerRecord = answers.find((a) => a.question_id === question_id);

        // ✅ FIX: Prefer the number the FRONTEND actually displayed to the
        // child. Deriving it from the position in attempt.answers is wrong
        // whenever the display order differs from storage order (randomised
        // questions, or reading passages excluded from the on-screen count),
        // which made the tutor cite the wrong "Question N". Fall back to the
        // answers index only when the client didn't send a number.
        let questionNumber = null;
        const clientNum = Number(question_number);
        if (question_number !== undefined && question_number !== null && Number.isFinite(clientNum)) {
          questionNumber = clientNum;
        } else {
          const idx = answers.findIndex((a) => a.question_id === question_id);
          questionNumber = idx >= 0 ? idx + 1 : null;
        }

        const correctOption = (q.options || []).find((o) => o.correct);
        const childOption = (q.options || []).find(
          (o) => (answerRecord?.selected_option_ids || []).includes(o.option_id)
        );
        questionContext = {
          question_number: questionNumber,
          question_text: q.text || "",
          correct_answer: correctOption?.text || "",
          child_answer: childOption?.text || answerRecord?.text_answer || "",
          category: q.categories?.[0]?.name || attempt.subject || "General",
        };
      }
    }

    const yearLevel = child?.year_level || attempt.year_level || 3;
    const childName = child?.display_name || child?.username || "Student";

    const payload = {
      mode: "chat",
      question_context: questionContext,
      chat_history: chat_history || [],
      message: message.trim(),
      year_level: yearLevel,
      child_name: childName,
    };

    const result = await runExplanationScript(payload);

    if (!result.success) {
      req.log.error({ pythonError: result.error }, "explanation script returned failure");
      return res.status(500).json({ error: "Chat failed. Please try again." });
    }

    return res.json({ reply: result.reply });
  } catch (err) {
    // ✅ Pool + queue full → 503, NOT 500. This is the difference between
    // "the server is busy, retry shortly" (correct, recoverable, and the
    // frontend can back off) and "the server is broken" (misleading — and
    // without the limiter, the box would simply have died instead).
    if (err.code === "PYTHON_BUSY" || err.status === 503) {
      console.warn(`🚦 Python pool busy — chat rejected for attempt ${req.params.attemptId}`);
      res.set("Retry-After", "10");
      return res.status(503).json({
        error: "AI tutor is busy right now. Please try again in a moment.",
        code: "PYTHON_BUSY",
      });
    }

    req.log.error({ err }, "explanation chat failed");
    return res.status(500).json({ error: "AI tutor error. Please try again." });
  }
});

module.exports = router;