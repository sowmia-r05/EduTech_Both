/**
 * scripts/uploadQuiz.js  (v2 — CORRECTED)
 *
 * Uploads one or more quiz workbooks straight to the API from the command line.
 *
 * WHY THIS EXISTS
 * The admin UI's QuizUploader component reads its auth token from localStorage,
 * which is empty since the move to httpOnly cookies. Until that fix is
 * deployed, the browser path is blocked. This script does the same job from
 * Node: it logs in, captures the admin_token cookie, parses the workbooks, and
 * POSTs to /api/admin/quizzes/upload. Nothing in the browser is involved.
 *
 * It is also useful permanently — bulk-importing twenty workbooks from one
 * invocation beats twenty rounds of click-and-wait.
 *
 * CHANGES FROM v1
 *   ✅ FIX 1: no longer skips row 1 of "Quiz Info" — that dropped quiz_name in
 *             workbooks whose data starts on row 1, failing validation with a
 *             misleading "quiz_name is required".
 *   ✅ FIX 2: subject / difficulty / tier are canonicalised to the exact casing
 *             the backend enums expect, instead of passed through raw.
 *   ✅ FIX 3: matching questions are now rejected with a clear message rather
 *             than silently uploaded with their option_id/match pairs dropped.
 *   ✅ FIX 4: accepts MULTIPLE file paths and logs in ONCE. The login route is
 *             rate limited to 5 attempts per 15 minutes; a shell loop calling
 *             this script per file would lock you out on the sixth workbook.
 *   ✅ Password masking rewritten using a muted Writable stream — the previous
 *             ANSI-escape approach relied on rl.line and misbehaved in
 *             PowerShell.
 *
 * USAGE
 *   cd naplan-backend
 *   node scripts/uploadQuiz.js "C:\path\to\Year_5_Reading_Set_2.xlsx"
 *   node scripts/uploadQuiz.js "C:\path\to\*.xlsx" "C:\other\Set_3.xlsx"
 *
 * It will prompt for your admin email and password. Nothing is stored.
 *
 * Requires Node 18+ (built-in fetch) and exceljs.
 */

const path = require("path");
const readline = require("readline");
const { Writable } = require("stream");
const ExcelJS = require("exceljs");

const API = process.env.UPLOAD_API_BASE || "https://naplanapi.kaisolutions.ai";

const VALID_TYPES = [
  "radio_button", "picture_choice", "free_text",
  "checkbox", "writing", "short_answer", "matching",
];

// Types that carry no options.
const OPEN_TYPES = new Set(["free_text", "short_answer", "writing"]);

/**
 * FIX 2: the backend subject enum is case-sensitive and uses a specific mix
 * ("Language conventions" — lowercase c). Excel authors type whatever reads
 * naturally. Canonicalise rather than reject.
 *
 * NOTE: "Numeracy" maps to "Maths" because that is the enum value the platform
 * stores. If your backend enum has since gained a literal "Numeracy" value,
 * delete that line — otherwise your numeracy sets land under Maths.
 */
const SUBJECT_CANON = {
  "maths": "Maths",
  "math": "Maths",
  "mathematics": "Maths",
  "numeracy": "Maths",
  "reading": "Reading",
  "writing": "Writing",
  "language conventions": "Language conventions",
  "language convention": "Language conventions",
};

const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);

// ── prompt helpers ───────────────────────────────────────────
/**
 * FIX: masking via a muted output stream. The prompt itself is written before
 * muting, so the question shows but the typed password does not echo at all.
 */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    let muted = false;

    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });

    rl.question(question, (answer) => {
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(String(answer || "").trim());
    });

    muted = hidden;
  });
}

// ── workbook parsing (mirrors parseCustomTemplate in QuizUploader.jsx) ──
function cellText(row, headerIndex, name) {
  const idx = headerIndex[name];
  if (!idx) return "";
  const v = row.getCell(idx).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return "";
  }
  return String(v);
}

