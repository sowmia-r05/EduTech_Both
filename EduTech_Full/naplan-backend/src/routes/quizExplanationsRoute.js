const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const connectDB = require("../config/db");
const Question = require("../models/question");
const { verifyToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
const TIMEOUT_MS = 60000;

// ✅ In-memory progress tracker — { quizId: { total, done, failed, status } }
const progressMap = new Map();

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
     // ✅ Run in background
      setImmediate(async () => {
        let done = 0, failed = 0;
        console.log(`🧠 Starting for quiz ${quizId} — ${questions.length} questions`);
        console.log(`🐍 Python: ${PYTHON_BIN} | Root: ${BACKEND_ROOT}`);

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
            console.error(`❌ [${q.question_id}] threw:`, err.message);
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