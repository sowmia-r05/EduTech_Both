/**
 * generateQuizExplanations.js
 *
 * Generates AI explanations + tips for quiz questions and saves them
 * onto Question.ai_explanation. Mirrors the working pattern in
 * generateQuizSubTopics.js so behaviour is consistent.
 *
 * Exports:
 *   - generateQuizExplanations(quizId, options?, progressMap?)
 *   - explanation_progress  (in-memory tracker keyed by quizId)
 *
 * Used by:
 *   - src/routes/quizAiRoutes.js
 *   - src/routes/adminRoutes.js
 */

const connectDB = require("../config/db");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const { createLLMClientWithFallback, generateJSON } = require("./llmClient");

// ═══════════════════════════════════════════════════════════════
// PROGRESS TRACKER (in-memory, keyed by quizId)
// ═══════════════════════════════════════════════════════════════

const explanation_progress = {};

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════

function buildPrompt(question, yearLevel, subject) {
  const correctAnswer =
    (question.options || []).find((o) => o.correct)?.text ||
    question.correct_answer ||
    "";

  const qText = question.text || question.question_text || "";

  return `You are an AI tutor for Australian NAPLAN students (Year ${yearLevel}).

SUBJECT: ${subject || "General"}
QUESTION: ${qText}
CORRECT ANSWER: ${correctAnswer}
TOPIC: ${question.category || "General"}

Write a generic explanation for any student who got this question wrong.
Do NOT reference any specific wrong answer — keep it generic.
No emojis.

Return ONLY valid JSON, no markdown fences:
{
  "explanation": "...",
  "tip": "..."
}

RULES:
- explanation under 60 words
- tip under 25 words
- Year ${yearLevel} appropriate language
- No emojis at all
`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

/**
 * Generate AI explanations for every question in a quiz (or a subset).
 *
 * @param {string} quizId
 * @param {object} [options]
 * @param {string[]} [options.questionIds]   - Restrict to these question_ids
 * @param {object} [progressMap]             - Defaults to explanation_progress
 */
async function generateQuizExplanations(
  quizId,
  options = {},
  progressMap = explanation_progress
) {
  await connectDB();

  // ── Look up the quiz so we know year_level + subject ──
  const quiz = await Quiz.findOne({ quiz_id: quizId }).lean();
  if (!quiz) {
    progressMap[quizId] = { status: "error", error: "Quiz not found" };
    return;
  }

  const yearLevel = quiz.year_level || 3;
  const subject = quiz.subject || "General";

  // ── Build the question filter ──
  const baseFilter = {
    $or: [{ quiz_ids: quizId }, { quiz_id: quizId }],
  };
  const filter =
    Array.isArray(options.questionIds) && options.questionIds.length > 0
      ? { ...baseFilter, question_id: { $in: options.questionIds } }
      : baseFilter;

  const questions = await Question.find(filter).lean();
  const scope = options.questionIds ? "selected" : "all";

  if (!questions.length) {
    progressMap[quizId] = {
      status: "done",
      done: 0,
      failed: 0,
      total: 0,
      scope,
    };
    return;
  }

  // ── Initialise progress ──
  progressMap[quizId] = {
    status: "running",
    done: 0,
    failed: 0,
    total: questions.length,
    scope,
  };

  const client = createLLMClientWithFallback();
  console.log(
    `🧠 Generating explanations for quiz ${quizId} — ${questions.length} questions ` +
      `(provider: ${client.provider}, scope: ${scope}, year: ${yearLevel})`
  );

  let done = 0;
  let failed = 0;

  // ── Process questions one by one (keeps payload small + stable) ──
  for (const q of questions) {
    try {
      const prompt = buildPrompt(q, yearLevel, subject);

      const result = await generateJSON(client, {
        prompt,
        temperature: 0.4,
        maxTokens: 600,
      });

      const explanation = String(result.explanation || "").trim();
      const tip = String(result.tip || "").trim();

      if (!explanation) {
        throw new Error("LLM returned empty explanation");
      }

      await Question.updateOne(
        { question_id: q.question_id },
        {
          $set: {
            ai_explanation: {
              explanation,
              tip,
              generated_at: new Date(),
            },
          },
        }
      );

      done++;
      console.log(`  ✅ [${done}/${questions.length}] ${q.question_id}`);
    } catch (err) {
      failed++;
      console.warn(
        `  ⚠️  [${q.question_id}] failed: ${err.message?.slice(0, 200)}`
      );
    }

    // Update live progress after every question
    progressMap[quizId] = {
      status: "running",
      done,
      failed,
      total: questions.length,
      scope,
    };
  }

  // ── Mark complete and clean up after 5 minutes ──
  progressMap[quizId] = {
    status: "done",
    done,
    failed,
    total: questions.length,
    scope,
  };

  setTimeout(() => {
    delete progressMap[quizId];
  }, 5 * 60 * 1000);

  console.log(
    `🏁 Quiz ${quizId}: ${done} saved, ${failed} failed (${questions.length} total)`
  );
}

module.exports = {
  generateQuizExplanations,
  explanation_progress,
};