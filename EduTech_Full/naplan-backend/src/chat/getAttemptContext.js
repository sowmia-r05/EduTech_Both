// src/chat/getAttemptContext.js
//
// Loads a student's attempt so the AI tutor can answer "why did I get Q3 wrong?"
// WITHOUT asking the student which question they mean.
//
// 👉 QUESTION-NUMBER FIX:
//    `question_number` is the ON-SCREEN number: the position among answerable
//    (non-passage) questions, in `order`. This mirrors the player's
//    `answerableQuestions` numbering, so "Q3" here === "Q3" the student saw.
//    That rule now lives in the shared helper orderAnswerableQuestions() so the
//    backend and the frontend player can't drift off-by-one.
//
// 👉 CACHE FIX:
//    The L1 memory cache is a bounded LRUCache (max entries + TTL), so memory is
//    capped no matter how many distinct attempts are requested.

const QuizAttempt = require("../models/quizAttempt");
const Quiz        = require("../models/quiz");
const Question    = require("../models/question");
const Child       = require("../models/child");

// ✅ Bounded LRU cache (verify path: src/utils/lruCache.js)
const { LRUCache } = require("../utils/lruCache");
const cache = new LRUCache({ max: 500, ttlMs: 5 * 60 * 1000 });

// ✅ Shared question-ordering helper (single source of truth for on-screen numbers)
const { orderAnswerableQuestions } = require("../utils/quizHelpers");

// Note: the second arg (db) is accepted but ignored, so existing call sites like
// getAttemptContext(attempt_id, db) keep working without any change.
async function getAttemptContext(attemptId, _db) {
  if (!attemptId) return null;

  // ── L1: Node memory cache (bounded, TTL-managed by LRUCache) ─
  const hit = cache.get(attemptId);
  if (hit) return hit;

  // ── Load the attempt ───────────────────────────────────────
  const attempt = await QuizAttempt.findOne({ attempt_id: attemptId }).lean();
  if (!attempt) return null;

  // ── Load quiz + child + the real question docs in parallel ─
  const [quiz, child, questions] = await Promise.all([
    Quiz.findOne({ quiz_id: attempt.quiz_id }).lean(),
    attempt.child_id ? Child.findById(attempt.child_id).lean() : Promise.resolve(null),
    Question.find({ quiz_ids: attempt.quiz_id }).sort({ order: 1 }).lean(),
  ]);

  // attempt.answers is an ARRAY of scored answers → index it by question_id
  const answersById = {};
  for (const a of attempt.answers || []) {
    if (a && a.question_id) answersById[a.question_id] = a;
  }

  // ── Canonical on-screen ordering (passage skipped, running number) ──
  // `numbered` is [{ question, question_number }] for answerable questions only.
  const { numbered, passage } = orderAnswerableQuestions(questions);

  const allQuestions   = [];
  const wrongQuestions = [];

  for (const { question: q, question_number } of numbered) {
    const ans = answersById[q.question_id];

    const chosen = (q.options || [])
      .filter((o) => (ans?.selected_option_ids || []).includes(o.option_id))
      .map((o) => o.text);
    const correct = (q.options || [])
      .filter((o) => o.correct)
      .map((o) => o.text);

    const isCorrect  = !!(ans && ans.is_correct);
    const childAnswer =
      chosen.join(", ") ||
      (ans && ans.text_answer) ||
      "No answer";

    const entry = {
      question_number,
      question_id:    q.question_id,
      question_text:  q.text || q.question_text || "",
      child_answer:   childAnswer,
      correct_answer: correct.join(", ") || "",
      is_correct:     isCorrect,
      topic:          q.categories?.[0]?.name || "",
    };

    // Every answerable question goes into all_questions (answered or not) so the
    // numbering stays contiguous and the tutor can see the whole quiz.
    allQuestions.push(entry);

    // wrong_questions keeps its original meaning (answered + incorrect).
    if (ans && !isCorrect) wrongQuestions.push(entry);
  }

  const data = {
    attempt_id:      attemptId,
    quiz_id:         attempt.quiz_id,
    child_id:        attempt.child_id,
    child_name:      child?.display_name || child?.username || attempt.child_name || "Student",
    year_level:      attempt.year_level || quiz?.year_level || 3,
    subject:         quiz?.subject   || attempt.subject   || "",
    quiz_name:       quiz?.quiz_name || attempt.quiz_name || "",
    score_pct:       Math.round(attempt.score?.percentage || 0),
    score_points:    attempt.score?.points    || 0,
    score_available: attempt.score?.available || 0,
    topic_breakdown: attempt.topic_breakdown  || {},
    all_questions:   allQuestions,   // ← every answerable question, numbered
    wrong_questions: wrongQuestions, // ← now also carries question_number
    passage_text:    passage?.text || passage?.question_text || null,
  };

  cache.set(attemptId, data);
  return data;
}

function invalidateAttemptContext(attemptId) {
  cache.delete(attemptId);
}

module.exports = { getAttemptContext, invalidateAttemptContext };