async function parseWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const infoSheet = wb.getWorksheet("Quiz Info");
  const qSheet = wb.getWorksheet("Questions");
  if (!infoSheet) throw new Error(`No "Quiz Info" sheet found in ${path.basename(filePath)}`);
  if (!qSheet) throw new Error(`No "Questions" sheet found in ${path.basename(filePath)}`);

  // Quiz Info: two columns, Field | Value
  //
  // FIX 1: do NOT skip row 1. Your generated workbooks put the first field on
  // row 1 with no header, so skipping it silently discarded quiz_name. If a
  // workbook DOES carry a "Field | Value" header row, it parses harmlessly into
  // meta.Field = "Value", which nothing reads.
  const meta = {};
  infoSheet.eachRow((row) => {
    const field = String(row.getCell(1).value || "").trim();
    const value = row.getCell(2).value;
    if (field && value !== null && value !== undefined && value !== "") {
      meta[field] = String(value).trim();
    }
  });

  // FIX 2: canonicalise before validating.
  const rawSubject = (meta.subject || "").trim();
  const subject = SUBJECT_CANON[rawSubject.toLowerCase()] || rawSubject;

  const rawDifficulty = (meta.difficulty || "").trim().toLowerCase();

  const quiz = {
    quiz_name:          meta.quiz_name || "",
    year_level:         parseInt(meta.year_level) || 0,
    subject,
    tier:               (meta.tier || "A").trim().toUpperCase(),
    time_limit_minutes: meta.time_limit_minutes ? parseInt(meta.time_limit_minutes) : null,
    difficulty:         rawDifficulty || null,
    set_number:         parseInt(meta.set_number) || 1,
    is_trial:           String(meta.is_trial || "").toLowerCase() === "true",
    voice_url:          meta.voice_url || null,
    video_url:          meta.video_url || null,
  };

  const errors = [];
  if (!quiz.quiz_name) {
    errors.push(
      'quiz_name is required — check the "Quiz Info" sheet has a row with ' +
      '"quiz_name" in column A and the name in column B'
    );
  }
  if (![3, 5, 7, 9].includes(quiz.year_level)) {
    errors.push(`year_level must be 3, 5, 7 or 9 (got "${meta.year_level || ""}")`);
  }
  if (!["Maths", "Reading", "Writing", "Language conventions"].includes(quiz.subject)) {
    errors.push(
      `subject must be Maths, Reading, Writing or Language conventions ` +
      `(got "${rawSubject}")`
    );
  }
  if (quiz.difficulty && !VALID_DIFFICULTY.has(quiz.difficulty)) {
    errors.push(`difficulty must be easy, medium or hard (got "${meta.difficulty}")`);
  }

  // Questions: map header names to column numbers
  const headerIndex = {};
  qSheet.getRow(1).eachCell((cell, col) => {
    const name = String(cell.value || "").trim().toLowerCase();
    if (name) headerIndex[name] = col;
  });

  if (!headerIndex["question_text"]) {
    errors.push('The "Questions" sheet has no "question_text" header in row 1');
  }

  const questions = [];
  qSheet.eachRow((row, n) => {
    if (n === 1) return; // this sheet genuinely does have a header row

    const question_text = cellText(row, headerIndex, "question_text").trim();
    if (!question_text) return;

    const type = (cellText(row, headerIndex, "type") || "radio_button").trim().toLowerCase();
    if (!VALID_TYPES.includes(type)) {
      errors.push(`Row ${n}: invalid type "${type}"`);
      return;
    }

    // FIX 3: matching questions encode option_id + match pairs that this parser
    // has no column mapping for. v1 would have uploaded them as plain labelled
    // options with every match silently dropped — a corrupt quiz that looks
    // fine in the dashboard. Refuse instead.
    if (type === "matching") {
      errors.push(
        `Row ${n}: matching questions carry option_id/match pairs this script ` +
        `does not parse — upload that workbook through the admin UI instead`
      );
      return;
    }

    const correct_answer = cellText(row, headerIndex, "correct_answer").trim().toUpperCase();
    const correctLabels = correct_answer.split(",").map((s) => s.trim()).filter(Boolean);

    const options = [];
    for (const letter of ["a", "b", "c", "d", "e"]) {
      const text = cellText(row, headerIndex, `option_${letter}`).trim();
      const image = cellText(row, headerIndex, `option_${letter}_image`).trim();
      if (text || image) {
        const label = letter.toUpperCase();
        options.push({
          label,
          text,
          image_url: image || null,
          correct: correctLabels.includes(label),
        });
      }
    }

    if (!OPEN_TYPES.has(type)) {
      if (options.length < 2) { errors.push(`Row ${n}: needs at least 2 options`); return; }
      if (!correct_answer) { errors.push(`Row ${n}: missing correct_answer`); return; }
      const labels = options.map((o) => o.label);
      for (const a of correctLabels) {
        if (!labels.includes(a)) {
          errors.push(`Row ${n}: correct_answer "${a}" does not match options (${labels.join(",")})`);
        }
      }
      if (type !== "checkbox" && correctLabels.length > 1) {
        errors.push(`Row ${n}: ${type} can only have one correct answer`);
      }
    }

    questions.push({
      question_text,
      type,
      display_style: cellText(row, headerIndex, "display_style").trim().toLowerCase() || null,
      options,
      correct_answer,
      points: parseInt(cellText(row, headerIndex, "points")) || 1,
      category: cellText(row, headerIndex, "category").trim(),
      image_url: cellText(row, headerIndex, "image_url").trim(),
      explanation: cellText(row, headerIndex, "explanation").trim(),
      voice_url: cellText(row, headerIndex, "voice_url").trim(),
    });
  });

  if (questions.length === 0) errors.push("No questions found in the Questions sheet");

  return { quiz, questions, errors };
}

