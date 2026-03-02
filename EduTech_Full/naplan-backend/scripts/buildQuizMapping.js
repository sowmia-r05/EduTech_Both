/**
 * scripts/buildQuizMapping.js
 * 
 * Maps your frontend embed_ids to FlexiQuiz API quiz_ids
 * by comparing quiz names from both sources.
 * 
 * Usage: node scripts/buildQuizMapping.js
 */

require("dotenv").config();
const axios = require("axios");

const API_KEY = process.env.FLEXIQUIZ_API_KEY;
const FQ_BASE = "https://www.flexiquiz.com/api/v1";

// ── Your QUIZ_CATALOG from ChildDashboard.jsx (embed_ids) ──
const QUIZ_CATALOG = [
  { id: "y3_writing_1",         name: "Year 3 Writing",                              embed_id: "87c82fac-2a4e-486d-b566-8200514fa7fc" },
  { id: "y3_reading_set2",      name: "Year 3 Reading Set 2",                        embed_id: "2782fc4e-548e-4782-81dc-321c81101742" },
  { id: "y3_reading_1",         name: "Year 3 Reading",                              embed_id: "6db1c3ab-db7c-402d-b08d-45f5fc8a48b3" },
  { id: "y3_numeracy_set2",     name: "Year 3 Numeracy Set 2",                       embed_id: "7474b871-b2f4-44c3-ac4a-788aca433ae8" },
  { id: "y3_numeracy_1",        name: "Year 3 Numeracy",                             embed_id: "7a5a06c3-7bdb-47ba-bcf4-182d105710cf" },
  { id: "y3_number_algebra",    name: "Year 3 Number and Algebra",                   embed_id: "ca3c6d7f-5370-41a4-87f7-8e098d762461" },
  { id: "y3_grammar_set2",      name: "Year 3 Grammar & Punctuation Set 2",          embed_id: "6cb798a7-a5cb-44c2-a587-1c92b899b3d5" },
  { id: "y3_language_set2",     name: "Year 3 Language Full Set 2",                  embed_id: "f1a0e888-e486-4049-826c-ce39f631ec5d" },
  { id: "y3_grammar_hard_set2", name: "Year 3 Grammar & Punctuation (Hard) Set 2",  embed_id: "79b9e678-59b0-4db3-a59f-99398c036015" },
];

async function buildMapping() {
  // Fetch all quizzes from FlexiQuiz API
  const res = await axios.get(`${FQ_BASE}/quizzes`, {
    headers: { "X-API-KEY": API_KEY },
    timeout: 20000,
  });

  const fqQuizzes = Array.isArray(res.data) ? res.data : [];
  console.log(`\n📋 Found ${fqQuizzes.length} quizzes on FlexiQuiz:\n`);

  // Normalize names for matching
  function normalize(name) {
    return (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")  // remove spaces, punctuation
      .replace(/year3/g, "year3")
      .replace(/set2/g, "set2")
      .replace(/set1/g, "set1");
  }

  // Try to auto-match by name similarity
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("AUTO-MAPPING RESULTS (verify these!)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const mapping = [];

  for (const catalog of QUIZ_CATALOG) {
    const catalogNorm = normalize(catalog.name);
    
    // Find best match from FlexiQuiz
    let bestMatch = null;
    let bestScore = 0;

    for (const fq of fqQuizzes) {
      const fqNorm = normalize(fq.name);
      
      // Calculate simple similarity
      let score = 0;
      const catalogWords = catalog.name.toLowerCase().split(/\s+/);
      const fqWords = fq.name.toLowerCase().split(/\s+/);
      
      for (const word of catalogWords) {
        if (fqWords.some(fw => fw.includes(word) || word.includes(fw))) {
          score++;
        }
      }
      
      // Bonus for exact-ish match
      if (fqNorm.includes(catalogNorm) || catalogNorm.includes(fqNorm)) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = fq;
      }
    }

    const entry = {
      our_name: catalog.name,
      our_id: catalog.id,
      embed_id: catalog.embed_id,
      fq_quiz_id: bestMatch?.quiz_id || "??? NOT FOUND",
      fq_name: bestMatch?.name || "??? NO MATCH",
      confidence: bestScore >= 3 ? "✅ HIGH" : bestScore >= 2 ? "⚠️ MEDIUM" : "❌ LOW",
    };

    mapping.push(entry);
    console.log(`  ${entry.confidence}  ${catalog.name}`);
    console.log(`     embed_id:  ${catalog.embed_id}`);
    console.log(`     quiz_id:   ${entry.fq_quiz_id}`);
    console.log(`     FQ name:   ${entry.fq_name}`);
    console.log();
  }

  // Print the final mapping as code
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("COPY THIS → Updated QUIZ_CATALOG with both IDs:");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("const QUIZ_CATALOG = [");
  for (const m of mapping) {
    console.log(`  { id: "${m.our_id}", name: "${m.our_name}", embed_id: "${m.embed_id}", quiz_id: "${m.fq_quiz_id}" },`);
  }
  console.log("];");

  // Print FlexiQuiz quizzes that were NOT matched
  const matchedFqIds = new Set(mapping.map(m => m.fq_quiz_id));
  const unmatched = fqQuizzes.filter(q => !matchedFqIds.has(q.quiz_id));
  
  if (unmatched.length > 0) {
    console.log("\n\n═══════════════════════════════════════════════════════════════");
    console.log("UNMATCHED FlexiQuiz quizzes (not in your catalog):");
    console.log("═══════════════════════════════════════════════════════════════\n");
    for (const q of unmatched) {
      console.log(`  ${q.quiz_id}  →  ${q.name}`);
    }
  }
}

buildMapping().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});