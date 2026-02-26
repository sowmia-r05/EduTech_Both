/**
 * scripts/syncFlexiQuizzes.js
 *
 * Fetches ALL quizzes from FlexiQuiz API (GET /v1/quizzes),
 * parses quiz names to extract year_level + subject,
 * and upserts them into a `flexiquiz_quizzes` collection.
 *
 * Then rebuilds the quiz_catalog bundles with real quiz IDs.
 *
 * Run:  node scripts/syncFlexiQuizzes.js
 * Cron: Run daily or after adding new quizzes in FlexiQuiz dashboard
 *
 * ENV required: MONGODB_URI, FLEXIQUIZ_API_KEY
 */

require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");

const FQ_BASE = "https://www.flexiquiz.com/api/v1";
const API_KEY = process.env.FLEXIQUIZ_API_KEY;

// ─── Models (inline for standalone script) ───

const FlexiQuizSchema = new mongoose.Schema(
  {
    quiz_id: { type: String, required: true, unique: true, index: true },
    quiz_name: { type: String, required: true },
    short_code: { type: String, default: null },
    status: { type: String, default: "active" },
    date_created: { type: Date, default: null },

    // Parsed from quiz_name
    year_level: { type: Number, default: null },    // 3, 5, 7, 9
    subject: { type: String, default: null },        // Reading, Writing, Maths, Conventions
    difficulty: { type: String, default: null },     // easy, medium, hard, or null (full-length)
    set_number: { type: Number, default: 1 },        // 1, 2, 3...
    is_full_length: { type: Boolean, default: false }, // true if it's a complete NAPLAN-style test
    is_trial: { type: Boolean, default: false }, // true if it's a trial/sample exam

    // Bundle tier assignment (computed)
    tier: { type: String, enum: ["A", "B", "C", null], default: null },
    tier_order: { type: Number, default: 0 }, // ordering within tier
  },
  { timestamps: true, versionKey: false }
);

const FlexiQuiz =
  mongoose.models.FlexiQuiz || mongoose.model("FlexiQuiz", FlexiQuizSchema, "flexiquiz_quizzes");

// ─── Quiz Name Parser ───

/**
 * Parse a quiz name like "Year 3 Reading Set 2" or "Year3 Medium Grammar & Punctuation set2"
 * into structured fields: year_level, subject, difficulty, set_number, is_full_length
 */
function parseQuizName(name) {
  const n = String(name || "").trim();
  const lower = n.toLowerCase();

  // ── Extract year level ──
  let year_level = null;
  // Match "Year 3", "Year3", "year_3"
  const yearMatch = lower.match(/year[_\s]*(\d+)/);
  if (yearMatch) {
    year_level = parseInt(yearMatch[1], 10);
  } else {
    // Match "Grade_3", "Grade 3", "grade3"
    const gradeMatch = lower.match(/grade[_\s]*(\d+)/);
    if (gradeMatch) year_level = parseInt(gradeMatch[1], 10);
  }

  // ── Extract difficulty ──
  let difficulty = null;
  if (/\beasy\b/i.test(n)) difficulty = "easy";
  else if (/\bmedium\b/i.test(n)) difficulty = "medium";
  else if (/\bhard\b/i.test(n)) difficulty = "hard";

  // ── Extract set number ──
  let set_number = 1;
  const setMatch = lower.match(/set\s*(\d+)/);
  if (setMatch) set_number = parseInt(setMatch[1], 10);

  // ── Detect if this is a trial/sample exam ──
  const is_trial = /\b(trail|trial|sample|demo|free)\b/i.test(n);

  // ── Extract subject ──
  let subject = null;

  // Order matters: check most specific first
  if (/writing/i.test(n)) {
    subject = "Writing";
  } else if (/reading/i.test(n)) {
    subject = "Reading";
  } else if (
    /numeracy|maths?\b|number\s*(and|&)\s*algebra|statistics|probability|measurement|geometry|data/i.test(n)
  ) {
    subject = "Maths";
  } else if (
    /grammar|punctuation|spelling|conventions?|language/i.test(n)
  ) {
    subject = "Conventions";
  }

  // ── Fallback: if name has "exam" or "test" but no subject, try to infer ──
  // "Year 3 Trail Exam" → treat as a general practice (all subjects)
  // For now, mark as null so it gets flagged, unless it's clearly a trial
  if (!subject && is_trial) {
    // Trial exams are typically general practice — we can assign them manually
    // or skip them from bundles. For now, leave subject null but note it.
  }

  // ── Is it a full-length NAPLAN-style test? ──
  // Full-length = named simply like "Year 3 Reading" or "Year 3 Numeracy Set 2"
  // Topic-specific = has difficulty level OR specific topic like "Number and Algebra",
  //                  "Statistics and Probability", "Measurement", etc.
  const hasTopicKeyword =
    /number\s*(and|&)\s*algebra|statistics|probability|measurement|geometry|data/i.test(n);
  const is_full_length = !difficulty && !hasTopicKeyword && !is_trial;

  return { year_level, subject, difficulty, set_number, is_full_length, is_trial };
}

