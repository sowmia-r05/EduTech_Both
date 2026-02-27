/**
 * src/data/quizMap.js
 *
 * ═══════════════════════════════════════════════════════════════
 * HARDCODED QUIZ MAP — Single Source of Truth
 * ═══════════════════════════════════════════════════════════════
 *
 * Every quiz and its FlexiQuiz embed ID, organized by year + tier.
 *
 * Tier A (Full Tests):       Full-length NAPLAN practice tests
 * Tier B (Topic Standard):   Easy/medium topic quizzes
 * Tier C (Topic Hard):       Hard topic quizzes
 *
 * IMPORTANT: quiz_name values MUST match the FlexiQuiz API names exactly
 * (as returned by GET /v1/quizzes) for auto-resolution to work.
 *
 * To add a new quiz:
 *   1. Add it to the correct year + tier array below
 *   2. Run: node scripts/seedBundles.js
 *   3. Done — the bundle catalog in MongoDB will update automatically
 *
 * To add a new year level:
 *   1. Add a new YEAR_X object following the same pattern
 *   2. Add it to QUIZ_MAP
 *   3. Add pricing in seedBundles.js
 *   4. Run: node scripts/seedBundles.js
 */

// ═══════════════════════════════════════════════════════════════
// YEAR 3 QUIZZES
// ═══════════════════════════════════════════════════════════════

const YEAR_3 = {
  // Tier A: Full-length NAPLAN practice tests
  A: [
    { quiz_id: "87c82fac-2a4e-486d-b566-8200514fa7fc", quiz_name: "Year3 Writing", subject: "Writing" },
    { quiz_id: "6db1c3ab-db7c-402d-b08d-45f5fc8a48b3", quiz_name: "Year3 Reading", subject: "Reading" },
    { quiz_id: "2782fc4e-548e-4782-81dc-321c81101742", quiz_name: "Year3 Reading set 2", subject: "Reading" },
    { quiz_id: "7a5a06c3-7bdb-47ba-bcf4-182d105710cf", quiz_name: "Year3 Numeracy", subject: "Maths" },
    { quiz_id: "7474b871-b2f4-44c3-ac4a-788aca433ae8", quiz_name: "Year3 Numeracy set2", subject: "Maths" },
  ],

  // Tier B: Standard/medium topic quizzes
  B: [
    { quiz_id: "ca3c6d7f-5370-41a4-87f7-8e098d762461", quiz_name: "Year3 Medium Number and Algebra", subject: "Maths" },
    { quiz_id: "6cb798a7-a5cb-44c2-a587-1c92b899b3d5", quiz_name: "Year3 Medium Grammar & Punctuation set2", subject: "Conventions" },
    { quiz_id: "f1a0e888-e486-4049-826c-ce39f631ec5d", quiz_name: "Year3 Language full set2", subject: "Conventions" },
  ],

  // Tier C: Hard topic quizzes
  C: [
    { quiz_id: "79b9e678-59b0-4db3-a59f-99398c036015", quiz_name: "Year3 Hard Grammar & Punctuation set2", subject: "Conventions" },
  ],
};

// ═══════════════════════════════════════════════════════════════
// YEAR 5 QUIZZES (add your quiz IDs here when ready)
// ═══════════════════════════════════════════════════════════════

const YEAR_5 = {
  A: [
    // { quiz_id: "...", quiz_name: "Year 5 Writing", subject: "Writing" },
    // { quiz_id: "...", quiz_name: "Year 5 Reading", subject: "Reading" },
  ],
  B: [],
  C: [],
};

// ═══════════════════════════════════════════════════════════════
// YEAR 7 QUIZZES (add your quiz IDs here when ready)
// ═══════════════════════════════════════════════════════════════

const YEAR_7 = {
  A: [],
  B: [],
  C: [],
};

// ═══════════════════════════════════════════════════════════════
// YEAR 9 QUIZZES (add your quiz IDs here when ready)
// ═══════════════════════════════════════════════════════════════

const YEAR_9 = {
  A: [],
  B: [],
  C: [],
};

// ═══════════════════════════════════════════════════════════════
// MASTER QUIZ MAP
// ═══════════════════════════════════════════════════════════════

const QUIZ_MAP = {
  3: YEAR_3,
  5: YEAR_5,
  7: YEAR_7,
  9: YEAR_9,
};

module.exports = { QUIZ_MAP, YEAR_3, YEAR_5, YEAR_7, YEAR_9 };