// ── main ─────────────────────────────────────────────────────
(async () => {
  // FIX 4: accept every path on the command line, not just argv[2].
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    console.error("\nUsage: node scripts/uploadQuiz.js \"C:\\path\\to\\workbook.xlsx\" [more.xlsx ...]\n");
    process.exit(1);
  }

  console.log(`\nAPI:   ${API}`);
  console.log(`Files: ${filePaths.length}\n`);

  // 1. Parse everything FIRST — no point logging in if any workbook is bad,
  //    and no point uploading half a batch.
  const batch = [];
  let anyErrors = false;

  for (const filePath of filePaths) {
    const name = path.basename(filePath);
    let parsed;
    try {
      parsed = await parseWorkbook(filePath);
    } catch (err) {
      console.error(`  ✗ ${name} — could not read: ${err.message}`);
      anyErrors = true;
      continue;
    }

    const { quiz, questions, errors } = parsed;

    if (errors.length) {
      console.error(`  ✗ ${name} — ${errors.length} validation error(s):`);
      for (const e of errors) console.error(`      - ${e}`);
      anyErrors = true;
      continue;
    }

    console.log(`  ✓ ${name}`);
    console.log(`      ${quiz.quiz_name}`);
    console.log(`      Year ${quiz.year_level} · ${quiz.subject} · Set ${quiz.set_number} · ${questions.length} questions`);
    batch.push({ name, quiz, questions });
  }

  if (anyErrors) {
    console.error("\nFix the workbook(s) above and run again. Nothing was uploaded.\n");
    process.exit(1);
  }

  console.log("");

  // 2. Log in ONCE and capture the cookie.
  const email = await ask("Admin email: ");
  const password = await ask("Password: ", { hidden: true });

  console.log("\nLogging in...");
  const loginRes = await fetch(`${API}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}): ${loginBody.error || "unknown error"}\n`);
    if (loginRes.status === 429) {
      console.error("Rate limited — 5 attempts per 15 minutes. Wait, then retry.\n");
    }
    process.exit(1);
  }

  // Node's fetch exposes multiple Set-Cookie headers via getSetCookie()
  const rawCookies = typeof loginRes.headers.getSetCookie === "function"
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get("set-cookie")].filter(Boolean);

  const cookieHeader = rawCookies
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("admin_token="))
    .join("; ");

  if (!cookieHeader) {
    console.error("Login succeeded but no admin_token cookie was returned. Cannot continue.\n");
    process.exit(1);
  }

  const role = loginBody.admin?.role;
  console.log(`Logged in as ${loginBody.admin?.name || email} (${role})\n`);

  // 3. Upload each workbook on the one session.
  const results = [];

  for (const item of batch) {
    process.stdout.write(`Uploading ${item.name} (${item.questions.length} questions)... `);

    const upRes = await fetch(`${API}/api/admin/quizzes/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ quiz: item.quiz, questions: item.questions }),
    });

    const upBody = await upRes.json().catch(() => ({}));

    if (!upRes.ok) {
      console.log("FAILED");
      console.error(`    ${upRes.status}: ${upBody.error || "unknown error"}`);
      results.push({ name: item.name, ok: false });
      continue;
    }

    console.log("ok");
    results.push({
      name: item.name,
      ok: true,
      quiz_id: upBody.quiz_id,
      quiz_name: upBody.quiz_name,
      question_count: upBody.question_count,
    });
  }

  // 4. Summary
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("\n=======================================");
  console.log(` ${ok.length} uploaded, ${failed.length} failed`);
  console.log("=======================================");
  for (const r of ok) {
    console.log(`  ${r.quiz_name}`);
    console.log(`    id: ${r.quiz_id}   questions: ${r.question_count}`);
  }
  for (const r of failed) {
    console.log(`  FAILED: ${r.name}`);
  }
  console.log("\nRefresh the admin dashboard to see them.\n");

  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(`\nUnexpected error: ${err.message}\n`);
  process.exit(1);
});