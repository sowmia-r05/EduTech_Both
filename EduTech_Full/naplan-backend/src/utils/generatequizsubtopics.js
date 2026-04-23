/**
 * generateQuizSubTopics.js
 *
 * GUARANTEES: Every question gets a valid sub-topic label. NEVER "Other".
 *
 * Multi-pass strategy:
 *   Pass 1 — AI classifies into 10 standard NAPLAN labels
 *   Pass 2 — AI retries any that failed (closest of 10)
 *   Pass 3 — AI invents a NEW label if genuinely nothing fits
 *   Pass 4 — Keyword fallback (deterministic, no AI) — last resort only
 *
 * Self-contained — no separate taxonomy file.
 */

const connectDB = require("../config/db");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const { createLLMClientWithFallback, generateJSON } = require("./llmClient");

// ═══════════════════════════════════════════════════════════════
// TAXONOMY
// ═══════════════════════════════════════════════════════════════

const LANGUAGE_TAXONOMIES = {
  spelling: [
    "Silent Letters", "Double Consonants", "Homophones", "Suffix Rules",
    "Prefix Rules", "Common Misspellings", "Vowel Patterns", "Plural Forms",
    "Compound Words", "Word Endings",
  ],
  grammar: [
    "Subject-Verb Agreement", "Tense Consistency", "Pronouns & Reference",
    "Apostrophes", "Commas & Clauses", "Capital Letters",
    "Quotation Marks & Dialogue", "Sentence Structure",
    "Conjunctions & Connectives", "Articles & Determiners",
  ],
  punctuation: [
    "Apostrophes", "Commas & Clauses", "Capital Letters",
    "Quotation Marks & Dialogue", "Full Stops & Sentence Endings",
    "Colons & Semicolons", "Question & Exclamation Marks",
    "Hyphens & Dashes", "Parentheses & Brackets", "Punctuation in Lists",
  ],
};

const NUMERACY_STRANDS = {
  "Number & Algebra": [
    "Place Value", "Addition & Subtraction", "Multiplication & Division",
    "Fractions", "Decimals", "Percentages", "Integers & Negative Numbers",
    "Ratios & Proportions", "Patterns & Sequences",
    "Algebraic Expressions & Equations",
  ],
  "Measurement & Geometry": [
    "Length & Perimeter", "Area & Surface Area", "Volume & Capacity",
    "Mass & Weight", "Time & Duration", "Temperature",
    "2D Shapes & Angles", "3D Shapes & Nets",
    "Location & Transformation", "Coordinate Geometry",
  ],
  "Statistics & Probability": [
    "Data Collection & Surveys", "Tables & Frequency",
    "Graphs (Bar, Line, Pie)", "Mean, Median, Mode", "Range & Spread",
    "Probability of Events", "Chance & Likelihood",
    "Experimental Probability", "Theoretical Probability",
    "Interpreting Statistics",
  ],
};

const NUMERACY_ALL_LABELS = Object.values(NUMERACY_STRANDS).flat();
const NUMERACY_LABEL_TO_STRAND = {};
for (const [strand, labels] of Object.entries(NUMERACY_STRANDS)) {
  for (const label of labels) {
    NUMERACY_LABEL_TO_STRAND[label.toLowerCase()] = strand;
  }
}

// ═══════════════════════════════════════════════════════════════
// KEYWORD FALLBACKS (last resort — no AI)
// ═══════════════════════════════════════════════════════════════

const SPELLING_KEYWORDS = {
  "Silent Letters": ["silent", "knife", "knight", "knee", "gnome", "wrist", "wrap", "hour", "honest", "lamb"],
  "Double Consonants": ["double", "occur", "occurred", "running", "swimming", "letter", "happen"],
  "Homophones": ["their", "there", "they're", "to", "too", "two", "your", "you're", "hear", "here", "homophone"],
  "Suffix Rules": ["suffix", "-ed", "-ing", "-tion", "-sion", "-ly", "ending"],
  "Prefix Rules": ["prefix", "un-", "dis-", "re-", "pre-", "unhappy", "redo"],
  "Common Misspellings": ["misspell", "accommodate", "recommend", "environment", "believe", "receive", "separate", "necessary", "spell", "correct spelling"],
  "Vowel Patterns": ["vowel", "ai", "ea", "ie", "oa", "boat", "rain"],
  "Plural Forms": ["plural", "-s", "-es", "-ies", "children", "mice"],
  "Compound Words": ["compound", "sunlight", "football", "bedroom", "rainbow"],
  "Word Endings": ["ending", "-le", "-y", "-ly", "quickly", "table"],
};

