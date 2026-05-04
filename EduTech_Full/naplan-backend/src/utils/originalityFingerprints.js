/**
 * originalityFingerprints.js
 *
 * Two SHA-256 fingerprints per question:
 *
 *   exactFingerprint     — catches verbatim copies (whitespace/case-insensitive)
 *   structuralFingerprint — catches "numbers swapped" copies by replacing
 *                           numbers, money, times, dates, fractions, percents
 *                           with placeholders before hashing
 *
 * Both fingerprints are stored on Question docs and indexed for O(1) lookup.
 *
 * Place at: src/utils/originalityFingerprints.js
 *
 * Usage:
 *   const { fingerprintQuestion } = require("./originalityFingerprints");
 *   const fp = fingerprintQuestion({ text, options });
 *   // fp = { exact_hash, structural_hash, stem_exact_hash, stem_structural_hash }
 */

const crypto = require("crypto");

// ═══════════════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════════════

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForExact(text) {
  return stripDiacritics(String(text || ""))
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")    // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')    // smart double quotes
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForStructural(text) {
  let s = stripDiacritics(String(text || "")).toLowerCase();

  // Replace structured numeric tokens FIRST (order matters)
  s = s.replace(/\$\s?[\d,]+(\.\d+)?/g, "<MONEY>");           // $4.50, $1,200.00
  s = s.replace(/\b\d{1,2}\s?(am|pm)\b/g, "<TIME>");          // 3pm, 11 am
  s = s.replace(/\b\d{1,2}[:.]\d{2}\b/g, "<TIME>");           // 3:45, 9.30
  s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/g, "<DATE>");
  s = s.replace(/\b\d+\s?%/g, "<PCT>");                       // 25%, 25 %
  s = s.replace(/\b\d+\/\d+\b/g, "<FRAC>");                   // 1/2, 3/4
  s = s.replace(/\b\d+(\.\d+)?\b/g, "<NUM>");                 // any other number

  // Strip punctuation, collapse whitespace
  s = s.replace(/[^\w\s<>]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

function exactFingerprint(text) {
  const n = normalizeForExact(text);
  if (!n) return null;
  return crypto.createHash("sha256").update(n).digest("hex");
}

function structuralFingerprint(text) {
  const n = normalizeForStructural(text);
  if (!n) return null;
  return crypto.createHash("sha256").update(n).digest("hex");
}

/**
 * Build all four fingerprints for a question.
 *
 * We compute fingerprints both for the stem alone AND for the
 * stem+options combined, because two questions with the same stem
 * but different option sets are NOT duplicates (different correct
 * answers, different difficulty), while two questions with the same
 * stem AND options definitely are.
 */
function fingerprintQuestion({ text, options }) {
  const stem = String(text || "");
  const optsText = (options || [])
    .map((o) => String(o.text || ""))
    .filter(Boolean)
    .join(" | ");
  const combined = optsText ? `${stem} || ${optsText}` : stem;

  return {
    exact_hash:           exactFingerprint(combined),
    structural_hash:      structuralFingerprint(combined),
    stem_exact_hash:      exactFingerprint(stem),
    stem_structural_hash: structuralFingerprint(stem),
  };
}

module.exports = {
  exactFingerprint,
  structuralFingerprint,
  fingerprintQuestion,
  normalizeForExact,
  normalizeForStructural,
};