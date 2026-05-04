/**
 * originalityCheck.js
 *
 * FOUR-layer originality check for a candidate question:
 *
 *   Layer 1 — exact fingerprint match        (verbatim text copies)
 *   Layer 2 — structural fingerprint match   (numbers/dates/money swapped)
 *   Layer 3 — semantic embedding similarity  (paraphrased text copies)
 *   Layer 4 — image web detection            (copied diagrams/charts/illustrations)
 *
 * Layers 1–3 run against:
 *   (a) the corpus_items collection — third-party copyrighted questions
 *   (b) the questions collection    — your own bank (internal duplicates)
 *
 * Layer 4 runs against Google's web index (Cloud Vision Web Detection) and
 * flags images that match any high-risk publisher domain (ACARA, NAPLAN,
 * known textbook publishers, etc.).
 *
 * Place at: src/utils/originalityCheck.js
 *
 * Usage:
 *   const { checkOriginality } = require("./originalityCheck");
 *   const result = await checkOriginality(
 *     { text, options, image_url, image_urls },
 *     { excludeQuestionId, yearLevel, subject }
 *   );
 */

const Question   = require("../models/question");
const CorpusItem = require("../models/corpusItem");
const { fingerprintQuestion } = require("./originalityFingerprints");
const { embedText, cosineSimilarity } = require("./embeddingClient");
const { checkImagesForQuestion }      = require("./imageOriginalityCheck");

// ═══════════════════════════════════════════════════════════════
// THRESHOLDS  (tune as you collect tutor feedback)
// ═══════════════════════════════════════════════════════════════

const SEMANTIC_HIGH   = 0.92;   // ≥ → block
const SEMANTIC_REVIEW = 0.82;   // ≥ and < HIGH → flag for tutor
const SEMANTIC_TOP_K  = 5;      // top-K matches surfaced to UI

// ═══════════════════════════════════════════════════════════════
// LAYER 1 + 2 — fingerprint lookups
// ═══════════════════════════════════════════════════════════════

async function lookupFingerprints(fp, excludeQuestionId) {
  const internalFilter = excludeQuestionId
    ? { question_id: { $ne: excludeQuestionId } }
    : {};

  const [
    corpusExact,
    corpusStructural,
    internalExact,
    internalStructural,
  ] = await Promise.all([
    fp.exact_hash
      ? CorpusItem.findOne({ exact_hash: fp.exact_hash }).lean()
      : null,
    fp.structural_hash
      ? CorpusItem.findOne({ structural_hash: fp.structural_hash }).lean()
      : null,
    fp.exact_hash
      ? Question.findOne({
          ...internalFilter,
          "originality.exact_hash": fp.exact_hash,
        }).lean()
      : null,
    fp.structural_hash
      ? Question.findOne({
          ...internalFilter,
          "originality.structural_hash": fp.structural_hash,
        }).lean()
      : null,
  ]);

  return { corpusExact, corpusStructural, internalExact, internalStructural };
}

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — embedding similarity
// ═══════════════════════════════════════════════════════════════

