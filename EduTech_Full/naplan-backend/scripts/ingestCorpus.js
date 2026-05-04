/**
 * ingestCorpus.js
 *
 * Ingests NAPLAN past papers, ACARA sample tests, and licensed practice books
 * into the corpus_items collection for originality checks.
 *
 * Place at: scripts/ingestCorpus.js
 *
 * Setup:
 *   mkdir -p corpus_sources/ACARA
 *   mkdir -p corpus_sources/Excel
 *   # Drop PDFs in. Filename hints help: y3, y5, y7, y9, year_5,
 *   # numeracy / reading / writing / language, and a 4-digit year.
 *   #
 *   # Recommended naming:
 *   #   corpus_sources/ACARA/naplan_2019_y5_numeracy.pdf
 *   #   corpus_sources/ACARA/naplan_2018_y3_reading.pdf
 *   #   corpus_sources/Excel/excel_y3_practice_2021.pdf
 *
 * Run:
 *   node scripts/ingestCorpus.js                  # all PDFs
 *   node scripts/ingestCorpus.js --publisher=ACARA
 *   node scripts/ingestCorpus.js --file=./corpus_sources/ACARA/x.pdf
 *
 * What it does for each PDF:
 *   1. Sends PDF to Gemini, asks for a structured JSON list of questions
 *   2. Computes fingerprints + 768-dim embedding for each
 *   3. Upserts into corpus_items (idempotent on exact_hash — safe to re-run)
 *
 * Requires env: GEMINI_API_KEY, MONGO_URI
 */

const path = require("path");
const fs   = require("fs");
require("dotenv").config();

const connectDB  = require("../src/config/db");
const CorpusItem = require("../src/models/corpusItem");
const { fingerprintQuestion } = require("../src/utils/originalityFingerprints");
const { embedText }           = require("../src/utils/embeddingClient");

const CORPUS_DIR = path.resolve(process.cwd(), "corpus_sources");

// ═══════════════════════════════════════════════════════════════
// PDF → questions via Gemini (vision)
// ═══════════════════════════════════════════════════════════════

async function extractQuestionsFromPdf(pdfPath, sourceMeta) {
  const fileBuf = fs.readFileSync(pdfPath);
  const base64  = fileBuf.toString("base64");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.LLM_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const subject = sourceMeta.subject || "the subject of this document";
  const year    = sourceMeta.year_level || "the year level shown in this document";

  const prompt = `You are extracting questions from an Australian school assessment PDF.
Subject: ${subject}. Year level: ${year}.

For EVERY question in this document, output an object with these fields:
  - question_no:    the question label as printed (e.g. "Q14", "3a", "Section B.2")
  - text:           the full question text. For reading comprehension include the
                    relevant passage as part of "text" so the question is self-contained.
  - options:        array of { "label": "A"|"B"|"C"|"D", "text": "...", "correct": false }
                    if multiple choice; empty array otherwise.
  - correct_answer: the correct option label or written answer when an answer key
                    is present in the document; null otherwise.

Skip cover pages, instructions, calibration markers, and answer keys themselves
(but USE answer keys to fill correct_answer / options.correct).

Return ONLY valid JSON. No markdown fences, no commentary.
Format: { "questions": [ ... ] }`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "application/pdf", data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 32000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini extraction failed: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Salvage the largest JSON object substring if the model added stray text
    const m = cleaned.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { questions: [] };
  }
  return parsed.questions || [];
}

// ═══════════════════════════════════════════════════════════════
// SOURCE METADATA from filename
// ═══════════════════════════════════════════════════════════════