// ─── FlexiQuiz API ───

async function fetchAllQuizzes() {
  if (!API_KEY) throw new Error("FLEXIQUIZ_API_KEY not set in .env");

  console.log("📡 Fetching quizzes from FlexiQuiz API...");
  const res = await axios.get(`${FQ_BASE}/quizzes`, {
    headers: { "X-API-KEY": API_KEY },
    timeout: 30000,
  });

  const quizzes = Array.isArray(res.data) ? res.data : [];
  console.log(`   Found ${quizzes.length} quizzes on FlexiQuiz`);
  return quizzes;
}

// ─── Tier Assignment ───

/**
 * Assign tiers (A, B, C) to quizzes within each year level.
 *
 * Strategy:
 *   Tier A (Starter): Full-length tests, Set 1 — the core tests
 *   Tier B (Standard): Full-length tests Set 2 + easy/medium topic quizzes
 *   Tier C (Complete): Hard topic quizzes + any remaining
 *   Trial exams: excluded from bundles (tier = null)
 */
function assignTiers(quizzes) {
  // Group by year level
  const byYear = {};
  for (const q of quizzes) {
    if (!q.year_level) continue;
    if (!byYear[q.year_level]) byYear[q.year_level] = [];
    byYear[q.year_level].push(q);
  }

  for (const [year, yearQuizzes] of Object.entries(byYear)) {
    // Sort: full-length first, then by set number, then by subject
    yearQuizzes.sort((a, b) => {
      if (a.is_full_length !== b.is_full_length) return b.is_full_length - a.is_full_length;
      if (a.set_number !== b.set_number) return a.set_number - b.set_number;
      return (a.subject || "").localeCompare(b.subject || "");
    });

    let tierOrder = 0;
    for (const q of yearQuizzes) {
      // Trial exams are excluded from bundles
      if (q.is_trial) {
        q.tier = null;
        q.tier_order = tierOrder++;
        continue;
      }

      if (q.is_full_length && q.set_number <= 1) {
        // Tier A: First set of full-length tests (core NAPLAN practice)
        q.tier = "A";
      } else if (q.is_full_length && q.set_number >= 2) {
        // Tier B: Additional full-length test sets
        q.tier = "B";
      } else if (q.difficulty === "easy" || q.difficulty === "medium") {
        // Tier B: Easy/medium topic quizzes
        q.tier = "B";
      } else if (q.difficulty === "hard") {
        // Tier C: Hard topic quizzes
        q.tier = "C";
      } else {
        // No difficulty set but it's a topic quiz → Tier B
        q.tier = "B";
      }
      q.tier_order = tierOrder++;
    }
  }

  return quizzes;
}

// ─── Bundle Builder ───

/**
 * Build bundle definitions from the synced quiz data.
 *
 * Bundle logic (YOUR requirement):
 *   Bundle A (Starter):      Tier A quizzes only
 *   Bundle B (Standard):     If user doesn't have A → A + B quizzes
 *                             If user already has A → B quizzes only (no overlap)
 *   Bundle C (Complete):     If user doesn't have A or B → A + B + C quizzes
 *                             If user has A → B + C quizzes
 *                             If user has A + B → C quizzes only
 *
 * The "includes_lower_tiers" flag on each bundle tells the provisioning
 * service whether to include lower-tier quizzes.
 *
 * The ACTUAL quiz assignment logic is in provisioningService.js —
 * it checks what the child already has and fills in missing tiers.
 */
