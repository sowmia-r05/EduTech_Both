// src/chat/getAttemptContext.js

const cache  = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAttemptContext(attemptId, db) {

  // ── L1: Node memory cache ──────────────────────
  const hit = cache.get(attemptId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  // ── Guard ──────────────────────────────────────
  if (!db) return null;

  // ── L2: MongoDB ────────────────────────────────
  const attempt = await db.collection("quiz_attempts").findOne(
    { attempt_id: attemptId },
    {
      projection: {
        quiz_id:            1,
        child_id:           1,
        child_name:         1,
        "score.percentage": 1,
        "score.points":     1,
        "score.available":  1,
        topic_breakdown:    1,
        answers:            1,
        year_level:         1,
      },
    }
  );

  if (!attempt) return null;

  const quiz = await db.collection("quizzes").findOne(
    { quiz_id: attempt.quiz_id },
    {
      projection: {
        subject:   1,
        quiz_name: 1,
        year_level:1,
        questions: 1,
      },
    }
  );

  // Build wrong questions list
  const wrongQuestions = [];
  const answers   = attempt.answers   || {};
  const questions = quiz?.questions   || [];

  for (const q of questions) {
    const ans = answers[q.question_id];
    if (!ans || q.type === "free_text") continue;
    if (!(ans.is_correct ?? false)) {
      wrongQuestions.push({
        question_id:    q.question_id,
        question_text:  q.question_text   || "",
        child_answer:   ans.selected?.[0] || ans.text || "No answer",
        correct_answer: q.correct_answers?.[0] || "",
        topic:          q.categories?.[0] || "",
      });
    }
  }

  const passage = questions.find(q => q.type === "free_text") || null;

  const data = {
    attempt_id:      attemptId,
    quiz_id:         attempt.quiz_id,
    child_id:        attempt.child_id,
    child_name:      attempt.child_name     || "Student",
    year_level:      attempt.year_level     || quiz?.year_level || 3,
    subject:         quiz?.subject          || "",
    quiz_name:       quiz?.quiz_name        || "",
    score_pct:       Math.round(attempt.score?.percentage || 0),
    score_points:    attempt.score?.points  || 0,
    score_available: attempt.score?.available || 0,
    topic_breakdown: attempt.topic_breakdown || {},
    wrong_questions: wrongQuestions,
    passage_text:    passage?.question_text || null,
  };

  cache.set(attemptId, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

function invalidateAttemptContext(attemptId) {
  cache.delete(attemptId);
}

module.exports = { getAttemptContext, invalidateAttemptContext };