async function lookupSemanticMatches(embedding, opts = {}) {
  const { yearLevel, subject } = opts;
  const filter = { embedding: { $exists: true, $ne: null } };
  if (yearLevel) filter["source.year_level"] = yearLevel;
  if (subject)   filter["source.subject"]    = subject;

  const corpus = await CorpusItem.find(filter)
    .select("source text embedding")
    .lean();

  return corpus
    .map((item) => ({
      similarity: cosineSimilarity(embedding, item.embedding),
      source: item.source,
      text: item.text,
      _id: item._id,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SEMANTIC_TOP_K);
}

// ═══════════════════════════════════════════════════════════════
// STATUS DECISION
// ═══════════════════════════════════════════════════════════════

function decideStatus({
  corpusExact,
  corpusStructural,
  internalExact,
  internalStructural,
  semanticMatches,
  imageResult,
}) {
  // Image-based blocks are the most severe (verbatim image on a copyrighted source)
  if (imageResult?.status === "blocked_full_match_high_risk") return "blocked_image_high_risk";
  if (imageResult?.status === "blocked_full_match")           return "blocked_image_full_match";
  if (imageResult?.status === "blocked_high_risk_page")       return "blocked_image_on_risk_page";

  // Text-based blocks
  if (corpusExact)        return "blocked_exact_corpus";
  if (corpusStructural)   return "blocked_structural_corpus";
  if (internalExact)      return "duplicate_internal_exact";
  if (internalStructural) return "duplicate_internal_structural";

  // Semantic threshold blocks
  const top = semanticMatches[0];
  if (top && top.similarity >= SEMANTIC_HIGH)   return "blocked_semantic";

  // Reviews (not blocking, just tutor attention)
  if (top && top.similarity >= SEMANTIC_REVIEW)            return "review_semantic";
  if (imageResult?.status === "review_partial_match")      return "review_image_partial";

  return "clean";
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

async function checkOriginality(question, opts = {}) {
  const {
    excludeQuestionId,
    yearLevel,
    subject,
    skipEmbedding = false,
    skipImage     = false,
  } = opts;

  // ─── Layer 1 + 2: fingerprints ─────────────────────────────
  const fp = fingerprintQuestion(question);
  const fpResults = await lookupFingerprints(fp, excludeQuestionId);

  // ─── Layer 3: embedding ────────────────────────────────────
  let semanticMatches = [];
  let embedding = null;
  if (!skipEmbedding && !fpResults.corpusExact) {
    try {
      embedding = await embedText(question.text);
      semanticMatches = await lookupSemanticMatches(embedding, { yearLevel, subject });
    } catch (err) {
      console.error("originalityCheck: embedding failed:", err.message);
    }
  }

  // ─── Layer 4: image web detection ──────────────────────────
  // Accept either a single `image_url` or an array `image_urls`.
  // Also scan option images if your schema attaches images to options.
  let imageResult = null;
  if (!skipImage) {
    const imageUrls = [];
    if (question.image_url) imageUrls.push(question.image_url);
    if (Array.isArray(question.image_urls)) imageUrls.push(...question.image_urls);
    if (Array.isArray(question.options)) {
      for (const o of question.options) {
        if (o?.image_url) imageUrls.push(o.image_url);
      }
    }
    const unique = [...new Set(imageUrls.filter(Boolean))];
    if (unique.length > 0) {
      try {
        imageResult = await checkImagesForQuestion(unique);
      } catch (err) {
        console.error("originalityCheck: image check failed:", err.message);
      }
    }
  }

  // ─── Decide overall status ─────────────────────────────────
  const status = decideStatus({ ...fpResults, semanticMatches, imageResult });

  return {
    status,
    fingerprints: fp,
    embedding,
    layers: {
      exact: {
        corpus_match: fpResults.corpusExact ? {
          source: fpResults.corpusExact.source,
          matched_id: fpResults.corpusExact._id,
        } : null,
        internal_match: fpResults.internalExact ? {
          question_id: fpResults.internalExact.question_id,
          quiz_ids: fpResults.internalExact.quiz_ids,
        } : null,
      },
      structural: {
        corpus_match: fpResults.corpusStructural ? {
          source: fpResults.corpusStructural.source,
          matched_id: fpResults.corpusStructural._id,
          matched_text: fpResults.corpusStructural.text,
        } : null,
        internal_match: fpResults.internalStructural ? {
          question_id: fpResults.internalStructural.question_id,
          quiz_ids: fpResults.internalStructural.quiz_ids,
          text: fpResults.internalStructural.text,
        } : null,
      },
      semantic: {
        top_matches: semanticMatches.map((m) => ({
          similarity: Number(m.similarity.toFixed(4)),
          source: m.source,
          text: m.text,
          matched_id: m._id,
        })),
        highest_similarity: semanticMatches[0]?.similarity ?? null,
      },
      image: imageResult, // null if no images / skipped
    },
    checked_at: new Date(),
  };
}

module.exports = {
  checkOriginality,
  SEMANTIC_HIGH,
  SEMANTIC_REVIEW,
};