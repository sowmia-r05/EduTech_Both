// src/chat/getAttemptContext.js
//
// Loads a student's attempt so the AI tutor can answer "why did I get Q3 wrong?"
// WITHOUT asking the student which question they mean.
//
// ✅ REWRITE: previous version used a raw req.app.locals.db handle, queried a
//    "quiz_attempts" collection, read quiz.questions (embedded), and treated
//    attempt.answers as an object. All of those returned empty data, so the
//    tutor never knew the student's results. This version uses the same Mongoose
//    models the rest of the app uses, joins the real `questions` collection by
//    quiz_ids, and builds wrong_questions from the answers ARRAY.

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

  // ── Build the list of questions the student got wrong ──────
  const wrongQuestions = [];
  for (const q of questions || []) {
    if (q.type === "free_text" || q.type === "writing") continue;

    const ans = answersById[q.question_id];
    if (!ans) continue;                 // unanswered → skip
    if (ans.is_correct) continue;       // correct → not a "wrong" question

    const chosen = (q.options || [])
      .filter((o) => (ans.selected_option_ids || []).includes(o.option_id))
      .map((o) => o.text);
    const correct = (q.options || [])
      .filter((o) => o.correct)
      .map((o) => o.text);

    wrongQuestions.push({
      question_id:    q.question_id,
      question_text:  q.text || q.question_text || "",
      child_answer:   chosen.join(", ") || ans.text_answer || "No answer",
      correct_answer: correct.join(", ") || "",
      topic:          q.categories?.[0]?.name || "",
    });
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
    wrong_questions: wrongQuestions,
    passage_text:    passage?.text || passage?.question_text || null,
  };

  cache.set(attemptId, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

function invalidateAttemptContext(attemptId) {
  cache.delete(attemptId);
}

module.exports = { getAttemptContext, invalidateAttemptContext };