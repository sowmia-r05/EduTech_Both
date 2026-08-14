/**
 * src/services/geminiSubjectFeedback.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NODE PORT OF subject_feedback/gemini_subject_feedback.py
 *
 * WHY THIS EXISTS
 *   The Python script was spawned as a child process through
 *   runWithPythonLimit(), which caps concurrency at MAX_CONCURRENT_PYTHON=1
 *   because each spawn loads a fresh interpreter + the Gemini SDK (~150-200MB
 *   RSS). One AI feedback job at a time, ~5-10s each, queue depth 10, then 503.
 *
 *   Every network-touching line in that script was a single HTTPS POST to
 *   generativelanguage.googleapis.com. Node can make that call directly. With
 *   no process to fork there is nothing to limit — concurrency becomes whatever
 *   the event loop handles, which is hundreds.
 *
 * CONTRACT — IDENTICAL TO THE PYTHON SCRIPT
 *   Input:  { doc: <subset of Result/QuizAttempt doc> }
 *   Output: { success: true,  performance_analysis, ai_feedback, ai_feedback_meta }
 *        or { success: false, error: "..." }
 *
 *   Callers do not need to change how they read the result. The only change at
 *   the call site is dropping runWithPythonLimit() and awaiting this directly.
 *
 * DELIBERATE DIFFERENCES FROM THE PYTHON
 *   1. NO OPENAI FALLBACK. The compliance audit requires OpenAI off the
 *      sub-processor list. It was already dead code (no OPENAI_API_KEY set),
 *      and porting it would reintroduce a documented problem. Gemini only.
 *   2. Retries are explicit (GEMINI_MAX_RETRIES) rather than the Python's
 *      silent per-provider retry loop.
 *   3. A hard request timeout via AbortController. The Python had none of its
 *      own — it relied on the spawn timeout in the Node caller, which no
 *      longer exists once the subprocess is gone.
 *
 * EVERYTHING ELSE IS A FAITHFUL PORT: same prompts, same schema coercion,
 * same fallbacks, same meta fields. Feedback quality should be unchanged.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
const GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES || 2);

const SOURCE_TAG = "src/services/geminiSubjectFeedback.js";

// ─────────────────────────────────────────────────────────────
// Subject inference  (port of infer_subject_from_quiz_name)
// ─────────────────────────────────────────────────────────────
function inferSubjectFromQuizName(quizName) {
  const q = (quizName || "").toLowerCase();
  if (q.includes("numeracy") || q.includes("mathematics") || q.includes("math")) {
    return "Numeracy (Mathematics)";
  }
  if ((q.includes("language") && q.includes("convention")) || q.includes("convention")) {
    return "Language Conventions";
  }
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";
  return "NAPLAN Assessment";
}

// ─────────────────────────────────────────────────────────────
// Year inference  (port of infer_year_level)
// ─────────────────────────────────────────────────────────────
const YEAR_RE = /\b(?:year|yr|grade)\s*([3579])\b/i;
const YEAR_DIGIT_RE = /\b([3579])\s*(?:year|yr|grade)\b/i;

function inferYearLevel(doc, quizName) {
  // 1) From doc
  for (const key of ["year_level", "yearLevel", "grade", "year"]) {
    const v = doc[key];
    if (typeof v === "number" && [3, 5, 7, 9].includes(Math.trunc(v))) {
      return Math.trunc(v);
    }
    if (typeof v === "string") {
      const vv = v.trim();
      if (/^\d+$/.test(vv) && [3, 5, 7, 9].includes(parseInt(vv, 10))) {
        return parseInt(vv, 10);
      }
    }
  }

  // 2) From quiz_name
  const q = quizName || "";
  const m = q.match(YEAR_RE) || q.match(YEAR_DIGIT_RE);
  if (m) {
    const yr = parseInt(m[1], 10);
    if ([3, 5, 7, 9].includes(yr)) return yr;
  }

  // 3) Compact strings like Year3 / Yr5
  const ql = (quizName || "").toLowerCase().replace(/ /g, "");
  for (const yr of [3, 5, 7, 9]) {
    if (ql.includes(`year${yr}`) || ql.includes(`yr${yr}`) || ql.includes(`grade${yr}`)) {
      return yr;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Numeric coercion  (port of to_number)
// Handles Mongo Extended JSON — Decimal128 arrives as {$numberDecimal:"12.5"}
// when a doc is serialised, which a naive Number() would turn into NaN.
// ─────────────────────────────────────────────────────────────
function toNumber(x) {
  if (typeof x === "number" && Number.isFinite(x)) return x;

  // Mongoose Decimal128 instances stringify cleanly
  if (x && typeof x === "object" && x._bsontype === "Decimal128") {
    const n = parseFloat(x.toString());
    return Number.isFinite(n) ? n : null;
  }

  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  if (x && typeof x === "object") {
    for (const k of ["$numberDecimal", "$numberInt", "$numberLong"]) {
      if (typeof x[k] === "string") {
        const n = parseFloat(x[k]);
        return Number.isFinite(n) ? n : null;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Topic shape tolerance  (port of topic_scored_total)
// ─────────────────────────────────────────────────────────────
function topicScoredTotal(v) {
  const pairs = [
    ["scored", "total"],
    ["points", "available"],
    ["points_scored", "points_available"],
    ["correct", "attempted"],
  ];
  for (const [a, b] of pairs) {
    const sa = toNumber(v[a]);
    const sb = toNumber(v[b]);
    if (sa !== null && sb !== null) return [sa, sb];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Normalise input doc  (port of normalize_student_data)
// Returns [studentData, errorString]
// ─────────────────────────────────────────────────────────────
function normalizeStudentData(doc) {
  const scoreObj = doc.score || {};
  let percentage = null;
  let grade = null;

  if (scoreObj && typeof scoreObj === "object") {
    percentage = toNumber(scoreObj.percentage);
    if (typeof scoreObj.grade === "string") grade = scoreObj.grade;

    if (percentage === null) {
      const pts = toNumber(scoreObj.points);
      const avail = toNumber(scoreObj.available);
      if (pts !== null && avail !== null && avail > 0) {
        percentage = (pts / avail) * 100.0;
      }
    }
  }

  const topicObj = doc.topicBreakdown;
  const normalizedTopics = [];

  if (topicObj && typeof topicObj === "object" && !Array.isArray(topicObj)) {
    for (const [k, v] of Object.entries(topicObj)) {
      if (!v || typeof v !== "object") continue;
      const st = topicScoredTotal(v);
      if (!st) continue;
      normalizedTopics.push({ name: String(k), scored: st[0], total: st[1] });
    }
  }

  if (normalizedTopics.length === 0) {
    return [
      null,
      "Missing/empty topicBreakdown (expected an object with {topic:{scored,total}} or compatible keys)",
    ];
  }

  if (percentage === null) {
    const totalScored = normalizedTopics.reduce((a, x) => a + x.scored, 0);
    const totalTotal = normalizedTopics.reduce((a, x) => a + x.total, 0);
    if (totalTotal > 0) percentage = (totalScored / totalTotal) * 100.0;
  }

  if (percentage === null) {
    return [
      null,
      "Missing overall percentage (score.percentage or score.points/available or computable from topics)",
    ];
  }

  return [
    {
      total_score: { percentage, grade },
      sub_subjects: normalizedTopics,
    },
    null,
  ];
}

// ─────────────────────────────────────────────────────────────
// First session detection  (port of is_no_attempt_session)
// ─────────────────────────────────────────────────────────────
function isNoAttemptSession(topics) {
  let totalTotal = 0;
  for (const t of topics) {
    const n = toNumber(t.total);
    if (n !== null) totalTotal += n;
  }
  return totalTotal <= 0;
}

// ─────────────────────────────────────────────────────────────
// Timing  (port of compute_time_metrics / pace_label)
// ─────────────────────────────────────────────────────────────
function computeTimeMetrics(doc, topics) {
  const d = doc.duration != null ? toNumber(doc.duration) : null;
  let timeTakenMinutes = null;
  if (d !== null) {
    const secs = d > 100000 ? d / 1000.0 : d;
    timeTakenMinutes = Math.round((secs / 60.0) * 10) / 10;
  }

  let totalQuestions = 0;
  for (const t of topics) {
    const n = toNumber(t.total);
    if (n !== null) totalQuestions += Math.trunc(n);
  }

  let secondsPerQuestion = null;
  if (timeTakenMinutes !== null && totalQuestions > 0) {
    secondsPerQuestion =
      Math.round(((timeTakenMinutes * 60.0) / totalQuestions) * 10) / 10;
  }

  return {
    time_taken_minutes: timeTakenMinutes,
    total_questions: totalQuestions,
    seconds_per_question: secondsPerQuestion,
  };
}

function paceLabel(yearLevel, secondsPerQuestion) {
  if (secondsPerQuestion === null || secondsPerQuestion === undefined) return "unknown";

  let fast, slow;
  if (yearLevel === 3) [fast, slow] = [25, 70];
  else if (yearLevel === 5) [fast, slow] = [22, 60];
  else if (yearLevel === 7) [fast, slow] = [20, 55];
  else if (yearLevel === 9) [fast, slow] = [18, 50];
  else [fast, slow] = [20, 60];

  if (secondsPerQuestion < fast) return "fast";
  if (secondsPerQuestion > slow) return "slow";
  return "steady";
}

// ─────────────────────────────────────────────────────────────
// Performance analysis  (port of analyze_performance)
// ─────────────────────────────────────────────────────────────
function analyzePerformance(studentData, doc, yearLevel) {
  const topics = studentData.sub_subjects;
  const overallPct = Number(studentData.total_score.percentage);
  const grade = studentData.total_score.grade || "";

  const topicPerf = [];
  let high = 0;
  let low = 0;

  for (const t of topics) {
    const total = Number(t.total || 0);
    if (total === 0) continue;

    const scored = Number(t.scored || 0);
    const pct = (scored / total) * 100.0;
    const missed = Math.max(0, total - scored);

    topicPerf.push({
      name: t.name,
      percentage: Math.round(pct * 10) / 10,
      scored,
      total,
      missed: Math.round(missed * 10) / 10,
    });

    if (pct >= 80) high += 1;
    else if (pct <= 30) low += 1;
  }

  topicPerf.sort((a, b) => b.percentage - a.percentage);

  const topTopics = topicPerf.length >= 3 ? topicPerf.slice(0, 3) : topicPerf.slice();

  const weakTopics =
    topicPerf.length >= 3
      ? topicPerf.slice(-3).reverse()
      : topicPerf.slice().reverse();

  const tm = computeTimeMetrics(doc, topics);
  const pace = paceLabel(yearLevel, tm.seconds_per_question);

  return {
    year_level: yearLevel,
    overall_percentage: Math.round(overallPct * 10) / 10,
    accuracy: Math.round(overallPct * 10) / 10,
    grade,
    time_taken_minutes: tm.time_taken_minutes,
    total_questions: tm.total_questions,
    seconds_per_question: tm.seconds_per_question,
    pace,
    high_performance_count: high,
    low_performance_count: low,
    all_topics: topicPerf,
    top_topics: topTopics,
    weak_topics: weakTopics,
  };
}

// ─────────────────────────────────────────────────────────────
// Tone  (port of tone_guidance)
// ─────────────────────────────────────────────────────────────
function toneGuidance(yearLevel) {
  if (yearLevel === 3) return "Use very simple words, short sentences, warm and encouraging.";
  if (yearLevel === 5) return "Use simple clear language, slightly more detailed steps.";
  if (yearLevel === 7) return "Use confident coaching tone, practical strategies, more independence.";
  if (yearLevel === 9) return "Use mature, direct coaching tone, exam-strategy focus, self-reflection.";
  return "Use supportive, clear, actionable tone.";
}

// ─────────────────────────────────────────────────────────────
// Reading difficulty tiers  (port of _reading_tier_stats)
// Passage NAMES never reach the model — only tier + score.
// ─────────────────────────────────────────────────────────────
function readingTierStats(passages) {
  const hard = passages.filter((p) => p.percentage < 50);
  const med = passages.filter((p) => p.percentage >= 50 && p.percentage < 75);
  const easy = passages.filter((p) => p.percentage >= 75);

  const avg = (g) =>
    g.length ? Math.round(g.reduce((a, p) => a + p.percentage, 0) / g.length) : null;
  const scores = (g) => g.map((p) => Math.round(p.percentage));

  return {
    hard: { n: hard.length, avg: avg(hard), scores: scores(hard) },
    med: { n: med.length, avg: avg(med), scores: scores(med) },
    easy: { n: easy.length, avg: avg(easy), scores: scores(easy) },
  };
}

// ─────────────────────────────────────────────────────────────
// Reading prompt  (port of build_reading_prompt)
// ─────────────────────────────────────────────────────────────
function buildReadingPrompt(analysis, yearLevel, productInsights) {
  const accuracy = analysis.accuracy;
  const pace = analysis.pace;
  const timeTaken = analysis.time_taken_minutes;
  const spq = analysis.seconds_per_question;

  const timeStr = timeTaken !== null ? `${timeTaken} minutes` : "not recorded";
  const spqStr = spq !== null ? `${spq} sec/question` : "not available";

  const tiers = readingTierStats(analysis.all_topics || []);

  const tierLine = (label, t) => {
    if (!t.n) return null;
    const sc = t.scores.map((s) => `${s}%`).join(", ");
    const unit = t.n === 1 ? "passage" : "passages";
    return `${label}: ${t.n} ${unit}, scores: ${sc} (avg ${t.avg}%)`;
  };

  const tierLines = [
    tierLine("Harder passages (under 50%)", tiers.hard),
    tierLine("Medium passages (50-74%)", tiers.med),
    tierLine("Easier passages (75%+)", tiers.easy),
  ].filter(Boolean);

  const tierBlock = tierLines.length
    ? tierLines.join("\n  - ")
    : "No passage data available";

  const insightsBlock =
    productInsights && productInsights.length
      ? "\n\nProduct Style Guidelines:\n- " + productInsights.join("\n- ")
      : "";

  const toneBlock =
    `YEAR LEVEL: Year ${yearLevel ? yearLevel : "Unknown"}\n` +
    `TONE RULE: ${toneGuidance(yearLevel)}`;

  return `You are an expert AI Reading Coach creating personalized feedback for a Reading comprehension assessment.

AUDIENCE: Student + Parent/Teacher
${toneBlock}

READING FEEDBACK RULES (READ CAREFULLY):
- Reading questions are grouped by PASSAGE. You are NOT given passage titles, and
  you must NEVER invent or mention any passage name, title, or topic.
- Refer to passages ONLY by their difficulty level (easier / medium / harder) and
  the score, e.g. "the harder passages (around 35%)".
- Judge difficulty from the student's score:
   - A LOW score = a harder / longer / trickier passage. Reassure the student that
     tougher passages are completely normal and give ONE gentle, GENERAL reading
     strategy. NEVER say or imply the student is bad at reading.
   - A HIGH score = praise; they handled an easier passage confidently.

PERFORMANCE DATA:
Overall Reading Score: ${accuracy}%
Time: ${timeStr}  |  Speed: ${spqStr}  |  Pace: ${pace}

PASSAGE DIFFICULTY (derived from this student's scores - no titles):
  - ${tierBlock}

TIMING RULE:
- Mention timing in overall_feedback (1 sentence).
${insightsBlock}

OUTPUT REQUIREMENTS:

Return ONLY valid JSON (no markdown, no code blocks, no extra text).

Required JSON structure:
{
  "overall_feedback": "EXACTLY 2 short sentences, max 14 words each.",
  "coach": [
    {"insight":"...","reason":"...","action":"..."},
    {"insight":"...","reason":"...","action":"..."},
    {"insight":"...","reason":"...","action":"..."}
  ],
  "strengths": ["3 points about difficulty tiers + scores, max 10 words each", "...", "..."],
  "weaknesses": ["3 points about harder tiers + scores, max 10 words each", "...", "..."],
  "growth_areas": ["3 points, max 10 words each", "...", "..."],
  "study_tips": ["up to 3 GENERAL reading strategies, max 10 words each", "...", "..."],

  "topic_wise_tips": [
    {"topic":"Harder passages","tips":["<=14 words","<=14 words"]},
    {"topic":"Easier passages","tips":["<=14 words"]}
  ],

  "cta": "One motivating call-to-action (12 words max)",
  "encouragement": "4-5 short sentences, supportive and specific."
}

CHECKLIST:
- NEVER mention a passage name or title. Use difficulty + score only.
- A low tier score = a harder passage + reassurance, never blame.
- topic_wise_tips topics are difficulty tiers ("Harder/Medium/Easier passages").
- study_tips are GENERAL reading strategies.
- Include timing in overall_feedback (1 sentence).`.trim();
}

// ─────────────────────────────────────────────────────────────
// Shared small helpers used by both coercion functions
// ─────────────────────────────────────────────────────────────
const arr = (x) => (Array.isArray(x) ? x : []);
const ensureString = (x) => (x ? String(x).trim() : "");

function clampWords(s, maxWords) {
  const t = (s || "").trim();
  if (!t) return "";
  return t.split(/\s+/).slice(0, maxWords).join(" ");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─────────────────────────────────────────────────────────────
// Reading schema coercion  (port of coerce_reading_feedback_schema)
// Drops and replaces any model text that leaks a passage name.
// ─────────────────────────────────────────────────────────────
function coerceReadingFeedbackSchema(aiRaw, analysis) {
  const ai = aiRaw && typeof aiRaw === "object" ? aiRaw : {};

  const accuracy = analysis.accuracy;
  const pace = analysis.pace || "unknown";
  const timeTaken = analysis.time_taken_minutes;
  const spq = analysis.seconds_per_question;

  const passages = analysis.all_topics || [];
  const names = passages
    .filter((p) => p.name)
    .map((p) => String(p.name).trim().toLowerCase());

  const STOP = new Set([
    "the", "a", "an", "of", "to", "and", "in", "on", "at", "for",
    "with", "my", "is", "was", "passage", "reading",
  ]);

  const nameTokens = new Set();
  for (const nm of names) {
    const toks = nm.match(/[a-z]+/g) || [];
    for (const tok of toks) {
      if (tok.length >= 4 && !STOP.has(tok)) nameTokens.add(tok);
    }
  }

  const hasName = (s) => {
    const low = (s || "").toLowerCase();
    if (names.some((n) => n && low.includes(n))) return true;
    for (const tok of nameTokens) {
      if (new RegExp(`\\b${escapeRegex(tok)}\\b`).test(low)) return true;
    }
    return false;
  };

  const tiers = readingTierStats(passages);
  const { hard, med, easy } = tiers;

  const GENERAL_TIPS = [
    "Reread the question before scanning the passage.",
    "Skim for keywords, then read that part closely.",
    "Underline who, what and where as you read.",
    "Check every option back against the text.",
  ];

  // de-dup: collapse near-identical points by their first 3 words
  const keyOf = (s) => {
    const norm = (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
    return norm.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  };

  const buildDistinct = (aiList, fillers, target = 3) => {
    const out = [];
    const seen = new Set();
    for (const raw of [...aiList, ...fillers]) {
      const item = ensureString(raw);
      if (!item || hasName(item)) continue;
      const k = keyOf(item);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(item);
      if (out.length >= target) break;
    }
    return out;
  };

  // STRENGTHS
  const tierStrengths = [];
  if (easy.n) tierStrengths.push("Strong on the easier passages");
  if (med.n) tierStrengths.push("Steady on the medium passages");
  if (pace === "fast" && accuracy >= 50 && spq !== null) {
    tierStrengths.push(`Good reading pace: ${spq}s per question`);
  }
  const GENERIC_STRENGTH = [
    "Stayed focused through the whole test",
    "Worked steadily across every passage",
    "Kept going even on the longer passages",
  ];
  const strengths = buildDistinct(arr(ai.strengths), [
    ...tierStrengths,
    ...GENERIC_STRENGTH,
  ]);

  // WEAKNESSES — never blame
  const tierWeak = [];
  if (hard.n) tierWeak.push("Harder passages were the toughest part");
  if (med.n) tierWeak.push("Medium passages have room to grow");
  if (pace === "slow" && spq !== null) {
    tierWeak.push(`Reading pace was a little slow: ${spq}s/question`);
  }
  const GENERIC_WEAK = [
    "Some longer passages need a careful second read",
    "Tricky questions are worth a slower, closer look",
    "Building stamina on long passages will help",
  ];
  const weaknesses = buildDistinct(arr(ai.weaknesses), [
    ...tierWeak,
    ...GENERIC_WEAK,
  ]);

  // GROWTH AREAS
  const tierGrowth = [];
  if (hard.n) tierGrowth.push("Build confidence on the harder passages");
  if (med.n) tierGrowth.push("Turn medium passages into easy wins");
  const GENERIC_GROWTH = [
    "Practice longer passages to build reading stamina",
    "Slow down and reread before answering",
    "Review the questions you found tricky",
  ];
  const growthAreas = buildDistinct(arr(ai.growth_areas), [
    ...tierGrowth,
    ...GENERIC_GROWTH,
  ]);

  // STUDY TIPS — general strategies only
  const studyTips = arr(ai.study_tips)
    .map(ensureString)
    .filter((x) => x && !hasName(x))
    .slice(0, 3);
  let i = 0;
  while (studyTips.length < 3 && i < GENERAL_TIPS.length) {
    if (!studyTips.includes(GENERAL_TIPS[i])) studyTips.push(GENERAL_TIPS[i]);
    i += 1;
  }
  const studyTips3 = studyTips.slice(0, 3);

  // COACH
  const coachItems = [];
  for (const item of arr(ai.coach)) {
    if (!item || typeof item !== "object") continue;
    const insight = ensureString(item.insight);
    const reason = ensureString(item.reason);
    const action = ensureString(item.action);
    if (
      insight && reason && action &&
      !(hasName(insight) || hasName(reason) || hasName(action))
    ) {
      coachItems.push({ insight, reason, action });
    }
  }
  const coach3 = coachItems.slice(0, 3);

  const coachFallback = [];
  if (hard.n) {
    coachFallback.push({
      insight: "The harder passages were the toughest part.",
      reason: `You averaged ${hard.avg}% there - harder passages are normal.`,
      action: "Reread the question, then skim the passage for keywords.",
    });
  }
  if (med.n) {
    coachFallback.push({
      insight: "Medium passages are your biggest chance to climb.",
      reason: `You averaged ${med.avg}% on them - close to a win.`,
      action: "Slow down and check each option against the text.",
    });
  }
  coachFallback.push({
    insight: "Short daily reading builds comprehension confidence.",
    reason: "Regular practice makes tricky passages feel easier.",
    action: "Read one short passage and answer 5 questions daily.",
  });

  let fi = 0;
  while (coach3.length < 3 && fi < coachFallback.length) {
    coach3.push(coachFallback[fi]);
    fi += 1;
  }

  // TOPIC-WISE TIPS — difficulty tiers, no names
  const topicWiseTips = [];
  if (hard.n) {
    topicWiseTips.push({
      topic: "Harder passages",
      tips: [
        clampWords(`You averaged ${hard.avg}% here - that is completely normal.`, 14),
        "Reread the question, then skim the passage for keywords.",
      ],
    });
  }
  if (med.n) {
    topicWiseTips.push({
      topic: "Medium passages",
      tips: [
        clampWords(`You averaged ${med.avg}% - almost there.`, 14),
        "Check each answer option back against the text.",
      ],
    });
  }
  if (easy.n) {
    topicWiseTips.push({
      topic: "Easier passages",
      tips: [
        clampWords(`Great work - you averaged ${easy.avg}%.`, 14),
        "Keep using the strategies that worked here.",
      ],
    });
  }
  if (topicWiseTips.length === 0) {
    topicWiseTips.push({
      topic: "Building reading stamina",
      tips: [
        "Read one short passage and answer questions daily.",
        "Slow down on long passages and reread tricky parts.",
      ],
    });
  }

  // OVERALL FEEDBACK
  let overallFeedback = ensureString(ai.overall_feedback);
  if (!overallFeedback || hasName(overallFeedback)) {
    overallFeedback = hard.n
      ? `You scored ${accuracy}% overall; the harder passages were tougher. Keep practising and you will grow.`
      : `Solid reading at ${accuracy}% overall. You handled the passages confidently.`;
  }
  if (
    timeTaken !== null &&
    !overallFeedback.toLowerCase().includes("minute") &&
    !overallFeedback.toLowerCase().includes("time")
  ) {
    overallFeedback = `${overallFeedback} Time taken: ${timeTaken} minutes.`;
  }

  let cta = ensureString(ai.cta);
  if (!cta || hasName(cta)) {
    cta = "Read one passage a day and beat your last score.";
  }

  let encouragement = ensureString(ai.encouragement);
  if (!encouragement || hasName(encouragement)) {
    encouragement =
      "Every passage you read makes the next one easier. " +
      "Harder passages are a chance to grow, not a setback. " +
      "Keep reading a little each day. " +
      "You are improving with every test.";
  }

  return {
    overall_feedback: overallFeedback,
    coach: coach3,
    strengths,
    weaknesses,
    growth_areas: growthAreas,
    study_tips: studyTips3,
    topic_wise_tips: topicWiseTips.slice(0, 3),
    cta,
    encouragement,
  };
}

// ─────────────────────────────────────────────────────────────
// Standard subject prompt  (port of build_gemini_prompt)
// ─────────────────────────────────────────────────────────────
function buildSubjectPrompt(analysis, subject, productInsights) {
  const fmtTopics = (items) => {
    if (!items || !items.length) return "None";
    return items
      .map((x) => {
        const missed = Math.trunc(x.missed || 0);
        const total = Math.trunc(x.total || 0);
        return (
          `${x.name} - ${x.percentage}% correct ` +
          `(${Math.trunc(x.scored)}/${total} questions, ${missed} missed)`
        );
      })
      .join("\n  • ");
  };

  const yearLevel = analysis.year_level;
  const topStr = fmtTopics(analysis.top_topics || []);
  const weakStr = fmtTopics(analysis.weak_topics || []);

  const weakTopicsList = analysis.weak_topics || [];
  const weakestTopic = weakTopicsList.length ? weakTopicsList[0] : null;

  const timeTaken = analysis.time_taken_minutes;
  const totalQ = analysis.total_questions;
  const spq = analysis.seconds_per_question;
  const pace = analysis.pace;

  const timeStr = timeTaken !== null ? `${timeTaken} minutes` : "not recorded";
  const spqStr = spq !== null ? `${spq} sec/question` : "not available";

  let weaknessInstructions = "";
  if (weakestTopic) {
    weaknessInstructions = `
⚠️ CRITICAL REQUIREMENT - WEAKEST TOPIC:
The weakest performing topic is: "${weakestTopic.name}"
Performance: ${weakestTopic.percentage}% (${Math.trunc(weakestTopic.scored)}/${Math.trunc(weakestTopic.total)} correct, ${Math.trunc(weakestTopic.missed)} missed)

YOU MUST:
1) Include "${weakestTopic.name}" as FIRST item in weaknesses AND growth_areas.
2) Create at least ONE coach item about "${weakestTopic.name}" with an actionable task.
3) Include a study_tip specifically for "${weakestTopic.name}".
4) topic_wise_tips[0].topic MUST be "${weakestTopic.name}".

If "${weakestTopic.name}" is missing from weaknesses, the output is INVALID.
`;
  }

  const timingInstructions = `
⏱️ TIMING REQUIREMENT:
Time taken: ${timeStr}
Total questions: ${totalQ}
Speed: ${spqStr}
Pace label: ${pace}

RULE:
- Mention timing in overall_feedback (1 sentence).
- If pace is "slow", include timing as a weakness point.
- If pace is "fast" AND accuracy is 50% or above, timing is a strength.
- If pace is "fast" AND accuracy is below 50%, timing is a WEAKNESS — the student
  rushed. Say so kindly: quick answers, but slow down and check the work.
- If pace is "steady", mention it positively (neutral/strength).
`;

  const insightsBlock =
    productInsights && productInsights.length
      ? "\n\nProduct Style Guidelines:\n• " + productInsights.join("\n• ")
      : "";

  const toneBlock =
    `YEAR LEVEL: Year ${yearLevel ? yearLevel : "Unknown"}\n` +
    `TONE RULE: ${toneGuidance(yearLevel)}`;

  return `You are an expert AI Coach creating personalized feedback for a ${subject} assessment.

AUDIENCE: Student + Parent/Teacher
${toneBlock}

═══════════════════════════════════════════════════════════════
PERFORMANCE DATA:
═══════════════════════════════════════════════════════════════
Overall Score: ${analysis.accuracy}%
Time: ${timeStr}  |  Speed: ${spqStr}  |  Pace: ${pace}
High performers (≥80%): ${analysis.high_performance_count} topics
Low performers (≤30%): ${analysis.low_performance_count} topics

STRONGEST TOPICS:
  • ${topStr}

WEAKEST TOPICS:
  • ${weakStr}

${weaknessInstructions}
${timingInstructions}
${insightsBlock}

═══════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS:
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks, no extra text).

Required JSON structure:
{
  "overall_feedback": "EXACTLY 2 short sentences, max 14 words each.",
  "coach": [
    {"insight":"...","reason":"...","action":"..."},
    {"insight":"...","reason":"...","action":"..."},
    {"insight":"...","reason":"...","action":"..."}
  ],
  "strengths": ["3 points, max 10 words each", "...", "..."],
  "weaknesses": ["3 points, max 10 words each", "...", "..."],
  "growth_areas": ["3 points, max 10 words each", "...", "..."],
  "study_tips": ["up to 3 items, max 10 words each", "...", "..."],

  "topic_wise_tips": [
    {"topic":"<topic name>","tips":["<=14 words","<=14 words"]},
    {"topic":"<topic name>","tips":["<=14 words","<=14 words"]},
    {"topic":"<topic name>","tips":["<=14 words","<=14 words"]}
  ],

  "cta": "One motivating call-to-action (12 words max)",
  "encouragement": "4-5 short sentences, supportive and specific."
}

CHECKLIST:
- weaknesses MUST exist and have 3 points
- weaknesses[0] MUST be the weakest topic name
- topic_wise_tips MUST exist and have 3 items
- topic_wise_tips topics MUST match weak topics (use real names)
- topic_wise_tips[0].topic MUST be the weakest topic
- Include timing in overall_feedback (1 sentence)
- Use real topic names and real numbers
- Actions must include a number + time or quantity`.trim();
}

// ─────────────────────────────────────────────────────────────
// JSON extraction  (port of safe_json_from_text)
// Models sometimes wrap output in code fences or prepend chatter.
// ─────────────────────────────────────────────────────────────
function safeJsonFromText(text) {
  let t = (text || "").trim();

  if (t.includes("```")) {
    const lines = t.split("\n");
    const jsonLines = [];
    let inBlock = false;
    for (const line of lines) {
      const stripped = line.trim();
      if (stripped.startsWith("```")) {
        if (inBlock) break;
        inBlock = true;
        continue;
      }
      if (inBlock) jsonLines.push(line);
    }
    if (jsonLines.length) t = jsonLines.join("\n").trim();
  }

  try {
    return JSON.parse(t);
  } catch (_) {
    /* fall through */
  }

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}") + 1;
  if (start === -1 || end <= 0) {
    throw new Error(
      `Model did not return a JSON object. Response was: ${t.slice(0, 200)}`
    );
  }

  const clean = t.slice(start, end);
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Invalid JSON from model: ${e.message}\nContent: ${clean.slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// THE ONLY NETWORK CALL.
//
// This is what the whole port is for. Previously: fork a Python interpreter,
// load google.generativeai, make this exact request, print JSON to stdout,
// parse it back in Node. Now: one fetch.
//
// systemInstruction is deliberately NOT used here — the Python sent a single
// user-role prompt, and the coercion layer downstream is what actually enforces
// the schema. Splitting the prompt across channels would change model behaviour
// and is out of scope for a faithful port.
// ─────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header, not query string — keeps the key out of URLs and logs.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const e = new Error(`Gemini ${res.status}: ${errText.slice(0, 400)}`);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text || "").join("").trim();

  if (!text) throw new Error("Empty response from model");
  return text;
}

