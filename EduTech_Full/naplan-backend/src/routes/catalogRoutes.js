const router = require("express").Router();
const Result = require("../models/result");
const Writing = require("../models/writing");

// NOTE:
// FlexiQuiz doesn't explicitly provide "year" or "subject" fields in the webhook.
// So we infer them from quiz_name for dropdowns + filtering.

const YEAR_OPTIONS = ["Year3", "Year5", "Year7", "Year9"];

function inferYear(quizName = "") {
  const s = String(quizName || "");
  // Matches: "Year3", "Year 3", "year-3", etc.
  const m = s.match(/\byear\s*[-_ ]?\s*(3|5|7|9)\b/i);
  if (!m) return null;
  return `Year${m[1]}`;
}

function inferSubject(quizName = "") {
  const s = String(quizName || "").toLowerCase();

  // Order matters (more specific first)
  if (s.includes("calculator")) return "Numeracy_with_calculator";
  if (s.includes("language") || s.includes("convention") || s.includes("lang")) return "Language_convention";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (s.includes("numeracy")) return "Numeracy";

  return null;
}

function matchesFilters(quizName, year, subject) {
  if (!quizName) return false;
  if (year) {
    const y = inferYear(quizName);
    if (y !== year) return false;
  }
  if (subject) {
    const sub = inferSubject(quizName);
    if (sub !== subject) return false;
  }
  return true;
}

async function getAllQuizNames() {
  const [resultNames, writingNames] = await Promise.all([
    Result.distinct("quiz_name"),
    Writing.distinct("quiz_name"),
  ]);
  return Array.from(new Set([...(resultNames || []), ...(writingNames || [])].filter(Boolean)));
}

// GET /api/catalog/years
router.get("/years", async (_req, res) => {
  const names = await getAllQuizNames();
  const years = new Set();
  for (const n of names) {
    const y = inferYear(n);
    if (y) years.add(y);
  }
  // Keep in canonical order.
  const out = YEAR_OPTIONS.filter((y) => years.has(y));
  res.json({ years: out });
});

// GET /api/catalog/subjects?year=Year3
router.get("/subjects", async (req, res) => {
  const year = String(req.query.year || "").trim();
  if (year && !YEAR_OPTIONS.includes(year)) {
    return res.status(400).json({ error: `Invalid year. Use one of: ${YEAR_OPTIONS.join(", ")}` });
  }
  const names = await getAllQuizNames();
  const subjects = new Set();
  for (const n of names) {
    if (!matchesFilters(n, year || null, null)) continue;
    const sub = inferSubject(n);
    if (sub) subjects.add(sub);
  }
  // Stable display order
  const order = [
    "Numeracy",
    "Numeracy_with_calculator",
    "Reading",
    "Writing",
    "Language_convention",
  ];
  const out = order.filter((s) => subjects.has(s));
  res.json({ subjects: out });
});

// GET /api/catalog/tests?year=Year3&subject=Writing
router.get("/tests", async (req, res) => {
  const year = String(req.query.year || "").trim();
  const subject = String(req.query.subject || "").trim();

  if (year && !YEAR_OPTIONS.includes(year)) {
    return res.status(400).json({ error: `Invalid year. Use one of: ${YEAR_OPTIONS.join(", ")}` });
  }

  if (!subject) return res.status(400).json({ error: "subject required" });

  const names = await getAllQuizNames();
  const tests = names
    .filter((n) => matchesFilters(n, year || null, subject))
    .sort((a, b) => a.localeCompare(b));

  res.json({ tests });
});