const GRAMMAR_KEYWORDS = {
  "Subject-Verb Agreement": ["is", "are", "was", "were", "has", "have", "agree", "verb"],
  "Tense Consistency": ["tense", "past", "present", "future", "yesterday"],
  "Pronouns & Reference": ["he", "she", "they", "him", "her", "pronoun"],
  "Apostrophes": ["apostrophe", "'s", "n't", "contraction", "possessive"],
  "Commas & Clauses": ["comma", "clause", "and but"],
  "Capital Letters": ["capital", "uppercase", "proper noun"],
  "Quotation Marks & Dialogue": ["quotation", "quote", "dialogue", "said"],
  "Sentence Structure": ["sentence", "fragment", "complete"],
  "Conjunctions & Connectives": ["because", "however", "although", "conjunction"],
  "Articles & Determiners": ["the", "article", "determiner"],
};

const PUNCTUATION_KEYWORDS = {
  "Apostrophes": ["apostrophe", "'s", "n't", "don't", "it's"],
  "Commas & Clauses": ["comma", "list"],
  "Capital Letters": ["capital", "uppercase"],
  "Quotation Marks & Dialogue": ["quotation", "speech", "dialogue"],
  "Full Stops & Sentence Endings": ["full stop", "period"],
  "Colons & Semicolons": ["colon", "semicolon"],
  "Question & Exclamation Marks": ["question mark", "exclamation"],
  "Hyphens & Dashes": ["hyphen", "dash"],
  "Parentheses & Brackets": ["parenthes", "bracket"],
  "Punctuation in Lists": ["list", "bullet"],
};

const NUMERACY_KEYWORDS = {
  "Place Value": ["place value", "tens", "hundreds", "thousands", "digit"],
  "Addition & Subtraction": ["add", "plus", "subtract", "minus", "sum", "total"],
  "Multiplication & Division": ["multiply", "times", "divide", "product"],
  "Fractions": ["fraction", "1/2", "1/3", "half", "quarter", "numerator"],
  "Decimals": ["decimal", "0.", "point"],
  "Percentages": ["percent", "%", "percentage"],
  "Integers & Negative Numbers": ["negative", "integer", "below zero"],
  "Ratios & Proportions": ["ratio", "proportion"],
  "Patterns & Sequences": ["pattern", "sequence"],
  "Algebraic Expressions & Equations": ["equation", "solve for", "variable"],
  "Length & Perimeter": ["length", "perimeter", "centimetre", "metre", "cm", "mm"],
  "Area & Surface Area": ["area", "surface"],
  "Volume & Capacity": ["volume", "capacity", "litre"],
  "Mass & Weight": ["mass", "weight", "kilogram", "gram"],
  "Time & Duration": ["time", "clock", "hour", "minute", "duration"],
  "Temperature": ["temperature", "degree", "celsius"],
  "2D Shapes & Angles": ["angle", "triangle", "square", "rectangle", "circle", "2d"],
  "3D Shapes & Nets": ["cube", "prism", "pyramid", "sphere", "3d"],
  "Location & Transformation": ["rotate", "reflect", "symmetry"],
  "Coordinate Geometry": ["coordinate", "grid", "x-axis"],
  "Data Collection & Surveys": ["survey", "collect"],
  "Tables & Frequency": ["table", "frequency"],
  "Graphs (Bar, Line, Pie)": ["graph", "bar chart", "line graph", "pie chart"],
  "Mean, Median, Mode": ["mean", "median", "mode", "average"],
  "Range & Spread": ["range", "spread"],
  "Probability of Events": ["probability", "chance"],
  "Chance & Likelihood": ["likely", "unlikely", "certain"],
  "Experimental Probability": ["experiment", "trial"],
  "Theoretical Probability": ["theoretical", "expected"],
  "Interpreting Statistics": ["interpret", "conclude"],
};