const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: { type: String, required: true, unique: true, index: true },
    bundle_name: { type: String, required: true },
    description: { type: String, default: "" },
    year_level: { type: Number, required: true, enum: [3, 5, 7, 9] },
    subjects: [{ type: String }],
    tier: { type: String, enum: ["A", "B", "C"], required: true },
    // Quiz IDs that belong ONLY to this tier
    flexiquiz_quiz_ids: [{ type: String }],
    // Quiz IDs from ALL lower tiers (for standalone purchase)
    flexiquiz_quiz_ids_with_lower: [{ type: String }],
    flexiquiz_group_id: { type: String, default: null },
    price_cents: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    trial_quiz_ids: [{ type: String }],
    stripe_price_id: { type: String, default: null },
    includes_lower_tiers: { type: Boolean, default: true },
    quiz_count: { type: Number, default: 0 },
    quiz_count_with_lower: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

const QuizCatalog =
  mongoose.models.QuizCatalog || mongoose.model("QuizCatalog", QuizCatalogSchema);

// ── Pricing (AUD cents) — adjust as needed ──
const PRICING = {
  3: { A: 1900, B: 3500, C: 4900 },
  5: { A: 2400, B: 4500, C: 5900 },
  7: { A: 2900, B: 5200, C: 6900 },
  9: { A: 2900, B: 5200, C: 6900 },
};

const TIER_NAMES = {
  A: "Starter Pack",
  B: "Standard Pack",
  C: "Complete Pack",
};

const TIER_DESCRIPTIONS = {
  A: "Core NAPLAN practice tests — perfect to get started",
  B: "Extended practice with additional test sets and topic quizzes",
  C: "Full access to every quiz — maximum preparation",
};

async function rebuildBundles() {
  // Fetch all synced quizzes grouped by year + tier (exclude trials)
  const allQuizzes = await FlexiQuiz.find({
    year_level: { $ne: null },
    subject: { $ne: null },
    tier: { $in: ["A", "B", "C"] },   // exclude tier=null (trials, unparsed)
    is_trial: { $ne: true },
  })
    .sort({ tier_order: 1 })
    .lean();

  const byYearTier = {};
  for (const q of allQuizzes) {
    const key = `${q.year_level}_${q.tier}`;
    if (!byYearTier[key]) byYearTier[key] = [];
    byYearTier[key].push(q);
  }

  const yearLevels = [3, 5, 7, 9];
  const tiers = ["A", "B", "C"];
  let bundleCount = 0;

  for (const year of yearLevels) {
    const tierA = (byYearTier[`${year}_A`] || []).map((q) => q.quiz_id);
    const tierB = (byYearTier[`${year}_B`] || []).map((q) => q.quiz_id);
    const tierC = (byYearTier[`${year}_C`] || []).map((q) => q.quiz_id);

    // Collect subjects for each tier
    const tierASubjects = [...new Set((byYearTier[`${year}_A`] || []).map((q) => q.subject).filter(Boolean))];
    const tierBSubjects = [...new Set((byYearTier[`${year}_B`] || []).map((q) => q.subject).filter(Boolean))];
    const tierCSubjects = [...new Set((byYearTier[`${year}_C`] || []).map((q) => q.subject).filter(Boolean))];

    for (const tier of tiers) {
      let ownQuizIds, allQuizIds, subjects;

      if (tier === "A") {
        ownQuizIds = tierA;
        allQuizIds = tierA;
        subjects = tierASubjects;
      } else if (tier === "B") {
        ownQuizIds = tierB;
        allQuizIds = [...tierA, ...tierB]; // includes A
        subjects = [...new Set([...tierASubjects, ...tierBSubjects])];
      } else {
        ownQuizIds = tierC;
        allQuizIds = [...tierA, ...tierB, ...tierC]; // includes A + B
        subjects = [...new Set([...tierASubjects, ...tierBSubjects, ...tierCSubjects])];
      }

      // Skip if no quizzes for this year+tier
      if (allQuizIds.length === 0) continue;

      const bundleId = `year${year}_${tier.toLowerCase()}`;
      const pricing = PRICING[year] || PRICING[3];

      await QuizCatalog.updateOne(
        { bundle_id: bundleId },
        {
          $set: {
            bundle_id: bundleId,
            bundle_name: `Year ${year} ${TIER_NAMES[tier]}`,
            description: TIER_DESCRIPTIONS[tier],
            year_level: year,
            subjects: subjects.sort(),
            tier,
            flexiquiz_quiz_ids: ownQuizIds,
            flexiquiz_quiz_ids_with_lower: allQuizIds,
            price_cents: pricing[tier],
            is_active: true,
            quiz_count: ownQuizIds.length,
            quiz_count_with_lower: allQuizIds.length,
          },
        },
        { upsert: true }
      );

      console.log(
        `  📦 ${bundleId}: ${TIER_NAMES[tier]} — ` +
        `${ownQuizIds.length} own + ${allQuizIds.length - ownQuizIds.length} from lower tiers = ` +
        `${allQuizIds.length} total quizzes [${subjects.join(", ")}] — $${(pricing[tier] / 100).toFixed(2)}`
      );
      bundleCount++;
    }
  }

  return bundleCount;
}

