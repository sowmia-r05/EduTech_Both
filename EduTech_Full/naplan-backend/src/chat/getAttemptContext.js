// src/chat/getAttemptContext.js
//
// Loads a student's attempt so the AI tutor can answer "why did I get Q3 wrong?"
// WITHOUT asking the student which question they mean.
//
// ✅ REWRITE: uses the same Mongoose models as the rest of the app, joins the
//    real `questions` collection by quiz_ids, and reads attempt.answers as an
//    ARRAY.
//
// 👉 QUESTION-NUMBER FIX (this bug):
//    The previous version pushed wrong-answer entries with NO `question_number`,
//    so the tutor prompt printed "Qundefined" and had to fall back to a second,
//    array-position-numbered list that counted the Reading passage as "Q1" —
//    producing the off-by-one ("ask Q3, get Q4").
//
//    Now we assign `question_number` to match what the student sees ON SCREEN.
//    The player (NativeQuizPlayer) numbers only ANSWERABLE questions — it skips
//    the free_text passage (see `answerableQuestions`). So we do the same: walk
//    the questions in `order`, skip the passage, and use a running counter as
//    the on-screen number. We also return `all_questions` (every answerable
//    question, with is_correct), not just the wrong ones, so the tutor can talk
//    about questions the student got right too.

const QuizAttempt = require("../models/quizAttempt");
const Quiz        = require("../models/quiz");
const Question    = require("../models/question");
const Child       = require("../models/child");

const cache  = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Note: the second arg (db) is accepted but ignored, so existing call sites like
// getAttemptContext(attempt_id, db) keep working without any change.
async function getAttemptContext(attemptId, _db) {
  if (!attemptId) return null;

  // ── L1: Node memory cache ──────────────────────────────────
  const hit = cache.get(attemptId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

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

  // ── Build the numbered question list ───────────────────────
  // `question_number` is the ON-SCREEN number: the position among answerable
  // (non-passage) questions, in `order`. This exactly mirrors the player's
  // `answerableQuestions` numbering, so "Q3" here === "Q3" the student saw.
  const allQuestions   = [];
  const wrongQuestions = [];
  let qNum = 0;

  for (const q of questions || []) {
    // The player does NOT number the free_text passage — neither do we.
    // (Skipping it here is what keeps our numbers aligned with the screen.)
    if (q.type === "free_text") continue;

    qNum += 1; // ← on-screen question number

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
      question_number: qNum,
      question_id:     q.question_id,
      question_text:   q.text || q.question_text || "",
      child_answer:    childAnswer,
      correct_answer:  correct.join(", ") || "",
      is_correct:      isCorrect,
      topic:           q.categories?.[0]?.name || "",
    };

    // Every answerable question goes into all_questions (answered or not) so the
    // numbering stays contiguous and the tutor can see the whole quiz.
    allQuestions.push(entry);

    // wrong_questions keeps its original meaning (answered + incorrect) for the
    // Python agent path that still reads it. Same object reference — carries the
    // question_number too, for free.
    if (ans && !isCorrect) wrongQuestions.push(entry);
  }

  // Reading passage (if any) so the tutor can refer back to the text
  const passage = (questions || []).find(
    (q) => q.type === "free_text" || q.type === "writing"
  );

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
    all_questions:   allQuestions,   // ← NEW: every answerable question, numbered
    wrong_questions: wrongQuestions, // ← now also carries question_number
    passage_text:    passage?.text || passage?.question_text || null,
  };

  cache.set(attemptId, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

function invalidateAttemptContext(attemptId) {
  cache.delete(attemptId);
}

module.exports = { getAttemptContext, invalidateAttemptContext };