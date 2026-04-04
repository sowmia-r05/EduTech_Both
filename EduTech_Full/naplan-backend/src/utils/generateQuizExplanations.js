/**
 * generateQuizExplanations.js
 * Calls Gemini API directly from Node.js — no Python spawn needed.
 */

const connectDB = require("../config/db");
const Quiz      = require("../models/quiz");
const Question  = require("../models/question");

const explanation_progress = {};

async function callGemini(questions, yearLevel, subject) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in .env");

  const questionsBlock = questions.map((q, i) => `
Question ${i + 1} (ID: ${q.question_id})
  Text: ${q.question_text}
  Correct answer: ${q.correct_answer}
  Topic: ${q.category}
`).join("");

  const prompt = `You are an AI tutor for Australian NAPLAN students (Year ${yearLevel}, Subject: ${subject}).

For each question below, write:
1. "explanation": Why the correct answer is correct (under 60 words, no emojis)
2. "tip": A short memorable trick for next time (under 30 words)

QUESTIONS:
${questionsBlock}

Return ONLY valid JSON, no markdown, no extra text:
{
  "explanations": [
    { "question_id": "...", "explanation": "...", "tip": "..." }
  ]
}`;

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return parsed.explanations || [];
}

async function generateQuizExplanations(quizId, progressMap = explanation_progress) {
  await connectDB();

  const quiz = await Quiz.findOne({ quiz_id: quizId }).lean();
  if (!quiz) return;

  const questions = await Question.find({ quiz_ids: quizId }).lean();
  if (!questions.length) return;

  progressMap[quizId] = { status: "running", done: 0, failed: 0, total: questions.length };

  try {
    const payload = questions.map((q) => ({
      question_id:    q.question_id,
      question_text:  q.text || q.question_text || "",
      correct_answer: q.correct_answer || "",
      category:       q.categories?.[0]?.name || quiz.subject || "General",
    }));

    const explanations = await callGemini(
      payload,
      parseInt(quiz.year_level) || 3,
      quiz.subject || "General"
    );

    let done = 0, failed = 0;

    await Promise.all(
      explanations.map(async (expl) => {
        if (!expl?.question_id || !expl?.explanation) { failed++; return; }
        try {
          await Question.updateOne(
            { question_id: expl.question_id },
            {
              $set: {
                "ai_explanation.explanation":  expl.explanation,
                "ai_explanation.tip":          expl.tip || "",
                "ai_explanation.generated_at": new Date(),
              },
            },
            { strict: false } 
          );
          done++;
        } catch (e) {
          console.error("DB save failed:", expl.question_id, e.message);
          failed++;
        }
      })
    );

    progressMap[quizId] = { status: "done", done, failed, total: questions.length };
    console.log(`✅ Quiz ${quizId}: ${done} explanations saved, ${failed} failed`);

  } catch (err) {
    console.error("generateQuizExplanations error:", err.message);
    progressMap[quizId] = {
      status: "done",
      done: 0,
      failed: questions.length,
      total: questions.length,
      error: err.message,
    };
  }
}

module.exports = { generateQuizExplanations, explanation_progress };