// ─── Main ───

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB\n");

  // Step 1: Fetch all quizzes from FlexiQuiz
  const fqQuizzes = await fetchAllQuizzes();

  // Step 2: Parse and upsert each quiz
  console.log("\n🔍 Parsing quiz names and syncing to DB...\n");
  let synced = 0;
  let unparseable = [];

  for (const fq of fqQuizzes) {
    const quizId = fq.quiz_id || fq.quizId || fq.id;
    const quizName = fq.name || fq.quiz_name || "";
    const shortCode = fq.short_code || fq.shortCode || null;

    if (!quizId) continue;

    const parsed = parseQuizName(quizName);

    if (!parsed.year_level || !parsed.subject) {
      unparseable.push({ quiz_id: quizId, quiz_name: quizName, parsed });
    }

    await FlexiQuiz.updateOne(
      { quiz_id: quizId },
      {
        $set: {
          quiz_id: quizId,
          quiz_name: quizName,
          short_code: shortCode,
          status: fq.status || "active",
          date_created: fq.date_created || null,
          ...parsed,
        },
      },
      { upsert: true }
    );
    synced++;

    const tierLabel = parsed.is_trial ? "trial" : (parsed.is_full_length ? "full-length" : (parsed.difficulty || "topic"));
    console.log(
      `  ✅ ${quizName}` +
      ` → Year ${parsed.year_level || "?"}, ${parsed.subject || "?"}, ` +
      `${tierLabel}, set ${parsed.set_number}`
    );
  }

  console.log(`\n📊 Synced ${synced} quizzes`);

  if (unparseable.length > 0) {
    console.log(`\n⚠️  ${unparseable.length} quizzes could not be fully parsed:`);
    for (const u of unparseable) {
      console.log(`   - "${u.quiz_name}" (id: ${u.quiz_id})`);
    }
    console.log("   → These will be excluded from bundles until their names are fixed.\n");
  }

  // Step 3: Assign tiers
  console.log("🏷️  Assigning tiers...\n");
  const allInDb = await FlexiQuiz.find({
    year_level: { $ne: null },
    subject: { $ne: null },
  }).lean();

  const tiered = assignTiers(allInDb);
  for (const q of tiered) {
    await FlexiQuiz.updateOne(
      { quiz_id: q.quiz_id },
      { $set: { tier: q.tier, tier_order: q.tier_order } }
    );
  }

  // Step 4: Rebuild bundles
  console.log("📦 Rebuilding bundle catalog...\n");
  const bundleCount = await rebuildBundles();

  // Step 5: Summary
  console.log(`\n═══════════════════════════════════════`);
  console.log(`✅ Sync complete!`);
  console.log(`   Quizzes synced: ${synced}`);
  console.log(`   Bundles created/updated: ${bundleCount}`);
  console.log(`   Unparseable: ${unparseable.length}`);
  console.log(`═══════════════════════════════════════\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
