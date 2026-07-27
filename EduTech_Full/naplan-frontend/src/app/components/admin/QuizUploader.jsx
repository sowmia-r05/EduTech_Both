/**
 * scripts/uploadQuiz.js
 *
 * Uploads a quiz workbook straight to the API from the command line.
 *
 * WHY THIS EXISTS
 * The admin UI's QuizUploader component reads its auth token from
 * localStorage, which is empty since the move to httpOnly cookies. Until that
 * fix is deployed, the browser path is blocked. This script does the same job
 * from Node: it logs in, captures the admin_token cookie, parses the workbook,
 * and POSTs to /api/admin/quizzes/upload. Nothing in the browser is involved.
 *
 * It is also useful permanently — bulk-importing twenty workbooks from a shell
 * loop beats twenty rounds of click-and-wait.
 *
 * USAGE
 *   cd naplan-backend
 *   node scripts/uploadQuiz.js "C:\path\to\Year_5_Reading_Set_2.xlsx"
 *
 * It will prompt for your admin email and password. Nothing is stored.
 *
 * Requires Node 18+ (built-in fetch). Uses exceljs, already a dependency.
 */

const path = require("path");
const readline = require("readline");
const ExcelJS = require("exceljs");

const API = process.env.UPLOAD_API_BASE || "https://naplanapi.kaisolutions.ai";

const VALID_TYPES = [
  "radio_button", "picture_choice", "free_text",
  "checkbox", "writing", "short_answer", "matching",
];

// ── prompt helpers ───────────────────────────────────────────
function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
      return;
    }
    // Suppress echo for password entry
    const onData = (char) => {
      if (["\n", "\r", "\u0004"].includes(char.toString())) {
        process.stdin.removeListener("data", onData);
      } else {
        process.stdout.write("\x1B[2K\x1B[200D" + question + "*".repeat(rl.line.length));
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a.trim());
    });
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
  const meta = {};
  infoSheet.eachRow((row, n) => {
    if (n === 1) return;
    const field = String(row.getCell(1).value || "").trim();
    const value = row.getCell(2).value;
    if (field && value !== null && value !== undefined && value !== "") {
      meta[field] = String(value).trim();
    }
  });

  const quiz = {
    quiz_name:          meta.quiz_name || "",
    year_level:         parseInt(meta.year_level) || 0,
    subject:            meta.subject || "",
    tier:               meta.tier || "A",
    time_limit_minutes: meta.time_limit_minutes ? parseInt(meta.time_limit_minutes) : null,
    difficulty:         meta.difficulty || null,
    set_number:         parseInt(meta.set_number) || 1,
    is_trial:           String(meta.is_trial || "").toLowerCase() === "true",
    voice_url:          meta.voice_url || null,
    video_url:          meta.video_url || null,
  };

  const errors = [];
  if (!quiz.quiz_name) errors.push("quiz_name is required");
  if (![3, 5, 7, 9].includes(quiz.year_level)) errors.push("year_level must be 3, 5, 7 or 9");
  if (!["Maths", "Reading", "Writing", "Language conventions"].includes(quiz.subject)) {
    errors.push(`subject must be Maths, Reading, Writing or Language conventions (got "${quiz.subject}")`);
  }

  // Questions: map header names to column numbers
  const headerIndex = {};
  qSheet.getRow(1).eachCell((cell, col) => {
    const name = String(cell.value || "").trim().toLowerCase();
    if (name) headerIndex[name] = col;
  });

  const questions = [];
  qSheet.eachRow((row, n) => {
    if (n === 1) return;

    const question_text = cellText(row, headerIndex, "question_text").trim();
    if (!question_text) return;

    const type = (cellText(row, headerIndex, "type") || "radio_button").trim().toLowerCase();
    if (!VALID_TYPES.includes(type)) {
      errors.push(`Row ${n}: invalid type "${type}"`);
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

    if (type !== "free_text" && type !== "short_answer" && type !== "writing") {
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
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("\nUsage: node scripts/uploadQuiz.js \"C:\\path\\to\\workbook.xlsx\"\n");
    process.exit(1);
  }

  console.log(`\nAPI: ${API}`);
  console.log(`File: ${filePath}\n`);

  // 1. Parse first — no point logging in if the workbook is bad
  let parsed;
  try {
    parsed = await parseWorkbook(filePath);
  } catch (err) {
    console.error(`Could not read the workbook: ${err.message}\n`);
    process.exit(1);
  }

  const { quiz, questions, errors } = parsed;

  console.log(`Quiz:      ${quiz.quiz_name}`);
  console.log(`Year:      ${quiz.year_level}   Subject: ${quiz.subject}   Set: ${quiz.set_number}`);
  console.log(`Questions: ${questions.length}\n`);

  if (errors.length) {
    console.error(`${errors.length} validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("\nFix the workbook and try again.\n");
    process.exit(1);
  }

  // 2. Log in and capture the cookie
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

  console.log(`Logged in as ${loginBody.admin?.name || email} (${loginBody.admin?.role})\n`);

  // 3. Upload
  console.log(`Uploading ${questions.length} questions...`);
  const upRes = await fetch(`${API}/api/admin/quizzes/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ quiz, questions }),
  });

  const upBody = await upRes.json().catch(() => ({}));

  if (!upRes.ok) {
    console.error(`\nUpload failed (${upRes.status}): ${upBody.error || "unknown error"}\n`);
    process.exit(1);
  }

  console.log("\n=======================================");
  console.log(" Upload successful");
  console.log("=======================================");
  console.log(`  Quiz name: ${upBody.quiz_name}`);
  console.log(`  Quiz ID:   ${upBody.quiz_id}`);
  console.log(`  Questions: ${upBody.question_count}`);
  console.log("\nRefresh the admin dashboard to see it.\n");
})().catch((err) => {
  console.error(`\nUnexpected error: ${err.message}\n`);
  process.exit(1);
});