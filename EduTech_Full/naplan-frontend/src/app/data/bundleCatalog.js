// ═══════════════════════════════════════════════════════════════
// src/app/data/bundleCatalog.js
//
// ★ SINGLE SOURCE OF TRUTH for all bundle definitions ★
//
// This file is imported by:
//   1. ParentDashboard.jsx  → BundleSelectionModal
//   2. Bundleselectionpage.jsx → fallback when API is down
//
// The backend seed script (scripts/seedBundles.js) must match
// these exact bundle_ids, prices, subjects, and descriptions.
//
// RULE: If you change a bundle here, update seedBundles.js too
//       and re-run: node scripts/seedBundles.js
// ═══════════════════════════════════════════════════════════════

export const BUNDLE_CATALOG = [
  // ─── Year 3 ───
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 3,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 12,
    price_cents: 4900,
    is_active: true,
  },
  {
    bundle_id: "year3_maths",
    bundle_name: "Year 3 Maths Only",
    description: "Focused Maths practice — 6 full-length tests",
    year_level: 3,
    subjects: ["Maths"],
    included_tests: 6,
    price_cents: 1900,
    is_active: true,
  },
  {
    bundle_id: "year3_english",
    bundle_name: "Year 3 English Pack",
    description: "Reading, Writing & Conventions combined",
    year_level: 3,
    subjects: ["Reading", "Writing", "Conventions"],
    included_tests: 9,
    price_cents: 3500,
    is_active: true,
  },

  // ─── Year 5 ───
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 5,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 14,
    price_cents: 5900,
    is_active: true,
  },
  {
    bundle_id: "year5_maths",
    bundle_name: "Year 5 Maths Only",
    description: "Focused Maths practice — 8 full-length tests",
    year_level: 5,
    subjects: ["Maths"],
    included_tests: 8,
    price_cents: 2400,
    is_active: true,
  },

  // ─── Year 7 ───
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 7,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 16,
    price_cents: 6900,
    is_active: true,
  },

  // ─── Year 9 ───
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 9,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 16,
    price_cents: 6900,
    is_active: true,
  },
];