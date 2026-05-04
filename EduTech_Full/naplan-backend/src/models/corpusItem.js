/**
 * corpusItem.js
 *
 * Reference corpus of known third-party questions used for originality checks.
 *
 * Sources you can ingest:
 *   - ACARA NAPLAN past papers / sample tests   (publicly available PDFs)
 *   - ACARA Online Preliminary Materials
 *   - Excel, Cambridge, AdvancePlus, etc.       (when legally licensed)
 *
 * On every new Question insert, we compare its fingerprints + embedding
 * against this collection to ensure it's not a copy of any reference item.
 *
 * Place at: src/models/corpusItem.js
 */

const mongoose = require("mongoose");

const corpusItemSchema = new mongoose.Schema(
  {
    // ─── Provenance ─────────────────────────────────────────
    source: {
      publisher:   { type: String, required: true, index: true }, // "ACARA", "Excel"
      title:       { type: String, required: true },              // "NAPLAN 2019 Numeracy Y5"
      year:        { type: Number },
      year_level:  { type: Number, index: true },                 // 3 / 5 / 7 / 9
      subject:     { type: String, index: true },                 // Numeracy / Reading / Writing / Language
      page:        { type: Number },
      question_no: { type: String },                              // "Q14" / "Section A.3"
      source_url:  { type: String },
    },

    // ─── Content ────────────────────────────────────────────
    text:           { type: String, required: true },
    options:        [{ label: String, text: String, correct: Boolean }],
    correct_answer: { type: String },

    // ─── Fingerprints (indexed for O(1) lookups) ────────────
    exact_hash:           { type: String, index: true },
    structural_hash:      { type: String, index: true },
    stem_exact_hash:      { type: String, index: true },
    stem_structural_hash: { type: String, index: true },

    // ─── Embedding for semantic similarity ──────────────────
    embedding:       { type: [Number] },     // 768-dim vector for text-embedding-004
    embedding_model: { type: String },       // tracked for re-embedding migrations

    ingested_at: { type: Date, default: Date.now },
  },
  { collection: "corpus_items" }
);

// Compound index used to narrow brute-force similarity scans by year/subject
corpusItemSchema.index({ "source.subject": 1, "source.year_level": 1 });

module.exports =
  mongoose.models.CorpusItem || mongoose.model("CorpusItem", corpusItemSchema);