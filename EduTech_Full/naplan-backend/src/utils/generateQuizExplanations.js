const { spawn } = require("child_process");
const path = require("path");
const Question = require("../models/question"); // adjust if path differs

const PYTHON = process.env.PYTHON_PATH || "python3";
const SCRIPT = path.join(__dirname, "../../ai/gemini_explanation.py");

function runPython(payload) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON, [SCRIPT], { env: { ...process.env } });
    let out = "";
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => console.error("[AI explain stderr]", d.toString()));
    proc.on("close", () => {
      try { resolve(JSON.parse(out)); }
      catch { resolve({ success: false, error: "JSON parse failed", raw: out }); }
    });
  });
}

async function generateQuizExplanations(quizId) {
  try {
    const questions = await Question.find({ quiz_id: quizId }).lean();
    console.log(`[AI] Generating explanations for ${questions.length} questions in quiz ${quizId}`);

    for (const q of questions) {
      // Skip writing questions — nothing to explain
      if ((q.type || "").toLowerCase() === "writing") continue;

      // Skip if already generated
      if (q.ai_explanations_generated_at) continue;

      // Skip if no question text
      if (!q.question_text?.trim()) continue;

      const result = await runPython({
        mode: "explain_question",
        question: {
          question_id:    q.question_id || String(q._id),
          question_text:  q.question_text || "",
          correct_answer: q.correct_answer || "",
          category:       q.category || q.sub_topic || "General",
        },
      });

      if (result.success && result.explanations_by_year) {
        await Question.findByIdAndUpdate(q._id, {
          ai_explanations:              result.explanations_by_year,
          ai_explanations_generated_at: new Date(),
        });
        console.log(`[AI] ✅ Question ${q.question_id || q._id} done`);
      } else {
        console.warn(`[AI] ⚠️ Question ${q.question_id || q._id} failed:`, result.error);
      }
    }

    console.log(`[AI] ✅ Finished explanations for quiz ${quizId}`);
  } catch (err) {
    console.error(`[AI] ❌ generateQuizExplanations error:`, err.message);
  }
}

module.exports = { generateQuizExplanations };