// src/app/utils/quiz-helpers.js
//
// Shared quiz utility functions.
// ✅ getEstMinutes — auto-determines estimated quiz duration from name + difficulty.

/**
 * Auto-determines estimated minutes for a quiz based on its name and difficulty.
 *
 * Rules:
 *   Full test (Reading, Numeracy, Writing, Language Full) → 45 min
 *   Sub-subject test (Grammar, Spelling, Number & Algebra, etc.)
 *     - Standard / Medium difficulty → 20 min
 *     - Hard difficulty             → 30 min
 *
 * If quiz.est_minutes is already set, that value is used (manual override).
 *
 * @param {{ name: string, difficulty?: string, est_minutes?: number }} quiz
 * @returns {number} estimated minutes
 */
export function getEstMinutes(quiz) {
  // Manual override — if est_minutes is explicitly set, use it
  if (quiz.est_minutes) return quiz.est_minutes;

  const name = (quiz.name || "").toLowerCase().trim();
  const difficulty = (quiz.difficulty || "Standard").toLowerCase();

  // ── Detect full tests by name pattern ──
  //
  // Full tests match:
  //   "Year 3 Reading", "Year 3 Reading Set 2"
  //   "Year 3 Numeracy", "Year 5 Numeracy Set 2"
  //   "Year 3 Writing"
  //   "Year 3 Language Full Set 2"
  //   Anything with "Full" in the name
  //
  // NOT full tests (sub-subjects):
  //   "Year 3 Grammar & Punctuation Set 2"
  //   "Year 3 Number and Algebra"
  //   "Year 3 Spelling"
  //   "Year 3 Reading Comprehension Subset"

  const isFullTest = (
    name.includes("full") ||
    /year\s*\d+\s+writing\b/.test(name) ||
    /year\s*\d+\s+reading(\s+set\s*\d+)?$/.test(name) ||
    /year\s*\d+\s+numeracy(\s+set\s*\d+)?$/.test(name) ||
    /year\s*\d+\s+language\s+full/.test(name)
  );

  if (isFullTest) return 45;

  // Sub-subject: Hard → 30 min, otherwise → 20 min
  if (difficulty === "hard") return 30;
  return 20;
}