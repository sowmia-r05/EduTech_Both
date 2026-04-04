/**
 * routes/quizExplanationsRoute.js
 *
 * POST /api/admin/quizzes/:quizId/generate-explanations
 * Generates and stores explanations_by_year for every question in a quiz.
 * Called from the admin QuizDetailPage "Generate Explanations" button.
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const connectDB = require("../config/db");
const Question = require("../models/question");
const { verifyToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const TIMEOUT_MS = 60000; // 60s per question

// ─── Run gemini_explanation.py in explain_question mode ───
function runExplainQuestion(question) {
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

// ═══════════════════════════════════════════════════════════
// POST /api/admin/quizzes/:quizId/generate-explanations
// ═══════════════════════════════════════════════════════════
router.post(
  "/quizzes/:quizId/generate-explanations",
  verifyToken,
  requireAuth,
  async (req, res) => {
    try {
      await connectDB();
      const { quizId } = req.params;

      // Find all questions for this quiz
      const questions = await Question.find({ quiz_ids: quizId }).lean();

      if (questions.length === 0) {
        return res.status(404).json({ error: "No questions found for this quiz" });
      }

      // ✅ Respond immediately so the UI doesn't hang
      res.json({
        success: true,
        message: `Started generating explanations for ${questions.length} questions. Runs in background.`,
        total: questions.length,
      });

      // ✅ Run in background AFTER responding
      setImmediate(async () => {
        let done = 0, failed = 0;
        console.log(`🧠 Starting explanation generation for quiz ${quizId} — ${questions.length} questions`);

        for (const q of questions) {
          try {
            const result = await runExplainQuestion(q);

            if (result.success && result.explanations_by_year) {
              await Question.updateOne(
                { question_id: q.question_id },
                { $set: { explanations_by_year: result.explanations_by_year } }
              );
              done++;
              console.log(`  ✅ [${done}/${questions.length}] ${q.question_id}`);
            } else {
              failed++;
              console.warn(`  ⚠️ [${q.question_id}] No explanations returned:`, result.error);
            }
          } catch (err) {
            failed++;
            console.error(`  ❌ [${q.question_id}] Failed:`, err.message);
          }
        }

        console.log(`🏁 Done. ${done} saved, ${failed} failed for quiz ${quizId}`);
      });

    } catch (err) {
      console.error("generate-explanations error:", err.message);
      // Only send error if we haven't responded yet
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  }
);

module.exports = router;