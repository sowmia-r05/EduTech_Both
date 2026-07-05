/**
 * src/routes/explanationRoutes.js
 *
 * POST /api/attempts/:attemptId/explain
 *   → Returns per-question explanations from pre-stored data (no Python)
 *
 * POST /api/attempts/:attemptId/chat
 *   → Child sends a follow-up chat message about one question
 *   → Calls ai/gemini_explanation.py with mode="chat"
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const QuizAttempt = require("../models/quizAttempt");
const Question = require("../models/question");
const Child = require("../models/child");

const router = express.Router();
router.use(verifyToken, requireAuth);

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const EXPLANATION_SCRIPT = path.resolve(__dirname, "../../ai/gemini_explanation.py");
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const TIMEOUT_MS = 120000; // 2 min

// -------------------------------------------------------------
// Concurrency cap for Python spawns (self-contained - no imports).
// Limits how many Python processes run at once so a burst of chats
// can't exhaust server memory. Default 3, override with
// MAX_CONCURRENT_PYTHON in .env.
// -------------------------------------------------------------
const MAX_CONCURRENT_PYTHON = Number(process.env.MAX_CONCURRENT_PYTHON || 3);
let activePython = 0;
const pythonQueue = [];

function acquirePythonSlot() {
  return new Promise((resolve) => {
    if (activePython < MAX_CONCURRENT_PYTHON) {
      activePython++;
      resolve();
    } else {
      pythonQueue.push(resolve);
    }
  });
}

function releasePythonSlot() {
  activePython = Math.max(0, activePython - 1);
  const next = pythonQueue.shift();
  if (next) {
    activePython++;
    next();
  }
}

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

// --- Gated runner: waits for a free slot, always releases it ---
async function runExplanationScript(payload) {
  await acquirePythonSlot();
  try {
    return await spawnExplanationScript(payload);
  } finally {
    releasePythonSlot();
  }
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
    console.error("POST /explain error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ===========================================================
// POST /api/attempts/:attemptId/chat   (spawns Python - now capped)
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
      return res.status(500).json({ error: result.error || "Chat failed" });
    }

    return res.json({ reply: result.reply });
  } catch (err) {
    console.error("POST /chat error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;