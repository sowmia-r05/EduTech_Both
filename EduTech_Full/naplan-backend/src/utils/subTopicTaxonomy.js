/**
 * subTopicTaxonomy.js
 *
 * Fixed vocabulary of allowed sub-topics per subject.
 * Using standard NAPLAN / Australian Curriculum terminology so that
 * analytics aggregate correctly across quizzes.
 *
 * Structure
 * ─────────
 * LANGUAGE CONVENTIONS (flat — single list per topic):
 *   - Spelling     → 10 sub-topics
 *   - Grammar      → 10 sub-topics
 *   - Punctuation  → 10 sub-topics
 *
 * NUMERACY (hierarchical — 3 strands × 10 sub-topics):
 *   - Number & Algebra
 *   - Measurement & Geometry
 *   - Statistics & Probability
 *   Each question gets BOTH a strand tag AND a fine-grained sub-topic.
 *
 * SKIPPED subjects:
 *   - Reading (no taxonomy)
 *   - Writing (uses its own marking criteria via the writing evaluator)
 *
 * Why fixed lists?
 * ────────────────
 * If the AI generates labels freely, it produces "Silent letters" for
 * one quiz and "Silent consonants" for another — they never group
 * together on the dashboard. A fixed list forces consistent labels.
 */

// ─── LANGUAGE CONVENTIONS taxonomies ─────────────────────────
const LANGUAGE_TAXONOMIES = {
  spelling: [
    "Silent Letters",
    "Double Consonants",
    "Homophones",
    "Suffix Rules",
    "Prefix Rules",
    "Common Misspellings",
    "Vowel Patterns",
    "Plural Forms",
    "Compound Words",
    "Word Endings",
  ],

  grammar: [
    "Subject-Verb Agreement",
    "Tense Consistency",
    "Pronouns & Reference",
    "Apostrophes",
    "Commas & Clauses",
    "Capital Letters",
    "Quotation Marks & Dialogue",
    "Sentence Structure",
    "Conjunctions & Connectives",
    "Articles & Determiners",
  ],

  punctuation: [
    "Apostrophes",
    "Commas & Clauses",
    "Capital Letters",
    "Quotation Marks & Dialogue",
    "Full Stops & Sentence Endings",
    "Colons & Semicolons",
    "Question & Exclamation Marks",
    "Hyphens & Dashes",
    "Parentheses & Brackets",
    "Punctuation in Lists",
  ],
};

// ─── NUMERACY taxonomies (3 strands × 10 sub-topics) ─────────
const NUMERACY_STRANDS = {
  "Number & Algebra": [
    "Place Value",
    "Addition & Subtraction",
    "Multiplication & Division",
    "Fractions",
    "Decimals",
    "Percentages",
    "Integers & Negative Numbers",
    "Ratios & Proportions",
    "Patterns & Sequences",
    "Algebraic Expressions & Equations",
  ],

  "Measurement & Geometry": [
    "Length & Perimeter",
    "Area & Surface Area",
    "Volume & Capacity",
    "Mass & Weight",
    "Time & Duration",
    "Temperature",
    "2D Shapes & Angles",
    "3D Shapes & Nets",
    "Location & Transformation",
    "Coordinate Geometry",
  ],

  "Statistics & Probability": [
    "Data Collection & Surveys",
    "Tables & Frequency",
    "Graphs (Bar, Line, Pie)",
    "Mean, Median, Mode",
    "Range & Spread",
    "Probability of Events",
    "Chance & Likelihood",
    "Experimental Probability",
    "Theoretical Probability",
    "Interpreting Statistics",
  ],
};

// Flat list of all numeracy sub-topics (for validation + reverse lookup)
const NUMERACY_ALL_LABELS = Object.values(NUMERACY_STRANDS).flat();

// Reverse map: sub-topic → strand (for looking up which strand a label belongs to)
const NUMERACY_LABEL_TO_STRAND = {};
for (const [strand, labels] of Object.entries(NUMERACY_STRANDS)) {
  for (const label of labels) {
    NUMERACY_LABEL_TO_STRAND[label.toLowerCase()] = strand;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function normalise(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * Resolve which taxonomy applies to a quiz.
 *
 * Returns one of:
 *   { mode: "language", key: "spelling", labels: [...] }
 *   { mode: "numeracy", strands: {...}, allLabels: [...], labelToStrand: {...} }
 *   { mode: "skip", reason: "Reading — no taxonomy defined" }
 *   { mode: "skip", reason: "Writing — uses its own marking criteria" }
 *   { mode: "unknown" }   — quiz doesn't match anything we know about
 */
function resolveTaxonomy(quiz) {
  const subTopic = normalise(quiz?.sub_topic);
  const subject = normalise(quiz?.subject);

  // ── Explicit skip: Reading ──
  if (subTopic.includes("reading") || subject.includes("reading")) {
    return { mode: "skip", reason: "Reading — no taxonomy defined for this subject" };
  }

  // ── Explicit skip: Writing ──
  if (subTopic.includes("writing") || subject.includes("writing")) {
    return { mode: "skip", reason: "Writing — uses its own marking criteria" };
  }

  // ── Numeracy ──
  if (
    subject.includes("numeracy") ||
    subject.includes("math") ||
    subject.includes("number") ||
    subTopic.includes("numeracy") ||
    subTopic.includes("math")
  ) {
    return {
      mode: "numeracy",
      strands: NUMERACY_STRANDS,
      allLabels: NUMERACY_ALL_LABELS,
      labelToStrand: NUMERACY_LABEL_TO_STRAND,
    };
  }

  // ── Language Conventions: specific topic match ──
  const languageMatchers = [
    { keys: ["spelling"], taxonomy: "spelling" },
    { keys: ["punctuation"], taxonomy: "punctuation" },
    { keys: ["grammar", "language conventions", "convention"], taxonomy: "grammar" },
  ];

  for (const { keys, taxonomy } of languageMatchers) {
    for (const key of keys) {
      if (subTopic.includes(key) || subject.includes(key)) {
        return {
          mode: "language",
          key: taxonomy,
          labels: LANGUAGE_TAXONOMIES[taxonomy],
        };
      }
    }
  }

  // ── Fallback ──
  return { mode: "unknown" };
}

module.exports = {
  LANGUAGE_TAXONOMIES,
  NUMERACY_STRANDS,
  NUMERACY_ALL_LABELS,
  NUMERACY_LABEL_TO_STRAND,
  resolveTaxonomy,
};