function inferSourceMeta(filePath) {
  const rel   = path.relative(CORPUS_DIR, filePath);
  const parts = rel.split(path.sep);
  const publisher = parts[0] || "Unknown";
  const filename  = path.basename(filePath, path.extname(filePath));

  const yearMatch    = filename.match(/(\d{4})/);
  const ylMatch      = filename.match(/y(\d+)|year[\s_]?(\d+)/i);
  const subjectMatch = filename.match(/(numeracy|maths?|reading|writing|language)/i);

  let subject = null;
  if (subjectMatch) {
    const raw = subjectMatch[1].toLowerCase();
    subject = raw === "math" || raw === "maths" ? "Numeracy" :
              raw.charAt(0).toUpperCase() + raw.slice(1);
    if (subject === "Language") subject = "Language conventions";
  }

  return {
    publisher,
    title:      filename.replace(/_/g, " "),
    year:       yearMatch ? Number(yearMatch[1]) : null,
    year_level: ylMatch ? Number(ylMatch[1] || ylMatch[2]) : null,
    subject,
  };
}

// ═══════════════════════════════════════════════════════════════
// WALK / INGEST
// ═══════════════════════════════════════════════════════════════

function walkPdfs(dir, onlyPublisher) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
        if (!onlyPublisher || p.includes(`${path.sep}${onlyPublisher}${path.sep}`)) out.push(p);
      }
    }
  }
  walk(dir);
  return out;
}

async function ingestFile(filePath) {
  const meta = inferSourceMeta(filePath);
  console.log(`\n📄 ${path.relative(process.cwd(), filePath)}`);
  console.log(`   ${meta.publisher} · ${meta.subject || "?"} · Y${meta.year_level || "?"} · ${meta.year || "?"}`);

  let questions;
  try {
    questions = await extractQuestionsFromPdf(filePath, meta);
  } catch (err) {
    console.error(`   ❌ Extraction failed: ${err.message}`);
    return { ingested: 0, skipped: 0, failed: 1 };
  }

  console.log(`   📝 Extracted ${questions.length} questions`);

  let ingested = 0, skipped = 0;
  for (const q of questions) {
    if (!q.text || String(q.text).length < 5) continue;

    const fp = fingerprintQuestion({ text: q.text, options: q.options || [] });

    // Idempotent: skip if we've already ingested this exact item
    const existing = await CorpusItem.findOne({ exact_hash: fp.exact_hash }).lean();
    if (existing) { skipped++; continue; }

    let embedding = null;
    try {
      embedding = await embedText(q.text);
    } catch (err) {
      console.warn(`   ⚠️  Embedding failed for ${q.question_no || "?"}: ${err.message}`);
    }

    await CorpusItem.create({
      source: { ...meta, page: null, question_no: q.question_no || null },
      text: q.text,
      options: q.options || [],
      correct_answer: q.correct_answer || null,
      ...fp,
      embedding,
      embedding_model: process.env.EMBEDDING_MODEL || "text-embedding-004",
    });
    ingested++;

    if (ingested % 10 === 0) console.log(`   ... ${ingested} ingested`);
  }

  console.log(`   ✅ ${ingested} ingested, ${skipped} skipped (already in corpus)`);
  return { ingested, skipped, failed: 0 };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => a.replace(/^--/, "").split("="))
  );

  await connectDB();
  console.log("📚 Corpus ingestion starting…");
  console.log(`   Source dir: ${CORPUS_DIR}`);

  const files = args.file
    ? [path.resolve(args.file)]
    : walkPdfs(CORPUS_DIR, args.publisher);

  if (files.length === 0) {
    console.log(`⚠️  No PDFs found. Place files under ${CORPUS_DIR}/<Publisher>/`);
    process.exit(0);
  }
  console.log(`   ${files.length} PDF(s) to process`);

  const totals = { ingested: 0, skipped: 0, failed: 0 };
  for (const f of files) {
    const r = await ingestFile(f);
    totals.ingested += r.ingested;
    totals.skipped  += r.skipped;
    totals.failed   += r.failed;
  }

  console.log(`\n🎉 Done.`);
  console.log(`   Ingested: ${totals.ingested}`);
  console.log(`   Skipped:  ${totals.skipped}`);
  console.log(`   Failed:   ${totals.failed}`);
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });