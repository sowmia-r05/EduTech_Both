// src/utils/quizHelpers.js
//
// Single source of truth for two rules that used to be copy-pasted across
// services and route handlers:
//
//   1. SUBJECT NORMALIZATION  — turn a free-text quiz_name into a canonical
//      subject. Kept identical to the original resultAiService logic so
//      behavior does not change; adds toModelSubject() to collapse the granular
//      set down to the CumulativeFeedback model enum.
//
//   2. QUESTION ORDERING       — sort questions by `order`, skip the free_text
//      passage, and assign the ON-SCREEN question number (the position among
//      answerable questions). This must match NativeQuizPlayer's
//      `answerableQuestions` numbering on the frontend, so keeping it in one
//      place stops the backend and the tutor prompt from drifting off-by-one.

// ─────────────────────────────────────────────────────────────
// Subject normalization
// ─────────────────────────────────────────────────────────────

// Granular subjects (what inferSubjectFromQuizName returns).
const SUBJECT = Object.freeze({
  NUMERACY:                 "Numeracy",
  NUMERACY_WITH_CALCULATOR: "Numeracy_with_calculator",
  LANGUAGE_CONVENTION:      "Language_convention",
  READING:                  "Reading",
  WRITING:                  "Writing",
});

// Coarse subjects used by the CumulativeFeedback model enum.
// enum: ["Overall", "Reading", "Writing", "Numeracy", "Language"]
const MODEL_SUBJECT = Object.freeze({
  OVERALL:  "Overall",
  READING:  "Reading",
  WRITING:  "Writing",
  NUMERACY: "Numeracy",
  LANGUAGE: "Language",
});

function normalizeQuizName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Infer the GRANULAR subject from a quiz_name.
 * Returns one of SUBJECT.* or "" (unknown).
 * (Behavior is identical to the original resultAiService implementation.)
 */
function inferSubjectFromQuizName(quizName) {
  const q = normalizeQuizName(quizName);

  // Most specific first
  if (
    q.includes("numeracy with calculator") ||
    q.includes("with calculator") ||
    q.includes("calculator")
  ) {
    return SUBJECT.NUMERACY_WITH_CALCULATOR;
  }

  if (
    q.includes("language convention") ||
    q.includes("language conventions") ||
    q.includes("conventions")
  ) {
    return SUBJECT.LANGUAGE_CONVENTION;
  }

  if (q.includes("numeracy")) return SUBJECT.NUMERACY;
  if (q.includes("reading"))  return SUBJECT.READING;
  if (q.includes("writing"))  return SUBJECT.WRITING;

  return "";
}

/**
 * Collapse a granular subject (or raw quiz_name) down to the coarse set the
 * CumulativeFeedback model enum accepts. Use this before writing `subject`
 * to that collection so you never hit a Mongoose enum validation error.
 *   Numeracy_with_calculator → Numeracy
 *   Language_convention      → Language
 * Unknown → "" (caller decides whether to fall back to "Overall").
 */
function toModelSubject(subjectOrQuizName) {
  // Accept either an already-granular subject or a raw quiz_name.
  const granular = Object.values(SUBJECT).includes(subjectOrQuizName)
    ? subjectOrQuizName
    : inferSubjectFromQuizName(subjectOrQuizName);

  switch (granular) {
    case SUBJECT.NUMERACY:
    case SUBJECT.NUMERACY_WITH_CALCULATOR:
      return MODEL_SUBJECT.NUMERACY;
    case SUBJECT.LANGUAGE_CONVENTION:
      return MODEL_SUBJECT.LANGUAGE;
    case SUBJECT.READING:
      return MODEL_SUBJECT.READING;
    case SUBJECT.WRITING:
      return MODEL_SUBJECT.WRITING;
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────────
// Question ordering / on-screen numbering
// ─────────────────────────────────────────────────────────────

/**
 * Is this question the reading passage (not an answerable question)?
 * The player does NOT number the free_text passage, so neither do we.
 */
function isPassageQuestion(q) {
  return q?.type === "free_text";
}

/**
 * Given the raw question docs for a quiz, produce the canonical on-screen order.
 *
 * Returns:
 *   {
 *     sorted:   [...questions sorted by `order` asc],
 *     numbered: [{ question, question_number }]  // answerable only, 1-based
 *     passage:  <first free_text|writing doc, or null>
 *   }
 *
 * `question_number` is the position among ANSWERABLE questions (passage skipped),
 * which is exactly what the student sees on screen — so "Q3" here === "Q3" there.
 */
function orderAnswerableQuestions(questions) {
  const sorted = [...(questions || [])].sort(
    (a, b) => (a?.order ?? 0) - (b?.order ?? 0)
  );

  const numbered = [];
  let qNum = 0;

  for (const q of sorted) {
    if (isPassageQuestion(q)) continue; // passage is not numbered
    qNum += 1;
    numbered.push({ question: q, question_number: qNum });
  }

  const passage =
    sorted.find((q) => q?.type === "free_text" || q?.type === "writing") || null;

  return { sorted, numbered, passage };
}

module.exports = {
  SUBJECT,
  MODEL_SUBJECT,
  normalizeQuizName,
  inferSubjectFromQuizName,
  toModelSubject,
  isPassageQuestion,
  orderAnswerableQuestions,
};