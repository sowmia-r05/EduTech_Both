// ═══════════════════════════════════════════════════════════════
// src/app/data/bundleCatalog.js
//
// ★ UPDATED: Tiered bundle system (A / B / C) ★
//
// Bundle tiers work as follows:
//   Tier A (Starter):   Core full-length NAPLAN practice tests
//   Tier B (Standard):  Additional test sets + topic quizzes
//   Tier C (Complete):  Full access to everything
//
// Smart stacking logic:
//   - Buy B without A → Gets A + B quizzes (no gaps)
//   - Buy C without A or B → Gets A + B + C quizzes (everything)
//   - Buy A then B → B only adds new quizzes (no duplicates)
//   - Buy A then B then C → C only adds new quizzes
//
// The backend provisioning service handles the stacking automatically.
// The quiz counts below show what you GET (including lower tiers if standalone).
//
// IMPORTANT: The actual quiz IDs are synced dynamically from FlexiQuiz
// via: node scripts/syncFlexiQuizzes.js
// The counts below are ESTIMATES — the real counts come from the API.
//
// ★ SYNC: Keep in sync with scripts/syncFlexiQuizzes.js pricing ★
// ═══════════════════════════════════════════════════════════════

export const BUNDLE_CATALOG = [
  // ─── Year 3 ───
  {
    bundle_id: "year3_a",
    bundle_name: "Year 3 Starter Pack",
    description: "Core NAPLAN practice tests — perfect to get started",
    year_level: 3,
    tier: "A",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 5,  // updated dynamically from API
    price_cents: 1900,
    is_active: true,
  },
  {
    bundle_id: "year3_b",
    bundle_name: "Year 3 Standard Pack",
    description: "Extended practice with additional test sets and topic quizzes",
    year_level: 3,
    tier: "B",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 9,
    price_cents: 3500,
    is_active: true,
  },
  {
    bundle_id: "year3_c",
    bundle_name: "Year 3 Complete Pack",
    description: "Full access to every quiz — maximum preparation",
    year_level: 3,
    tier: "C",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 9,
    price_cents: 4900,
    is_active: true,
  },

  // ─── Year 5 ───
  {
    bundle_id: "year5_a",
    bundle_name: "Year 5 Starter Pack",
    description: "Core NAPLAN practice tests — perfect to get started",
    year_level: 5,
    tier: "A",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 5,
    price_cents: 2400,
    is_active: true,
  },
  {
    bundle_id: "year5_b",
    bundle_name: "Year 5 Standard Pack",
    description: "Extended practice with additional test sets and topic quizzes",
    year_level: 5,
    tier: "B",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 10,
    price_cents: 4500,
    is_active: true,
  },
  {
    bundle_id: "year5_c",
    bundle_name: "Year 5 Complete Pack",
    description: "Full access to every quiz — maximum preparation",
    year_level: 5,
    tier: "C",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 15,
    price_cents: 5900,
    is_active: true,
  },

  // ─── Year 7 ───
  {
    bundle_id: "year7_a",
    bundle_name: "Year 7 Starter Pack",
    description: "Core NAPLAN practice tests — perfect to get started",
    year_level: 7,
    tier: "A",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 5,
    price_cents: 2900,
    is_active: true,
  },
  {
    bundle_id: "year7_b",
    bundle_name: "Year 7 Standard Pack",
    description: "Extended practice with additional test sets and topic quizzes",
    year_level: 7,
    tier: "B",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 10,
    price_cents: 5200,
    is_active: true,
  },
  {
    bundle_id: "year7_c",
    bundle_name: "Year 7 Complete Pack",
    description: "Full access to every quiz — maximum preparation",
    year_level: 7,
    tier: "C",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 15,
    price_cents: 6900,
    is_active: true,
  },

  // ─── Year 9 ───
  {
    bundle_id: "year9_a",
    bundle_name: "Year 9 Starter Pack",
    description: "Core NAPLAN practice tests — perfect to get started",
    year_level: 9,
    tier: "A",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 5,
    price_cents: 2900,
    is_active: true,
  },
  {
    bundle_id: "year9_b",
    bundle_name: "Year 9 Standard Pack",
    description: "Extended practice with additional test sets and topic quizzes",
    year_level: 9,
    tier: "B",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 10,
    price_cents: 5200,
    is_active: true,
  },
  {
    bundle_id: "year9_c",
    bundle_name: "Year 9 Complete Pack",
    description: "Full access to every quiz — maximum preparation",
    year_level: 9,
    tier: "C",
    subjects: ["Conventions", "Maths", "Reading", "Writing"],
    included_tests: 15,
    price_cents: 6900,
    is_active: true,
  },
];

// ─── Helper: Get tier label for display ───
export const TIER_LABELS = {
  A: "Starter",
  B: "Standard",
  C: "Complete",
};

// ─── Helper: Check if a higher tier covers a lower one ───
export function tierCoversLower(purchasedTier, targetTier) {
  const order = { A: 1, B: 2, C: 3 };
  return (order[purchasedTier] || 0) >= (order[targetTier] || 0);
}

// ─── Helper: Get the best (highest) tier a child has for a year ───
export function getChildBestTier(childBundleIds = [], yearLevel) {
  const yearBundles = BUNDLE_CATALOG.filter(
    (b) => b.year_level === yearLevel && childBundleIds.includes(b.bundle_id)
  );
  if (!yearBundles.length) return null;

  const order = { A: 1, B: 2, C: 3 };
  yearBundles.sort((a, b) => (order[b.tier] || 0) - (order[a.tier] || 0));
  return yearBundles[0].tier;
}