/**
 * Retry wrapper. Port of generate_feedback(), minus the OpenAI provider loop.
 * Retries on any error — 429, 5xx, timeout, empty or unparseable output.
 */
async function generateFeedback(prompt, maxRetries = GEMINI_MAX_RETRIES) {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const text = await callGemini(prompt);
      return { parsed: safeJsonFromText(text), model: GEMINI_MODEL, provider: "gemini" };
    } catch (e) {
      lastError = e;
      // Small backoff between attempts; a 429 that retries instantly just 429s again.
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Gemini failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

// ─────────────────────────────────────────────────────────────
// Standard schema coercion  (port of coerce_ai_feedback_schema)
// Guarantees weaknesses, timing and topic_wise_tips always appear, whatever
// the model returned.
// ─────────────────────────────────────────────────────────────
function coerceAiFeedbackSchema(aiRaw, analysis) {
  const ai = aiRaw && typeof aiRaw === "object" ? aiRaw : {};

  const weakTopics = analysis.weak_topics || [];
  const topTopics = analysis.top_topics || [];
  const weakestTopic = weakTopics.length ? weakTopics[0] : null;

  const pace = analysis.pace || "unknown";
  const timeTaken = analysis.time_taken_minutes;
  const spq = analysis.seconds_per_question;

  // ---- COACH (3 items) ----
  let coachItems = [];
  for (const item of arr(ai.coach)) {
    if (!item || typeof item !== "object") continue;
    const insight = ensureString(item.insight);
    const reason = ensureString(item.reason);
    const action = ensureString(item.action);
    if (insight && reason && action) coachItems.push({ insight, reason, action });
  }
  coachItems = coachItems.slice(0, 3);

  let weakestMentionedInCoach = false;
  if (weakestTopic) {
    const wk = weakestTopic.name.toLowerCase();
    weakestMentionedInCoach = coachItems.some(
      (it) => it.insight.toLowerCase().includes(wk) || it.reason.toLowerCase().includes(wk)
    );
  }

  while (coachItems.length < 3) {
    const idx = coachItems.length;
    if (idx < weakTopics.length) {
      const topic = weakTopics[idx];
      const missed = Math.trunc(topic.missed || 0);
      const total = Math.trunc(topic.total || 0);
      coachItems.push({
        insight: `${topic.name} needs focused practice to improve.`,
        reason: `You missed ${missed} out of ${total} questions here.`,
        action: `Do 10 ${topic.name} questions in 15 minutes today.`,
      });
    } else {
      coachItems.push({
        insight: "Small daily practice builds strong long-term skills.",
        reason: "Repeating key patterns helps you remember faster.",
        action: "Study for 15 minutes daily and review mistakes.",
      });
    }
  }

  if (weakestTopic && !weakestMentionedInCoach && coachItems.length) {
    const topic = weakestTopic;
    const missed = Math.trunc(topic.missed || 0);
    const total = Math.trunc(topic.total || 0);
    coachItems[coachItems.length - 1] = {
      insight: `${topic.name} is the biggest improvement opportunity.`,
      reason: `You missed ${missed} out of ${total} questions in ${topic.name}.`,
      action: `Practice 12 ${topic.name} questions tomorrow (20 minutes).`,
    };
  }

  // ---- STRENGTHS (3) ----
  let strengths = arr(ai.strengths).map(ensureString).filter(Boolean).slice(0, 3);
  while (strengths.length < Math.min(3, topTopics.length)) {
    const topic = topTopics[strengths.length];
    strengths.push(`${topic.name}: ${topic.percentage}% accuracy`);
  }
  if (pace === "fast" && analysis.accuracy >= 50 && timeTaken !== null && spq !== null) {
    const timingStrength = `Good speed: ${spq}s per question`;
    if (!strengths.join(" ").toLowerCase().includes(timingStrength.toLowerCase())) {
      if (strengths.length < 3) strengths.push(timingStrength);
      else strengths[strengths.length - 1] = timingStrength;
    }
  }
  strengths = strengths.slice(0, 3);

  // ---- WEAKNESSES (3) — weakest topic must be first ----
  let weaknesses = arr(ai.weaknesses).map(ensureString).filter(Boolean).slice(0, 3);

  if (weakestTopic) {
    const first = `${weakestTopic.name}: low accuracy`;
    if (!weaknesses.length) {
      weaknesses = [first];
    } else if (!weaknesses[0].toLowerCase().includes(weakestTopic.name.toLowerCase())) {
      weaknesses = [first, ...weaknesses.filter(Boolean)];
    }
  }

  for (const topic of weakTopics.slice(0, 3)) {
    if (weaknesses.length >= 3) break;
    if (!weaknesses.join(" ").toLowerCase().includes(topic.name.toLowerCase())) {
      weaknesses.push(`${topic.name}: ${topic.percentage}% accuracy`);
    }
  }

  if (pace === "slow" && timeTaken !== null && spq !== null) {
    const timingWeakness = `Too slow: ${spq}s per question`;
    if (!weaknesses.join(" ").toLowerCase().includes(timingWeakness.toLowerCase())) {
      if (weaknesses.length < 3) weaknesses.push(timingWeakness);
      else weaknesses[weaknesses.length - 1] = timingWeakness;
    }
  }

  while (weaknesses.length < 3) weaknesses.push("Needs more practice consistency");
  weaknesses = weaknesses.slice(0, 3);

  // ---- GROWTH AREAS (3) ----
  let growthAreas = arr(ai.growth_areas).map(ensureString).filter(Boolean).slice(0, 3);

  if (weakestTopic) {
    const mustFirst = `${weakestTopic.name}: practice daily`;
    if (!growthAreas.length) {
      growthAreas = [mustFirst];
    } else if (!growthAreas[0].toLowerCase().includes(weakestTopic.name.toLowerCase())) {
      growthAreas = [mustFirst, ...growthAreas.filter(Boolean)];
    }
  }

  for (const topic of weakTopics.slice(0, 3)) {
    if (growthAreas.length >= 3) break;
    if (!growthAreas.join(" ").toLowerCase().includes(topic.name.toLowerCase())) {
      growthAreas.push(`${topic.name}: improve by revising mistakes`);
    }
  }

  while (growthAreas.length < 3) growthAreas.push("Improve accuracy by checking answers");
  growthAreas = growthAreas.slice(0, 3);

  // ---- STUDY TIPS (up to 3) ----
  let studyTips = arr(ai.study_tips).map(ensureString).filter(Boolean).slice(0, 3);
  if (weakestTopic) {
    const wk = weakestTopic.name.toLowerCase();
    if (!studyTips.some((t) => t.toLowerCase().includes(wk))) {
      studyTips = [`Practice ${weakestTopic.name} 10 minutes daily`, ...studyTips];
    }
  }
  studyTips = studyTips.slice(0, 3);

  // ---- TOPIC-WISE TIPS ----
  const topicWiseTips = [];

  const normalizeTipsList = (x) => {
    if (!Array.isArray(x)) return [];
    return x
      .map((t) => clampWords(String(t).trim(), 14))
      .filter(Boolean)
      .slice(0, 3);
  };

  if (Array.isArray(ai.topic_wise_tips)) {
    for (const it of ai.topic_wise_tips) {
      if (!it || typeof it !== "object") continue;
      const topic = ensureString(it.topic);
      const tipsList = normalizeTipsList(it.tips);
      if (topic && tipsList.length) topicWiseTips.push({ topic, tips: tipsList });
    }
  }

  const defaultTopicBlock = (topicName) => ({
    topic: topicName,
    tips: [
      clampWords(`Practice ${topicName} for 10 minutes daily.`, 14),
      clampWords("Review mistakes and redo similar questions.", 14),
    ],
  });

  if (weakestTopic) {
    const wk = weakestTopic.name;
    if (!topicWiseTips.length) {
      topicWiseTips.push(defaultTopicBlock(wk));
    } else if (!topicWiseTips[0].topic.toLowerCase().includes(wk.toLowerCase())) {
      const existingIdx = topicWiseTips.findIndex((t) =>
        t.topic.toLowerCase().includes(wk.toLowerCase())
      );
      if (existingIdx !== -1) {
        const [item] = topicWiseTips.splice(existingIdx, 1);
        topicWiseTips.unshift(item);
      } else {
        topicWiseTips.unshift(defaultTopicBlock(wk));
      }
    }
  }

  for (const t of weakTopics.slice(0, 3)) {
    if (topicWiseTips.length >= 3) break;
    const joined = topicWiseTips.map((x) => x.topic.toLowerCase()).join(" ");
    if (!joined.includes(t.name.toLowerCase())) {
      const missed = Math.trunc(t.missed || 0);
      const total = Math.trunc(t.total || 0);
      topicWiseTips.push({
        topic: t.name,
        tips: [
          clampWords(`Revise ${t.name} basics before mixed questions.`, 14),
          clampWords(`You missed ${missed} of ${total}; fix repeat patterns.`, 14),
          clampWords(`Do 12 ${t.name} questions in 15 minutes.`, 14),
        ],
      });
    }
  }

  while (topicWiseTips.length < 3) {
    topicWiseTips.push({
      topic: "General",
      tips: [
        "Write an error log after practice.",
        "Redo wrong questions after 24 hours.",
      ],
    });
  }

  // ---- OVERALL FEEDBACK (must mention timing) ----
  let overallFeedback = ensureString(ai.overall_feedback);
  if (!overallFeedback) {
    overallFeedback = "You made good progress and can improve with practice. Keep going!";
  }
  if (
    timeTaken !== null &&
    !overallFeedback.toLowerCase().includes("minute") &&
    !overallFeedback.toLowerCase().includes("time")
  ) {
    overallFeedback = `${overallFeedback} Time taken: ${timeTaken} minutes.`;
  }

  const cta =
    ensureString(ai.cta) || "Pick one weak topic and practice it today.";

  const encouragement =
    ensureString(ai.encouragement) ||
    "You can improve quickly with short daily practice. " +
      "Focus on one topic at a time. " +
      "Review mistakes and try again. " +
      "You are getting better every week.";

  return {
    overall_feedback: overallFeedback,
    coach: coachItems,
    strengths,
    weaknesses,
    growth_areas: growthAreas,
    study_tips: studyTips,
    topic_wise_tips: topicWiseTips.slice(0, 3),
    cta,
    encouragement,
  };
}

// ─────────────────────────────────────────────────────────────
// Placeholder for a session with no attempts  (port of placeholder_feedback)
// ─────────────────────────────────────────────────────────────
function placeholderFeedback(subject, quizName, modelName, yearLevel) {
  return {
    success: true,
    performance_analysis: {
      year_level: yearLevel,
      overall_percentage: 0,
      accuracy: 0,
      grade: "",
      time_taken_minutes: null,
      total_questions: 0,
      seconds_per_question: null,
      pace: "unknown",
      high_performance_count: 0,
      low_performance_count: 0,
      top_topics: [],
      weak_topics: [],
    },
    ai_feedback: {
      overall_feedback:
        "Complete your first quiz to unlock insights. Timing will appear after attempts.",
      coach: [
        {
          insight: "No completed attempt found yet.",
          reason: "We need answers to identify strengths and weaknesses.",
          action: "Try a short practice set for 5–10 minutes.",
        },
      ],
      strengths: [],
      weaknesses: [],
      growth_areas: [],
      study_tips: [
        "Start with a small set of questions",
        "Work in short focused sessions",
        "Review mistakes to learn faster",
      ],
      topic_wise_tips: [
        { topic: "Getting Started", tips: ["Finish one quiz attempt to unlock tips."] },
      ],
      cta: "Take your first quiz to unlock your AI Coach!",
      encouragement: "You are ready to start. One small step today is progress.",
    },
    ai_feedback_meta: {
      model: modelName,
      generated_at: new Date().toISOString(),
      subject,
      quiz_name: quizName,
      year_level: yearLevel,
      source: SOURCE_TAG,
      status: "done",
      status_message: "Ready - awaiting first quiz attempt",
    },
  };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
//
// Same contract as the Python script's main(): takes { doc }, returns the
// result object. Never throws — errors come back as { success:false, error }
// exactly as the Python printed them, so existing caller error handling works
// unchanged.
// ─────────────────────────────────────────────────────────────
async function generateSubjectFeedback(payload) {
  const doc = (payload && payload.doc) || {};
  const quizName = doc.quiz_name || doc.quizName || "";

  const subject = inferSubjectFromQuizName(quizName);

  if (subject === "Writing") {
    return { success: false, error: "Writing assessments are handled separately" };
  }

  const yearLevel = inferYearLevel(doc, quizName);

  const [studentData, err] = normalizeStudentData(doc);
  if (err) return { success: false, error: err };

  if (!(process.env.GEMINI_API_KEY || "").trim()) {
    return { success: false, error: "No AI provider key set (need GEMINI_API_KEY)" };
  }

  if (isNoAttemptSession(studentData.sub_subjects)) {
    return placeholderFeedback(subject, quizName, GEMINI_MODEL, yearLevel);
  }

  const analysis = analyzePerformance(studentData, doc, yearLevel);

  const productInsights = [
    "Use topic names and numbers in every point",
    "Be specific and actionable; give time/count targets",
    "Balance encouragement with honest focus areas",
    "Include timing insights when pace is fast/slow",
    "Keep language appropriate for the year level",
    "For topic_wise_tips: topic + 1-3 bullet tips only",
  ];

  const isReading = subject === "Reading";
  const prompt = isReading
    ? buildReadingPrompt(analysis, yearLevel, productInsights)
    : buildSubjectPrompt(analysis, subject, productInsights);

  let feedback;
  let usedModel;
  let usedProvider;

  try {
    const { parsed, model, provider } = await generateFeedback(prompt);
    usedModel = model;
    usedProvider = provider;
    feedback = isReading
      ? coerceReadingFeedbackSchema(parsed, analysis)
      : coerceAiFeedbackSchema(parsed, analysis);
  } catch (e) {
    return { success: false, error: `AI generation failed: ${e.message}` };
  }

  return {
    success: true,
    performance_analysis: analysis,
    ai_feedback: feedback,
    ai_feedback_meta: {
      model: usedModel,
      provider: usedProvider,
      generated_at: new Date().toISOString(),
      subject,
      quiz_name: quizName,
      year_level: yearLevel,
      source: SOURCE_TAG,
      status: "done",
      status_message: `Feedback generated successfully (${usedProvider})`,
    },
  };
}

module.exports = {
  generateSubjectFeedback,

  // Exported for unit tests and for reuse by the other services still on Python.
  inferSubjectFromQuizName,
  inferYearLevel,
  normalizeStudentData,
  analyzePerformance,
  safeJsonFromText,
  coerceAiFeedbackSchema,
  coerceReadingFeedbackSchema,
  callGemini,
};