// GET /api/catalog/quiz-names?email=...&type=writing
// Returns quizzes attended by this email from Writing collection only (when type=writing).
// If no type specified, returns from both collections.
router.get("/quiz-names", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const subject = String(req.query.subject || "").trim();
    const type = String(req.query.type || "").trim();

    if (!email) return res.status(400).json({ error: "email required" });

    const subjectMap = {
      "Numeracy": "Numeracy",
      "Numeracy with calculator": "Numeracy_with_calculator",
      "Numeracy_with_calculator": "Numeracy_with_calculator",
      "Language convention": "Language_convention",
      "Language_convention": "Language_convention",
      "Reading": "Reading",
      "Writing": "Writing",
      "reading": "Reading",
      "writing": "Writing",
    };
    const subjCanon = subject ? (subjectMap[subject] || subject) : "";

    function asTime(d, keys) {
      for (const k of keys) {
        const v = d && d[k];
        const t = Date.parse(v);
        if (!Number.isNaN(t)) return t;
      }
      const t2 = Date.parse(d && d.createdAt);
      return Number.isNaN(t2) ? 0 : t2;
    }

    const items = [];

    if (type === "writing") {
      // Writing only
      const wDocs = await Writing.find({ "user.email_address": email })
        .select("quiz_name response_id submitted_at submittedAt date_created createdAt")
        .lean();

      const wByQuiz = new Map();
      for (const d of (wDocs || [])) {
        const qn = String(d.quiz_name || "").trim();
        if (!qn) continue;
        // For writing, we don't filter by subject - we want all writing quizzes
        if (!wByQuiz.has(qn)) wByQuiz.set(qn, []);
        wByQuiz.get(qn).push(d);
      }
      for (const [qn, docs] of wByQuiz.entries()) {
        docs.sort((a, b) => asTime(b, ["submitted_at","submittedAt","date_created"]) - asTime(a, ["submitted_at","submittedAt","date_created"]));
        const latest = docs[0];
        const rid = String(latest.response_id || "").trim() || null;
        items.push({ quiz_name: qn, kind: "writing", response_id: rid });
      }
    } else {
      // Both collections (original behavior)
      // Results
      const rDocs = await Result.find({ "user.email_address": email })
        .select("quiz_name response_id responseId date_submitted submittedAt createdAt")
        .lean();

      const rByQuiz = new Map();
      for (const d of (rDocs || [])) {
        const qn = String(d.quiz_name || "").trim();
        if (!qn) continue;
        if (subjCanon && inferSubject(qn) !== subjCanon) continue;
        if (!rByQuiz.has(qn)) rByQuiz.set(qn, []);
        rByQuiz.get(qn).push(d);
      }
      for (const [qn, docs] of rByQuiz.entries()) {
        docs.sort((a, b) => asTime(b, ["date_submitted","submittedAt"]) - asTime(a, ["date_submitted","submittedAt"]));
        const latest = docs[0];
        const rid = String(latest.response_id || latest.responseId || "").trim() || null;
        items.push({ quiz_name: qn, kind: "result", response_id: rid });
      }

      // Writing
      const wDocs = await Writing.find({ "user.email_address": email })
        .select("quiz_name response_id submitted_at submittedAt date_created createdAt")
        .lean();

      const wByQuiz = new Map();
      for (const d of (wDocs || [])) {
        const qn = String(d.quiz_name || "").trim();
        if (!qn) continue;
        if (subjCanon && inferSubject(qn) !== subjCanon) continue;
        if (!wByQuiz.has(qn)) wByQuiz.set(qn, []);
        wByQuiz.get(qn).push(d);
      }
      for (const [qn, docs] of wByQuiz.entries()) {
        docs.sort((a, b) => asTime(b, ["submitted_at","submittedAt","date_created"]) - asTime(a, ["submitted_at","submittedAt","date_created"]));
        const latest = docs[0];
        const rid = String(latest.response_id || "").trim() || null;
        items.push({ quiz_name: qn, kind: "writing", response_id: rid });
      }
    }

    items.sort((a, b) => String(a.quiz_name).localeCompare(String(b.quiz_name)));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : "Failed to load quiz names" });
  }
});



// GET /api/catalog/email-exists?email=...
// Checks if any record exists for the email in either Results or Writing collections.
router.get("/email-exists", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });

    const [rCount, wCount] = await Promise.all([
      Result.countDocuments({ "user.email_address": email }),
      Writing.countDocuments({ "user.email_address": email }),
    ]);

    res.json({ email, exists: (rCount + wCount) > 0, results: rCount, writing: wCount });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : "Failed to check email" });
  }
});


module.exports = router;
