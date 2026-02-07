/**
 * Build topicBreakdown from FlexiQuiz question list.
 *
 * Output example:
 * {
 *   Algebra: { scored: 18, total: 25 },
 *   Geometry: { scored: 14, total: 15 },
 *   Probability: { scored: 7, total: 10 }
 * }
 *
 * Rules:
 * - Group by category name (categories[].name)
 * - Add points_scored and points_available across all questions for the SAME category
 * - If a question has multiple categories, FULL points are added to EACH category
 *   (as requested)
 */
function buildTopicBreakdownFromQuestions(questions) {
  const breakdown = {};
  const arr = Array.isArray(questions) ? questions : [];

  for (const q of arr) {
    const scored = Number(q?.points_scored ?? 0);
    const total = Number(q?.points_available ?? 0);

    const categories = Array.isArray(q?.categories) ? q.categories : [];
    const names = categories
      .map((c) => String(c?.name || "").trim())
      .filter(Boolean);

    if (names.length === 0) continue;

    for (const name of names) {
      if (!breakdown[name]) breakdown[name] = { scored: 0, total: 0 };
      breakdown[name].scored += scored;
      breakdown[name].total += total;
    }
  }

  // Round to 2 decimals for cleanliness
  for (const k of Object.keys(breakdown)) {
    breakdown[k].scored = Math.round(breakdown[k].scored * 100) / 100;
    breakdown[k].total = Math.round(breakdown[k].total * 100) / 100;
  }

  return breakdown;
}

module.exports = { buildTopicBreakdownFromQuestions };
