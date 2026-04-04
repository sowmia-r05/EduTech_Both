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

  const prompt = `You are an expert AI tutor for Australian NAPLAN students (Year ${yearLevel}, Subject: ${subject}).

For each question below, write detailed, helpful feedback:
1. "explanation": Clearly explain WHY the correct answer is correct. Include the concept behind it, how to work it out step by step, and why the other options are wrong. (60-100 words)
2. "tip": A memorable strategy or trick students can use next time they see a similar question. (under 40 words)

QUESTIONS:
${questionsBlock}

Return ONLY valid JSON, no markdown, no extra text:
{
  "explanations": [
    { "question_id": "...", "explanation": "...", "tip": "..." }
  ]
}

RULES:
- explanation must be 60-100 words — detailed but clear
- mention WHY wrong answers are incorrect if helpful
- use simple Year ${yearLevel} language
- no emojis
- tip must be a concrete strategy, not just a restatement`;

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