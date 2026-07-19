/**
 * generateQuizExplanations.js  (v2 — Mongo-backed progress)
 *
 * Generates AI explanations + tips for quiz questions and saves them
 * onto Question.ai_explanation.
 *
 * CHANGE IN v2:
 *   - The in-memory `explanation_progress` object is GONE. It lived in one
 *     Node process, so with >= 2 web instances the POST that starts a job and
 *     the GET that polls its status could hit different boxes — the poller then
 *     saw nothing and reported "idle" forever. A Render restart mid-job wiped
 *     it too, and the setTimeout cleanup never fired on other instances.
 *   - Progress now lives in the GenerationProgress collection (one doc per
 *     quiz), written via setProgress() and read via getExplanationProgress().
 *     A TTL index on the model auto-removes finished records — no setTimeout.
 *
 * Exports:
 *   - generateQuizExplanations(quizId, options?)
 *   - getExplanationProgress(quizId)   → { status, done, failed, total, scope }
 *
 * Used by:
 *   - src/routes/quizAiRoutes.js
 *   - src/routes/adminRoutes.js
 *   (BOTH must read progress via getExplanationProgress() now — the old
 *    `explanation_progress` export no longer exists.)
 */

const connectDB = require("../config/db");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const GenerationProgress = require("../models/generationProgress");
const { createLLMClientWithFallback, generateJSON } = require("./llmClient");

// ═══════════════════════════════════════════════════════════════
// PROGRESS STORE (Mongo-backed, keyed by quizId)
// ═══════════════════════════════════════════════════════════════

const PROGRESS_TYPE = "explanations";

async function setProgress(quizId, data) {
  try {
    await GenerationProgress.findOneAndUpdate(
      { type: PROGRESS_TYPE, quiz_id: quizId },
      { $set: { type: PROGRESS_TYPE, quiz_id: quizId, ...data } },
      { upsert: true }
    );
  } catch (err) {
    // Progress is advisory — never let a tracker write kill the actual job.
    console.warn(`⚠️ setProgress(explanations, ${quizId}) failed: ${err.message}`);
  }
}

/**
 * Read current progress for a quiz's explanation job.
 * Returns { status: "idle" } when there's no active/recent record — same shape
 * the routes already return, so the frontend poller is unchanged.
 */
async function getExplanationProgress(quizId) {
  try {
    await connectDB();
    const doc = await GenerationProgress.findOne({
      type: PROGRESS_TYPE,
      quiz_id: quizId,
    }).lean();

    if (!doc) return { status: "idle" };

    return {
      status: doc.status,
      done: doc.done,
      failed: doc.failed,
      total: doc.total,
      scope: doc.scope,
      ...(doc.error ? { error: doc.error } : {}),
    };
  } catch (err) {
    console.warn(`⚠️ getExplanationProgress(${quizId}) failed: ${err.message}`);
    return { status: "idle" };
  }
}

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
 *
 * NOTE: the old third `progressMap` argument is removed — progress is always
 * written to the GenerationProgress collection now. Existing callers pass only
 * (quizId) or (quizId, { questionIds }), so this is source-compatible.
 */
async function generateQuizExplanations(quizId, options = {}) {
  await connectDB();

  // ── Look up the quiz so we know year_level + subject ──
  const quiz = await Quiz.findOne({ quiz_id: quizId }).lean();
  if (!quiz) {
    await setProgress(quizId, { status: "error", error: "Quiz not found" });
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
    await setProgress(quizId, {
      status: "done",
      done: 0,
      failed: 0,
      total: 0,
      scope,
    });
    return;
  }

  // ── Initialise progress ──
  await setProgress(quizId, {
    status: "running",
    done: 0,
    failed: 0,
    total: questions.length,
    scope,
    error: null,
  });

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

    // Update live progress after every question. This write also refreshes the
    // TTL clock, so a running job never gets auto-expired mid-run.
    await setProgress(quizId, {
      status: "running",
      done,
      failed,
      total: questions.length,
      scope,
    });
  }

  // ── Mark complete. The GenerationProgress TTL index removes the record ~30
  //    min later — no in-process setTimeout (which never fired cross-instance).
  await setProgress(quizId, {
    status: "done",
    done,
    failed,
    total: questions.length,
    scope,
  });

  console.log(
    `🏁 Quiz ${quizId}: ${done} saved, ${failed} failed (${questions.length} total)`
  );
}

module.exports = {
  generateQuizExplanations,
  getExplanationProgress,
};