function keywordClassify(question, keywordMap) {
  const text = (question.question_text || question.text || "").toLowerCase();
  const opts = (question.options || []).map((o) => o.text || "").join(" ").toLowerCase();
  const haystack = `${text} ${opts}`;

  let bestLabel = null;
  let bestScore = 0;

  for (const [label, keywords] of Object.entries(keywordMap)) {
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  return bestLabel;
}

// ═══════════════════════════════════════════════════════════════
// TAXONOMY ROUTER
// ═══════════════════════════════════════════════════════════════

function normalise(s) {
  return String(s || "").toLowerCase().trim();
}

function resolveTaxonomy(quiz) {
  const subTopic = normalise(quiz?.sub_topic);
  const subject = normalise(quiz?.subject);
  const quizName = normalise(quiz?.quiz_name);
  const haystack = `${quizName} ${subTopic} ${subject}`;

  if (haystack.includes("reading")) {
    return { mode: "skip", reason: "Reading — no taxonomy defined" };
  }
  if (haystack.includes("writing")) {
    return { mode: "skip", reason: "Writing — uses its own criteria" };
  }

  if (
    haystack.includes("numeracy") || haystack.includes("maths") ||
    haystack.includes("math ") || haystack.startsWith("math") ||
    haystack.includes("number and algebra") ||
    haystack.includes("measurement and geometry") ||
    haystack.includes("statistics and probability")
  ) {
    return {
      mode: "numeracy",
      strands: NUMERACY_STRANDS,
      allLabels: NUMERACY_ALL_LABELS,
      labelToStrand: NUMERACY_LABEL_TO_STRAND,
      keywords: NUMERACY_KEYWORDS,
    };
  }

  if (haystack.includes("spelling") || haystack.includes("spell ")) {
    return { mode: "language", key: "spelling", labels: LANGUAGE_TAXONOMIES.spelling, keywords: SPELLING_KEYWORDS };
  }
  if (haystack.includes("grammar") && haystack.includes("punctuation")) {
    return { mode: "language", key: "grammar", labels: LANGUAGE_TAXONOMIES.grammar, keywords: GRAMMAR_KEYWORDS };
  }
  if (haystack.includes("punctuation")) {
    return { mode: "language", key: "punctuation", labels: LANGUAGE_TAXONOMIES.punctuation, keywords: PUNCTUATION_KEYWORDS };
  }
  if (haystack.includes("grammar") || haystack.includes("language conventions") || haystack.includes("convention")) {
    return { mode: "language", key: "grammar", labels: LANGUAGE_TAXONOMIES.grammar, keywords: GRAMMAR_KEYWORDS };
  }

  return { mode: "unknown" };
}

// ═══════════════════════════════════════════════════════════════
// LABEL CANONICALISATION
// ═══════════════════════════════════════════════════════════════

function canonicaliseLabel(rawLabel, allowedLabels) {
  if (!rawLabel) return null;
  const cleaned = String(rawLabel).trim();
  if (!cleaned) return null;

  const norm = (s) =>
    String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const target = norm(cleaned);

  let match = allowedLabels.find((label) => norm(label) === target);
  if (match) return match;

  match = allowedLabels.find((label) => target.includes(norm(label)) || norm(label).includes(target));
  if (match) return match;

  const targetFirstTwo = target.split(" ").slice(0, 2).join(" ");
  if (targetFirstTwo.length >= 3) {
    match = allowedLabels.find((label) => {
      const labelFirstTwo = norm(label).split(" ").slice(0, 2).join(" ");
      return labelFirstTwo === targetFirstTwo;
    });
    if (match) return match;
  }
  return null;
}

function canonicaliseStrand(rawStrand, strandsObj) {
  if (!rawStrand) return null;
  const cleaned = String(rawStrand).trim();
  if (!cleaned) return null;
  const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
  const target = norm(cleaned);
  const strandNames = Object.keys(strandsObj);

  let match = strandNames.find((s) => norm(s) === target);
  if (match) return match;
  match = strandNames.find((s) => target.includes(norm(s)) || norm(s).includes(target));
  return match || null;
}

/**
 * Validate an AI-invented label: not empty, reasonable length, Title Case-ish,
 * and NOT "Other" / "Unknown" / similar garbage.
 */
function validateInventedLabel(rawLabel) {
  if (!rawLabel) return null;
  const cleaned = String(rawLabel).trim();
  if (!cleaned || cleaned.length < 3 || cleaned.length > 60) return null;

  const lower = cleaned.toLowerCase();
  const garbageLabels = ["other", "unknown", "n/a", "none", "general", "miscellaneous", "various"];
  if (garbageLabels.includes(lower)) return null;

  // Title-case: capitalize first letter of each word
  return cleaned
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ═══════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════

function buildLanguagePrompt(questions, taxonomy, yearLevel) {
  const { labels, key } = taxonomy;
  const numberedList = labels.map((l, i) => `  ${i + 1}. ${l}`).join("\n");
  const questionsBlock = questions.map((q, i) => {
    const opts = (q.options || []).map((o) => o.text).filter(Boolean).join(" | ");
    return `
Question ${i + 1}:
  question_id: ${q.question_id}
  Text: ${q.question_text}
  Correct answer: ${q.correct_answer || "(see options)"}
  Options: ${opts || "(none)"}`;
  }).join("\n");

  return `You are a NAPLAN curriculum expert classifying ${key} questions for Year ${yearLevel}.

Classify each question into EXACTLY ONE of these 10 categories:
${numberedList}

EXAMPLES:
${exampleClassifications(key)}

RULES:
- Use the category name EXACTLY as written above
- Pick the closest-fitting category for every question
- Do NOT return "Other" or "Unknown" — always pick one of the 10

QUESTIONS:
${questionsBlock}

Respond with ONLY valid JSON:
{
  "assignments": [
    {"question_id": "...", "sub_topic": "Silent Letters"}
  ]
}`;
}

function buildLanguageInventPrompt(questions, taxonomy, yearLevel) {
  const { labels, key } = taxonomy;
  const existingList = labels.map((l) => `- ${l}`).join("\n");
  const questionsBlock = questions.map((q, i) => {
    const opts = (q.options || []).map((o) => o.text).filter(Boolean).join(" | ");
    return `
Question ${i + 1}:
  question_id: ${q.question_id}
  Text: ${q.question_text}
  Options: ${opts || "(none)"}`;
  }).join("\n");

  return `You are a NAPLAN curriculum expert.

The questions below did NOT fit these standard ${key} categories:
${existingList}

INVENT a NEW short sub-topic name (2-5 words, Title Case) that accurately
describes each of these questions. Style should match existing NAPLAN labels.

RULES:
- 2 to 5 words maximum
- Title Case (capitalize each word)
- Must describe a real curriculum skill
- Do NOT use "Other", "Unknown", "General", "Miscellaneous"
- Be specific but reusable across similar questions

QUESTIONS:
${questionsBlock}

Respond with ONLY valid JSON:
{
  "assignments": [
    {"question_id": "...", "sub_topic": "Your Invented Label"}
  ]
}`;
}

function exampleClassifications(key) {
  const examples = {
    spelling: `- "knife", "gnome", "wrist" → "Silent Letters"
- "their/there/they're" → "Homophones"
- "occur/occurred" → "Double Consonants"
- "accommodate", "environment" → "Common Misspellings"
- "sunlight", "football" → "Compound Words"
- "running", "jumped" → "Suffix Rules"
- "unhappy", "redo" → "Prefix Rules"
- "cat/cats" → "Plural Forms"
- "boat", "rain" → "Vowel Patterns"
- "happy", "table" → "Word Endings"
- Fill-in-letter ("enviro_ _ent") → "Common Misspellings"
- Listen-and-spell (audio) → "Common Misspellings"`,
    grammar: `- "He run fast" → "Subject-Verb Agreement"
- Past/present mixing → "Tense Consistency"
- Pronoun confusion → "Pronouns & Reference"
- "dog's" vs "dogs" → "Apostrophes"
- Missing commas → "Commas & Clauses"
- "monday" → "Capital Letters"
- Speech quotes → "Quotation Marks & Dialogue"
- Fragments → "Sentence Structure"
- "and/but/because" → "Conjunctions & Connectives"
- "a/an/the" → "Articles & Determiners"`,
    punctuation: `- "its" vs "it's" → "Apostrophes"
- Missing commas → "Commas & Clauses"
- "i" → "I" → "Capital Letters"
- Dialogue → "Quotation Marks & Dialogue"
- Missing period → "Full Stops & Sentence Endings"
- Colons → "Colons & Semicolons"
- ? and ! → "Question & Exclamation Marks"
- "self-aware" → "Hyphens & Dashes"
- (parens) → "Parentheses & Brackets"
- Item listing → "Punctuation in Lists"`,
  };
  return examples[key] || "";
}

function buildNumeracyPrompt(questions, taxonomy, yearLevel) {
  const { strands } = taxonomy;
  const strandList = Object.entries(strands).map(([strand, labels]) => {
    const subs = labels.map((l, i) => `     ${i + 1}. ${l}`).join("\n");
    return `STRAND "${strand}":\n${subs}`;
  }).join("\n\n");

  const questionsBlock = questions.map((q, i) => {
    const opts = (q.options || []).map((o) => o.text).filter(Boolean).join(" | ");
    return `
Question ${i + 1}:
  question_id: ${q.question_id}
  Text: ${q.question_text}
  Correct answer: ${q.correct_answer || "(see options)"}
  Options: ${opts || "(none)"}`;
  }).join("\n");

  return `You are a NAPLAN Numeracy expert classifying Year ${yearLevel} questions.
For each question, pick EXACTLY ONE strand AND ONE sub-topic within that strand.

${strandList}

RULES:
- Use names EXACTLY as shown
- Sub-topic MUST belong to the chosen strand
- Do NOT return "Other" — always pick valid labels

QUESTIONS:
${questionsBlock}

Respond with ONLY valid JSON:
{
  "assignments": [
    {"question_id": "...", "strand": "Number & Algebra", "sub_topic": "Fractions"}
  ]
}`;
}

function buildNumeracyInventPrompt(questions, taxonomy, yearLevel) {
  const { strands } = taxonomy;
  const strandList = Object.entries(strands).map(([strand, labels]) => {
    const subs = labels.map((l) => `     - ${l}`).join("\n");
    return `STRAND "${strand}":\n${subs}`;
  }).join("\n\n");

  const questionsBlock = questions.map((q, i) => `
Question ${i + 1}:
  question_id: ${q.question_id}
  Text: ${q.question_text}`).join("\n");

  return `You are a NAPLAN Numeracy expert.

These questions don't fit any existing sub-topic. Pick the best-fitting STRAND,
then INVENT a NEW short sub-topic name (2-5 words, Title Case) for each question.

EXISTING STRANDS (must use one of these):
${strandList}

RULES for invented sub-topic names:
- 2-5 words, Title Case
- Must describe a specific Numeracy skill
- Must logically belong to the chosen strand
- Do NOT use "Other", "Unknown", "General"

QUESTIONS:
${questionsBlock}

Respond with ONLY valid JSON:
{
  "assignments": [
    {"question_id": "...", "strand": "Number & Algebra", "sub_topic": "Your Invented Label"}
  ]
}`;
}

// ═══════════════════════════════════════════════════════════════
// MULTI-PASS CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

async function runAiPass(client, prompt) {
  const parsed = await generateJSON(client, {
    prompt,
    temperature: 0.2,
    maxTokens: 4000,
  });
  return Array.isArray(parsed.assignments) ? parsed.assignments : [];
}

async function processLanguageBatch(client, batch, taxonomy, yearLevel) {
  const originalBatch = batch;
  const results = new Map(); // question_id → { sub_topic, invented? }

  // ─── Pass 1: strict classification into 10 labels ───
  try {
    const pass1Prompt = buildLanguagePrompt(batch, taxonomy, yearLevel);
    const pass1 = await runAiPass(client, pass1Prompt);
    console.log(`   📝 Pass 1: AI returned ${pass1.length} for ${batch.length} questions`);
    if (pass1.length > 0) console.log(`   📝 Sample:`, JSON.stringify(pass1.slice(0, 2)));

    for (const a of pass1) {
      if (!a || typeof a.question_id !== "string") continue;
      const canonical = canonicaliseLabel(a.sub_topic, taxonomy.labels);
      if (canonical) results.set(a.question_id, { sub_topic: canonical, invented: false });
    }
  } catch (err) {
    console.error(`   ⚠️  Pass 1 failed:`, err.message);
  }

  // ─── Pass 2: retry into 10 labels ───
  let missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   🔄 Pass 2: retrying ${missing.length} unclassified`);
    try {
      const pass2Prompt = buildLanguagePrompt(missing, taxonomy, yearLevel);
      const pass2 = await runAiPass(client, pass2Prompt);
      for (const a of pass2) {
        if (!a || typeof a.question_id !== "string") continue;
        const canonical = canonicaliseLabel(a.sub_topic, taxonomy.labels);
        if (canonical) results.set(a.question_id, { sub_topic: canonical, invented: false });
      }
      console.log(`   📝 Pass 2 recovered ${results.size - (batch.length - missing.length)}`);
    } catch (err) {
      console.error(`   ⚠️  Pass 2 failed:`, err.message);
    }
  }

  // ─── Pass 3: INVENT new labels ───
  missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   💡 Pass 3: letting AI invent labels for ${missing.length} questions`);
    try {
      const pass3Prompt = buildLanguageInventPrompt(missing, taxonomy, yearLevel);
      const pass3 = await runAiPass(client, pass3Prompt);
      console.log(`   💡 Pass 3 sample:`, JSON.stringify(pass3.slice(0, 2)));
      for (const a of pass3) {
        if (!a || typeof a.question_id !== "string") continue;
        const invented = validateInventedLabel(a.sub_topic);
        if (invented) {
          results.set(a.question_id, { sub_topic: invented, invented: true });
        }
      }
    } catch (err) {
      console.error(`   ⚠️  Pass 3 failed:`, err.message);
    }
  }

  // ─── Pass 4: keyword fallback (last resort) ───
  missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   🔤 Pass 4: keyword fallback for ${missing.length} questions`);
    for (const q of missing) {
      const keyword = keywordClassify(q, taxonomy.keywords);
      const finalLabel = keyword || taxonomy.labels[0]; // guaranteed non-null
      results.set(q.question_id, { sub_topic: finalLabel, invented: false });
      console.log(`   🔤 "${(q.question_text || "").slice(0, 40)}..." → ${finalLabel}`);
    }
  }

  // Build updates
  const updates = [];
  let inventedCount = 0;
  for (const [question_id, { sub_topic, invented }] of results.entries()) {
    if (invented) inventedCount++;
    updates.push({
      question_id,
      update: {
        sub_topic,
        "categories.0.name": sub_topic,
        ...(invented ? { sub_topic_invented: true } : {}),
      },
    });
  }
  if (inventedCount > 0) console.log(`   💡 ${inventedCount} labels were AI-invented`);
  return updates;
}

async function processNumeracyBatch(client, batch, taxonomy, yearLevel) {
  const originalBatch = batch;
  const results = new Map();

  // ─── Pass 1 ───
  try {
    const pass1 = await runAiPass(client, buildNumeracyPrompt(batch, taxonomy, yearLevel));
    console.log(`   📝 Pass 1: AI returned ${pass1.length} for ${batch.length} questions`);
    if (pass1.length > 0) console.log(`   📝 Sample:`, JSON.stringify(pass1.slice(0, 2)));

    for (const a of pass1) {
      if (!a || typeof a.question_id !== "string") continue;
      const subTopic = canonicaliseLabel(a.sub_topic, taxonomy.allLabels);
      const strandC = canonicaliseStrand(a.strand, taxonomy.strands);
      let finalStrand = strandC;
      if (subTopic) {
        const inferred = taxonomy.labelToStrand[subTopic.toLowerCase()];
        if (inferred) finalStrand = inferred;
      }
      if (subTopic && finalStrand) {
        results.set(a.question_id, { strand: finalStrand, sub_topic: subTopic, invented: false });
      }
    }
  } catch (err) {
    console.error(`   ⚠️  Pass 1 failed:`, err.message);
  }

  // ─── Pass 2 ───
  let missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   🔄 Pass 2: retrying ${missing.length}`);
    try {
      const pass2 = await runAiPass(client, buildNumeracyPrompt(missing, taxonomy, yearLevel));
      for (const a of pass2) {
        if (!a || typeof a.question_id !== "string") continue;
        const subTopic = canonicaliseLabel(a.sub_topic, taxonomy.allLabels);
        const strandC = canonicaliseStrand(a.strand, taxonomy.strands);
        let finalStrand = strandC;
        if (subTopic) {
          const inferred = taxonomy.labelToStrand[subTopic.toLowerCase()];
          if (inferred) finalStrand = inferred;
        }
        if (subTopic && finalStrand) {
          results.set(a.question_id, { strand: finalStrand, sub_topic: subTopic, invented: false });
        }
      }
    } catch (err) {
      console.error(`   ⚠️  Pass 2 failed:`, err.message);
    }
  }

  // ─── Pass 3: invent ───
  missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   💡 Pass 3: inventing labels for ${missing.length}`);
    try {
      const pass3 = await runAiPass(client, buildNumeracyInventPrompt(missing, taxonomy, yearLevel));
      console.log(`   💡 Pass 3 sample:`, JSON.stringify(pass3.slice(0, 2)));
      for (const a of pass3) {
        if (!a || typeof a.question_id !== "string") continue;
        const strandC = canonicaliseStrand(a.strand, taxonomy.strands);
        const invented = validateInventedLabel(a.sub_topic);
        if (invented && strandC) {
          results.set(a.question_id, { strand: strandC, sub_topic: invented, invented: true });
        }
      }
    } catch (err) {
      console.error(`   ⚠️  Pass 3 failed:`, err.message);
    }
  }

  // ─── Pass 4: keyword fallback ───
  missing = originalBatch.filter((q) => !results.has(q.question_id));
  if (missing.length > 0) {
    console.log(`   🔤 Pass 4: keyword fallback for ${missing.length}`);
    for (const q of missing) {
      const keyword = keywordClassify(q, taxonomy.keywords);
      const finalSubTopic = keyword || taxonomy.allLabels[0];
      const finalStrand = taxonomy.labelToStrand[finalSubTopic.toLowerCase()] || Object.keys(taxonomy.strands)[0];
      results.set(q.question_id, { strand: finalStrand, sub_topic: finalSubTopic, invented: false });
      console.log(`   🔤 "${(q.question_text || "").slice(0, 40)}..." → ${finalStrand}/${finalSubTopic}`);
    }
  }

  const updates = [];
  let inventedCount = 0;
  for (const [question_id, { strand, sub_topic, invented }] of results.entries()) {
    if (invented) inventedCount++;
    updates.push({
      question_id,
      update: {
        sub_topic, strand, "categories.0.name": sub_topic,
        ...(invented ? { sub_topic_invented: true } : {}),
      },
    });
  }
  if (inventedCount > 0) console.log(`   💡 ${inventedCount} labels were AI-invented`);
  return updates;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const subtopic_progress = {};

async function generateQuizSubTopics(quizId, options = {}, progressMap = subtopic_progress) {
  await connectDB();

  const quiz = await Quiz.findOne({ quiz_id: quizId }).lean();
  if (!quiz) {
    progressMap[quizId] = { status: "error", error: "Quiz not found" };
    return;
  }

  console.log(
    `📋 Quiz meta — name: "${quiz.quiz_name}", subject: "${quiz.subject}", sub_topic: "${quiz.sub_topic || ""}", year: ${quiz.year_level}`
  );

  const taxonomy = resolveTaxonomy(quiz);
  console.log(`🎯 Resolved taxonomy mode: ${taxonomy.mode}${taxonomy.key ? `, key: ${taxonomy.key}` : ""}`);

  if (taxonomy.mode === "skip") {
    progressMap[quizId] = {
      status: "done", done: 0, failed: 0, total: 0,
      scope: options.questionIds ? "selected" : "all",
      skipped: true, reason: taxonomy.reason,
    };
    console.log(`⏭️  Skipping: ${taxonomy.reason}`);
    return;
  }

  if (taxonomy.mode === "unknown") {
    progressMap[quizId] = {
      status: "error",
      error: `No taxonomy for subject "${quiz.subject}" / topic "${quiz.sub_topic}". Supported: Spelling, Grammar, Punctuation, Numeracy.`,
    };
    console.log(`❓ Unknown taxonomy`);
    return;
  }

  const baseFilter = { quiz_ids: quizId };
  const filter =
    Array.isArray(options.questionIds) && options.questionIds.length > 0
      ? { ...baseFilter, question_id: { $in: options.questionIds } }
      : baseFilter;

  const questions = await Question.find(filter).lean();
  const scope = options.questionIds ? "selected" : "all";

  if (!questions.length) {
    progressMap[quizId] = { status: "done", done: 0, failed: 0, total: 0, scope };
    return;
  }

  const yearLevel = quiz.year_level || 3;

  progressMap[quizId] = {
    status: "running", done: 0, failed: 0,
    total: questions.length, scope,
    mode: taxonomy.mode, taxonomy: taxonomy.key || taxonomy.mode,
  };

  const client = createLLMClientWithFallback();
  console.log(
    `🤖 Classifying ${questions.length} questions using ${client.provider} ` +
    `(mode: ${taxonomy.mode}${taxonomy.key ? `/${taxonomy.key}` : ""}, scope: ${scope})`
  );

  const BATCH_SIZE = 15;
  let done = 0;
  let failed = 0;

  try {
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      const payload = batch.map((q) => ({
        question_id: q.question_id,
        question_text: q.text || q.question_text || "",
        correct_answer: q.correct_answer || "",
        options: q.options || [],
      }));

      try {
        const valid = taxonomy.mode === "numeracy"
          ? await processNumeracyBatch(client, payload, taxonomy, yearLevel)
          : await processLanguageBatch(client, payload, taxonomy, yearLevel);

        await Promise.all(
          valid.map(async ({ question_id, update }) => {
            await Question.updateOne({ question_id }, { $set: update });
            done++;
          })
        );

        failed += batch.length - valid.length;
        progressMap[quizId] = {
          status: "running", done, failed,
          total: questions.length, scope,
          mode: taxonomy.mode, taxonomy: taxonomy.key || taxonomy.mode,
        };
        console.log(`✅ Batch ${batchNum}: saved ${valid.length}/${batch.length}`);
      } catch (err) {
        console.error(`❌ Batch ${batchNum} failed:`, err.message);
        failed += batch.length;
        progressMap[quizId] = {
          status: "running", done, failed,
          total: questions.length, scope,
          mode: taxonomy.mode, taxonomy: taxonomy.key || taxonomy.mode,
        };
      }
    }

    progressMap[quizId] = {
      status: "done", done, failed,
      total: questions.length, scope,
      mode: taxonomy.mode, taxonomy: taxonomy.key || taxonomy.mode,
      provider: client.provider,
    };
    console.log(`🏁 Done: ${done}/${questions.length} classified successfully`);
  } catch (err) {
    console.error(`❌ Fatal error:`, err);
    progressMap[quizId] = { status: "error", error: err.message };
  }
}

module.exports = { generateQuizSubTopics, subtopic_progress };