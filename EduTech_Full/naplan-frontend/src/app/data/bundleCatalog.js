// ═══════════════════════════════════════════════════════════════
// src/app/data/bundleCatalog.js
//
// ★ STANDALONE TIERS — 3 independent bundles per year ★
//
// Each tier is a separate purchase. No stacking, no prerequisites.
//   Tier A (Full Tests):       All full-length NAPLAN practice tests
//   Tier B (Topic Standard):   Easy/medium topic-wise quizzes
//   Tier C (Topic Hard):       Hard topic quizzes
//
// Buy any tier in any order. Each gives ONLY its own quizzes.
//
// The quiz IDs here match src/data/quizMap.js (backend).
// The quiz_catalog collection in MongoDB is the runtime source of truth,
// seeded by: node scripts/seedBundles.js
// ═══════════════════════════════════════════════════════════════

export const BUNDLE_CATALOG = [
  // ─── Year 3 ───
  {
    bundle_id: "year3_a",
    bundle_name: "Year 3 Full Tests",
    description: "Full-length NAPLAN practice tests across all subjects",
    year_level: 3,
    tier: "A",
    subjects: ["Maths", "Reading", "Writing"],
    included_tests: 5,
    price_cents: 1900,
    is_active: true,
  },
  {
    bundle_id: "year3_b",
    bundle_name: "Year 3 Topic Quizzes — Standard",
    description: "Standard and medium difficulty topic-wise quizzes for targeted practice",
    year_level: 3,
    tier: "B",
    subjects: ["Conventions", "Maths"],
    included_tests: 3,
    price_cents: 2500,
    is_active: true,
  },
  {
    bundle_id: "year3_c",
    bundle_name: "Year 3 Topic Quizzes — Hard",
    description: "Hard topic quizzes for advanced preparation and challenge",
    year_level: 3,
    tier: "C",
    subjects: ["Conventions"],
    included_tests: 1,
    price_cents: 2500,
    is_active: true,
  },

  // ─── Year 5 (placeholder — add when quizzes are ready) ───
  // {
  //   bundle_id: "year5_a",
  //   bundle_name: "Year 5 Full Tests",
  //   ...
  // },

  // ─── Year 7 (placeholder) ───

  // ─── Year 9 (placeholder) ───
];

// ── Helpers ──

/** Get all active bundles for a year level */
export function getBundlesForYear(yearLevel) {
  return BUNDLE_CATALOG.filter((b) => b.year_level === yearLevel && b.is_active);
}

/** Get a single bundle by ID */
export function getBundleById(bundleId) {
  return BUNDLE_CATALOG.find((b) => b.bundle_id === bundleId && b.is_active);
}

/** Get tier label for display */
export function getTierLabel(tier) {
  const labels = {
    A: "Full Tests",
    B: "Topic — Standard",
    C: "Topic — Hard",
  };
  return labels[tier] || tier;
}