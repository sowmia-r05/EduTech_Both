/**
 * src/routes/explanationRoutes.js
 *
 * POST /api/attempts/:attemptId/explain
 *   → Generates per-question AI explanations for wrong answers
 *   → Calls ai/gemini_explanation.py with mode="explain"
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

// ─── Python runner (reuses same robust pattern as aiFeedbackService) ───
function runExplanationScript(payload) {
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

// ─── Helper: verify child owns this attempt ───
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

// ═══════════════════════════════════════════════════════════
// POST /api/attempts/:attemptId/explain
//
// Body: (none required — we pull everything from the attempt)
//
// Returns:
// {
//   explanations: [
//     { question_id, explanation, tip, emoji }
//   ]
// }
// ═══════════════════════════════════════════════════════════
router.post("/attempts/:attemptId/explain", async (req, res) => {
  try {
    await connectDB();
    const { attemptId } = req.params;

    const { attempt, child, error, status } = await resolveAttemptAndChild(req, attemptId);
    if (error) return res.status(status).json({ error });

    // ✅ Read year level from child or attempt
    const yearLevel = String(child?.year_level || attempt.year_level || "3");

    // ✅ Get all question IDs from this attempt
    const allAnswers = attempt.answers || [];
    if (allAnswers.length === 0) {
      return res.json({ explanations: [] });
    }

    const questionIds = allAnswers.map((a) => a.question_id);
    const questions = await Question.find({ question_id: { $in: questionIds } }).lean();

    // ✅ Build explanations from pre-stored explanations_by_year — NO Gemini call
    const explanations = questions.map((q) => {
      const expl = (q.explanations_by_year || {})[yearLevel] || {};
      const answerRecord = allAnswers.find((a) => a.question_id === q.question_id);
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

// ═══════════════════════════════════════════════════════════
// POST /api/attempts/:attemptId/chat
//
// Body:
// {
//   question_id: "...",          // which question the child is asking about
//   message: "Why is B wrong?",  // child's message
//   chat_history: [              // previous turns (optional)
//     { role: "child"|"ai", content: "..." }
//   ]
// }
//
// Returns: { reply: "..." }
// ═══════════════════════════════════════════════════════════
router.post("/attempts/:attemptId/chat", async (req, res) => {
  try {
    await connectDB();
    const { attemptId } = req.params;
    const { question_id, message, chat_history } = req.body;

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
        const answerRecord = (attempt.answers || []).find(
          (a) => a.question_id === question_id
        );
        const correctOption = (q.options || []).find((o) => o.correct);
        const childOption = (q.options || []).find(
          (o) => (answerRecord?.selected_option_ids || []).includes(o.option_id)
        );
        questionContext = {
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