/**
 * QuizUploader.jsx  (v3 — SIMPLE FORMAT SUPPORT)
 *
 * FIXES IN THIS VERSION:
 *   ✅ FIX 1: parseFlexiQuiz now sets correct: true/false on each option
 *   ✅ FIX 2: handleSubmit maps correct field from correct_answer labels as safety net
 *   ✅ NEW:   Supports "simple" questions-only format (single Questions sheet,
 *             columns: question_text, type, option_a…option_d, correct_answer,
 *             points, category, image_url, explanation — no Quiz Info sheet needed)
 *
 * Place in: src/app/components/admin/QuizUploader.jsx
 */

import { useState, useRef } from "react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_BASE_URL || "";

function getAuthToken() {
  return (
    localStorage.getItem("admin_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("admin_token") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("authToken") ||
    null
  );
}

function adminFetch(url, opts = {}) {
  const token = getAuthToken();
  if (!token) console.error("❌ No auth token found!");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<img[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageUrl(html) {
  if (!html) return "";
  const match = String(html).match(/src=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

// ─────────────────────────────────────────────────────────────
// FORMAT DETECTION
// Priority: custom (Questions + Quiz Info) → simple (Questions only)
//           → flexiquiz → unknown
// ─────────────────────────────────────────────────────────────
function detectFormat(workbook) {
  const names = workbook.SheetNames;

  // 1. Full custom template: requires BOTH sheets
  if (names.includes("Questions") && names.includes("Quiz Info")) return "custom";

  // 2. Simple questions-only sheet (no Quiz Info)
  if (names.includes("Questions")) {
    const sheet = workbook.Sheets["Questions"];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const header = (rows[0] || []).map((h) => String(h || "").toLowerCase());
    if (header.includes("question_text") && header.includes("option_a")) return "simple";
  }

  // 3. FlexiQuiz export
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rows[1] || rows[0] || [];
    const headerStr = headerRow.map((h) => String(h || "").toLowerCase()).join("|");
    if (headerStr.includes("question text") && headerStr.includes("option 1 text")) {
      return "flexiquiz";
    }
  }

  return "unknown";
}

/* ═══════════════════════════════════════════════════════
   Parse FlexiQuiz export format
   ✅ FIX 1: Each option now has correct: true/false
   ═══════════════════════════════════════════════════════ */
function parseFlexiQuiz(workbook, fileName) {
  const errors = [];

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowStr = (rows[i] || []).map((c) => String(c || "")).join("|").toLowerCase();
    if (rowStr.includes("question text") && rowStr.includes("option 1 text")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    errors.push("Could not find FlexiQuiz header row.");
    return { quizMeta: null, questions: [], errors };
  }

  const headers = rows[headerRowIdx].map((h) => String(h || "").trim());

  const colIdx = {};
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().replace(/\n/g, " ");
    if (lower.startsWith("question text")) colIdx.question_text = i;
    if (lower.startsWith("question type")) colIdx.question_type = i;
    if (lower.startsWith("question points")) colIdx.question_points = i;
    if (lower.startsWith("question feedback")) colIdx.question_feedback = i;
    if (lower.startsWith("question categories")) colIdx.categories = i;
    for (let n = 1; n <= 10; n++) {
      if (lower === `option ${n} text`) colIdx[`opt${n}_text`] = i;
      if (lower === `option ${n} correct` || lower === `option ${n}\ncorrect`) colIdx[`opt${n}_correct`] = i;
    }
  });

  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  const yearMatch = baseName.match(/year\s*(\d)/i);
  const yearLevel = yearMatch ? parseInt(yearMatch[1]) : 0;

  let subject = "";
  const lowerName = baseName.toLowerCase();
  if (lowerName.includes("numeracy") || lowerName.includes("math")) subject = "Maths";
  else if (lowerName.includes("reading")) subject = "Reading";
  else if (lowerName.includes("writing")) subject = "Writing";
  else if (lowerName.includes("language") || lowerName.includes("convention") || lowerName.includes("grammar")) subject = "Language conventions";

  const quizMeta = {
    quiz_name: baseName.replace(/\b\w/g, (c) => c.toUpperCase()),
    year_level: yearLevel,
    subject: subject,
    tier: "A",
    time_limit_minutes: null,
    difficulty: null,
    set_number: 1,
    is_trial: false,
    _needsReview: true,
    voice_url: null,
    video_url: null,
  };

  const questions = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawText = row[colIdx.question_text];
    if (!rawText || !String(rawText).trim()) continue;

    const rawStr = String(rawText).trim();
    if (/^v=\d/.test(rawStr) || rawStr.length < 5) continue;

    const questionText = stripHtml(rawStr);
    const imageUrl = extractImageUrl(rawStr);
    const rawType = String(row[colIdx.question_type] || "").toLowerCase();
    const feedback = stripHtml(String(row[colIdx.question_feedback] || ""));
    const categories = String(row[colIdx.categories] || "").trim();

    if (!rawType) continue;

    let type = "radio_button";
    if (rawType.includes("multiple") || rawType.includes("checkbox")) type = "checkbox";
    else if (rawType.includes("free") || rawType.includes("essay") || rawType.includes("text")) type = "free_text";
    else if (rawType.includes("picture") || rawType.includes("image")) type = "picture_choice";

    const options = [];
    let correctAnswer = [];
    let hasImageOptions = false;

    for (let n = 1; n <= 10; n++) {
      const optRaw = row[colIdx[`opt${n}_text`]];
      if (optRaw === undefined || optRaw === null) continue;

      const optStr = String(optRaw).trim();
      if (!optStr) continue;

      const cleanText = stripHtml(optStr);
      const optImage = extractImageUrl(optStr);

      if (!cleanText && !optImage) continue;
      if (optImage && !cleanText) hasImageOptions = true;

      const label = String.fromCharCode(64 + options.length + 1);
      const isCorrectRaw = String(row[colIdx[`opt${n}_correct`]] || "").toLowerCase();

      // ✅ FIX 1: Determine correct boolean BEFORE pushing to options
      const isCorrectBool = isCorrectRaw === "yes" || isCorrectRaw === "true" || isCorrectRaw === "1";

      options.push({
        label,
        text: cleanText || "[Image]",
        image_url: optImage || null,
        correct: isCorrectBool,
      });

      if (isCorrectBool) {
        correctAnswer.push(label);
      }
    }

    if (hasImageOptions && type === "radio_button") type = "picture_choice";

    const q = {
      _rowNum: r + 1,
      question_text: questionText,
      type,
      options,
      correct_answer: correctAnswer.join(","),
      points: parseInt(row[colIdx.question_points]) || 1,
      category: categories,
      image_url: imageUrl,
      explanation: feedback,
      voice_url:   "",
    };

    if (type !== "free_text") {
      if (options.length < 2) { errors.push(`Row ${r + 1}: MCQ needs at least 2 options`); continue; }
      if (correctAnswer.length === 0) { errors.push(`Row ${r + 1}: No correct answer marked for "${questionText.substring(0, 40)}..."`); continue; }
    }

    questions.push(q);
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push("No questions found in the file.");
  }

  return { quizMeta, questions, errors };
}

/* ═══════════════════════════════════════════════════════
   Parse our custom template format
   (requires both "Questions" and "Quiz Info" sheets)
   ═══════════════════════════════════════════════════════ */
function parseCustomTemplate(workbook) {
  const errors = [];

  const infoSheet = workbook.Sheets["Quiz Info"];
  if (!infoSheet) {
    errors.push("Missing 'Quiz Info' sheet. Please use the provided template.");
    return { quizMeta: null, questions: [], errors };
  }

  const infoRows = XLSX.utils.sheet_to_json(infoSheet, { header: 1 });
  const meta = {};
  for (let i = 1; i < infoRows.length; i++) {
    const [field, value] = infoRows[i] || [];
    if (field && value !== undefined && value !== "") {
      meta[String(field).trim()] = String(value).trim();
    }
  }

  const quizMeta = {
    quiz_name: meta.quiz_name || "",
    year_level: parseInt(meta.year_level) || 0,
    subject: meta.subject || "",
    tier: meta.tier || "A",
    time_limit_minutes: meta.time_limit_minutes ? parseInt(meta.time_limit_minutes) : null,
    difficulty: meta.difficulty || null,
    set_number: parseInt(meta.set_number) || 1,
    is_trial: String(meta.is_trial || "").toLowerCase().trim() === "true",
    voice_url: meta.voice_url || null,
    video_url: meta.video_url || null,
  };

  if (!quizMeta.quiz_name) errors.push("Quiz name is required (Quiz Info sheet)");
  if (![3, 5, 7, 9].includes(quizMeta.year_level)) errors.push("Year level must be 3, 5, 7, or 9");
  if (!["Maths", "Reading", "Writing", "Language conventions"].includes(quizMeta.subject)) {
    errors.push("Subject must be Maths, Reading, Writing, or Language conventions");
  }

  const qSheet = workbook.Sheets["Questions"];
  if (!qSheet) {
    errors.push("Missing 'Questions' sheet. Please use the provided template.");
    return { quizMeta, questions: [], errors };
  }

  const qRows = XLSX.utils.sheet_to_json(qSheet, { defval: "" });
  const dataRows = qRows.filter(
    (row) => row.question_text && !String(row.question_text).startsWith("The question text")
  );

  const validTypes = ["radio_button", "picture_choice", "free_text", "checkbox", "writing", "short_answer", "matching"];
  const questions = [];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 3;
    const q = {
      _rowNum: rowNum,
      question_text: String(row.question_text || "").trim(),
      type: String(row.type || "").trim().toLowerCase(),
      options: [],
      correct_answer: String(row.correct_answer || "").trim(),
      points: parseInt(row.points) || 1,
      category: String(row.category || "").trim(),
      image_url: String(row.image_url || "").trim(),
      explanation: String(row.explanation || "").trim(),
      voice_url:  String(row.voice_url      || "").trim(),
    };

    if (!q.question_text) { errors.push(`Row ${rowNum}: Missing question text`); return; }
    if (!validTypes.includes(q.type)) {
      errors.push(`Row ${rowNum}: Invalid type "${q.type}". Must be: ${validTypes.join(", ")}`);
      return;
    }

    const correctLabels = q.correct_answer.split(",").map((s) => s.trim());
    ["a", "b", "c", "d", "e"].forEach((letter) => {
      const text = String(row[`option_${letter}`] || "").trim();
      const image = String(row[`option_${letter}_image`] || "").trim();
      if (text || image) {
        const label = letter.toUpperCase();
        q.options.push({
          label,
          text,
          image_url: image || null,
          correct: correctLabels.includes(label),
        });
      }
    });

     if (q.type === "free_text") {
      q.correct_answer = "";
    } else if (q.type === "short_answer") {
      // short_answer has no options — correct_answer is the actual text
      q.options = [];
    } else {
      if (q.options.length < 2) { errors.push(`Row ${rowNum}: MCQ needs at least 2 options`); return; }
      if (!q.correct_answer) { errors.push(`Row ${rowNum}: Missing correct_answer`); return; }
      const validLabels = q.options.map((o) => o.label);
      const answerLetters = q.correct_answer.split(",").map((s) => s.trim());
      for (const a of answerLetters) {
        if (!validLabels.includes(a)) {
          errors.push(`Row ${rowNum}: Correct answer "${a}" doesn't match options (${validLabels.join(",")})`);
        }
      }
      if (q.type !== "checkbox" && answerLetters.length > 1) {
        errors.push(`Row ${rowNum}: radio_button can only have one correct answer`);
      }
    }

    questions.push(q);
  });

  if (questions.length === 0 && errors.length === 0) {
    errors.push("No questions found in Questions sheet.");
  }

  return { quizMeta, questions, errors };
}

/* ═══════════════════════════════════════════════════════
   ✅ NEW: Parse "simple" questions-only format
   Single "Questions" sheet, no "Quiz Info" sheet.
   Expected columns:
     question_text | type | option_a | option_b | option_c | option_d
     correct_answer | points | category | image_url | explanation
   Admin must confirm quiz name / year / subject before uploading.
   ═══════════════════════════════════════════════════════ */
function parseSimpleTemplate(workbook, fileName) {
  const errors = [];

  // Derive quiz name from filename — strip date suffix & extension
  const guessedName = fileName
    .replace(/\.(xlsx?|xls)$/i, "")
    .replace(/_\d{8}_\d+$/, "")   // strip _20260316_010630
    .replace(/_/g, " ")
    .trim();

  // Infer year level from filename (e.g. "Year3", "year_5")
  const yearMatch = fileName.match(/year\s*([3579])/i);
  const guessedYear = yearMatch ? parseInt(yearMatch[1]) : 0;

  const quizMeta = {
    quiz_name:          guessedName,
    year_level:         guessedYear,
    subject:            "",     // admin must select
    tier:               "A",
    time_limit_minutes: null,
    difficulty:         null,
    set_number:         1,
    is_trial:           false,
    voice_url:          null,
    video_url:          null,
    _needsReview:       true,   // triggers the edit-before-upload UI
  };

  const qSheet = workbook.Sheets["Questions"];
  const qRows  = XLSX.utils.sheet_to_json(qSheet, { defval: "" });

  // Skip the instruction/header example row
  const dataRows = qRows.filter(
    (row) => row.question_text && !String(row.question_text).startsWith("The question text")
  );

 const validTypes = ["radio_button", "picture_choice", "free_text", "checkbox", "writing", "short_answer", "matching"];
  const questions  = [];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // row 1 = header, row 2 = first data row
    const q = {
      _rowNum:        rowNum,
      question_text:  String(row.question_text  || "").trim(),
      type:           String(row.type           || "radio_button").trim().toLowerCase(),
      options:        [],
      correct_answer: String(row.correct_answer || "").trim(),
      points:         parseInt(row.points)      || 1,
      category:       String(row.category       || "").trim(),
      image_url:      String(row.image_url      || "").trim(),
      explanation:    String(row.explanation    || "").trim(),
      voice_url:      String(row.voice_url      || "").trim(),
    };

    if (!q.question_text) { errors.push(`Row ${rowNum}: Missing question text`); return; }
    if (!validTypes.includes(q.type)) {
      errors.push(`Row ${rowNum}: Invalid type "${q.type}". Must be: ${validTypes.join(", ")}`);
      return;
    }

    const correctLabels = q.correct_answer.split(",").map((s) => s.trim());
    ["a", "b", "c", "d", "e"].forEach((letter) => {
      const text  = String(row[`option_${letter}`]       || "").trim();
      const image = String(row[`option_${letter}_image`] || "").trim();
      if (text || image) {
        const label = letter.toUpperCase();
        q.options.push({
          label,
          text,
          image_url: image || null,
          correct:   correctLabels.includes(label),
        });
      }
    });

    if (q.type === "free_text") {
      q.correct_answer = "";
    } else if (q.type === "short_answer") {
      q.options = [];  // no options needed
    } else {
      if (q.options.length < 2) { errors.push(`Row ${rowNum}: MCQ needs at least 2 options`); return; }
      if (!q.correct_answer)    { errors.push(`Row ${rowNum}: Missing correct_answer`); return; }
      const validLabels   = q.options.map((o) => o.label);
      const answerLetters = q.correct_answer.split(",").map((s) => s.trim());
      for (const a of answerLetters) {
        if (!validLabels.includes(a)) {
          errors.push(`Row ${rowNum}: Correct answer "${a}" doesn't match options (${validLabels.join(",")})`);
        }
      }
      if (q.type !== "checkbox" && answerLetters.length > 1) {
        errors.push(`Row ${rowNum}: radio_button can only have one correct answer`);
      }
    }

    questions.push(q);
  });

  if (questions.length === 0 && errors.length === 0) {
    errors.push("No questions found in Questions sheet.");
  }

  return { quizMeta, questions, errors };
}

/* ═══════════════════════════════════════════════════════
   Main dispatcher
   ═══════════════════════════════════════════════════════ */
function parseExcel(workbook, fileName) {
  const format = detectFormat(workbook);
  if (format === "custom")    return { ...parseCustomTemplate(workbook),           format: "custom"    };
  if (format === "simple")    return { ...parseSimpleTemplate(workbook, fileName),  format: "simple"    }; // ✅ NEW
  if (format === "flexiquiz") return { ...parseFlexiQuiz(workbook, fileName),       format: "flexiquiz" };
  return {
    quizMeta: null, questions: [],
    errors: [
      "Unrecognized file format. Please use one of:",
      "• Our template (download from this page)",
      "• A simple Questions-only sheet (columns: question_text, type, option_a…d, correct_answer, points, category, image_url, explanation)",
      "• A FlexiQuiz export file (.xlsx)",
    ],
    format: "unknown",
  };
}

function Badge({ type }) {
  const styles = {
  radio_button:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  free_text:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  checkbox:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
  writing:        "bg-pink-500/10 text-pink-400 border-pink-500/20",
  short_answer:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  matching:       "bg-teal-500/10 text-teal-400 border-teal-500/20",
};
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>
      {type}
    </span>
  );
}

export default function QuizUploader({ onUploadSuccess }) {
  const [step,         setStep]         = useState("select");
  const [file,         setFile]         = useState(null);
  const [parsed,       setParsed]       = useState(null);
  const [uploadError,  setUploadError]  = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [editMeta,     setEditMeta]     = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadError("");
    try {
      const buf = await f.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const result = parseExcel(wb, f.name);
      setParsed(result);
      if (result.quizMeta?._needsReview) {
        setEditMeta({ ...result.quizMeta });
      } else {
        setEditMeta(null);
      }
      if (result.errors.length === 0 && result.questions.length > 0) {
        setStep("preview");
      }
    } catch (err) {
      setUploadError("Failed to read Excel file: " + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!parsed || parsed.errors.length > 0) return;
    setStep("uploading");
    setUploadError("");

    const finalMeta = editMeta || parsed.quizMeta;

    if (!finalMeta.quiz_name)  { setUploadError("Quiz name is required"); setStep("preview"); return; }
    if (![3, 5, 7, 9].includes(finalMeta.year_level)) { setUploadError("Year level must be 3, 5, 7, or 9"); setStep("preview"); return; }
    if (!["Maths", "Reading", "Writing", "Language conventions"].includes(finalMeta.subject)) {
      setUploadError("Subject must be Maths, Reading, Writing, or Language conventions");
      setStep("preview");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setUploadError("You are not authenticated. Please log out and log in again.");
      setStep("preview");
      return;
    }

    try {
      const res = await adminFetch("/api/admin/quizzes/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz: {
            quiz_name:          finalMeta.quiz_name,
            year_level:         finalMeta.year_level,
            subject:            finalMeta.subject,
            tier:               finalMeta.tier               || "A",
            time_limit_minutes: finalMeta.time_limit_minutes || null,
            difficulty:         finalMeta.difficulty         || null,
            set_number:         finalMeta.set_number         || 1,
            is_trial:           finalMeta.is_trial           || false,
            voice_url:          finalMeta.voice_url          || null,
            video_url:          finalMeta.video_url          || null,
          },
          // ✅ FIX 2: Safety net — ensure correct field is always set from correct_answer labels
          questions: parsed.questions.map((q) => {
            const correctLabels = (q.correct_answer || "")
              .toUpperCase()
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return {
              question_text: q.question_text,
              type:          q.type,
              options: (q.options || []).map((opt) => ({
                ...opt,
                correct:
                  opt.correct === true ||
                  correctLabels.includes((opt.label || "").toUpperCase()),
              })),
              correct_answer: q.correct_answer,
              points:         q.points,
              category:       q.category,
              image_url:      q.image_url   || "",
              explanation:    q.explanation || "",
              voice_url:      q.voice_url   || "",
            };
          }),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403) throw new Error("Access denied (403). Your session may have expired — please log out and log in again.");
        if (res.status === 401) throw new Error("Unauthorized (401). Please log out and log in again.");
        throw new Error(body.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setUploadResult(data);
      setStep("done");
      onUploadSuccess?.();
    } catch (err) {
      setUploadError(err.message);
      setStep("preview");
    }
  };

  const resetAll = () => {
    setStep("select"); setFile(null); setParsed(null);
    setUploadError(""); setUploadResult(null); setEditMeta(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ═══════════════════════════════════════
  // STEP: SELECT FILE
  // ═══════════════════════════════════════
  if (step === "select") {
    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">Quiz Upload Template</h3>
              <p className="text-xs text-slate-400 mt-1">Download, fill in your questions, then upload below.</p>
            </div>
            <a
              href="https://docs.google.com/spreadsheets/d/1EdN6coi8VePzQI0oM9d6Yh9aul9sr_oL/edit?usp=sharing&ouid=107123046742355467108&rtpof=true&sd=true"
              download="Quiz_Upload_Template.xlsx"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              ⬇ Download Template
            </a>
          </div>
        </div>

        {/* ✅ Updated to mention 3 supported formats */}
        <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-xl p-4">
          <p className="text-sm text-indigo-300 font-medium mb-1">📎 Supports three formats:</p>
          <ul className="text-xs text-indigo-400/80 space-y-1 ml-4">
            <li>• <span className="text-indigo-300">Our template</span> — download above (Questions + Quiz Info sheets)</li>
            <li>• <span className="text-indigo-300">Simple questions sheet</span> — single Questions sheet with columns: question_text, type, option_a…d, correct_answer, points, category, image_url, explanation</li>
            <li>• <span className="text-indigo-300">FlexiQuiz export</span> — upload directly, we'll auto-detect it</li>
          </ul>
        </div>

        {file && parsed && (
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {parsed.questions.length} questions parsed
                  {parsed.format === "flexiquiz" && <span className="ml-2 text-indigo-400">(FlexiQuiz format detected)</span>}
                  {parsed.format === "simple"    && <span className="ml-2 text-green-400">(Simple format detected)</span>}
                </p>
              </div>
            </div>
            <button onClick={resetAll} className="text-sm text-slate-400 hover:text-white transition-colors">Choose Different File</button>
          </div>
        )}

        {parsed?.errors?.length > 0 && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <p className="text-sm font-medium text-red-400 mb-2">{parsed.errors.length} validation error{parsed.errors.length > 1 ? "s" : ""} found:</p>
            <ul className="space-y-1">
              {parsed.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-300 flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> {e}</li>
              ))}
            </ul>
            <p className="text-xs text-red-400/70 mt-3">Fix these errors in your Excel file and re-upload.</p>
          </div>
        )}

        {uploadError && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{uploadError}</div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="quiz-file-upload"
              className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-900 hover:border-indigo-500/50 transition-colors">
              <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm text-slate-400"><span className="text-indigo-400 font-medium">Click to upload</span> or drag and drop</p>
              <p className="text-xs text-slate-500 mt-1">.xlsx files — our template, simple questions sheet, or FlexiQuiz export</p>
            </label>
            <input id="quiz-file-upload" ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // STEP: PREVIEW
  // ═══════════════════════════════════════
  if (step === "preview" && parsed) {
    const hasErrors = parsed.errors.length > 0;
    const meta = editMeta || parsed.quizMeta;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{file?.name}</p>
              <p className="text-xs text-slate-400">
                {parsed.questions.length} questions parsed
                {parsed.format === "flexiquiz" && <span className="ml-2 text-indigo-400">(FlexiQuiz format)</span>}
                {parsed.format === "simple"    && <span className="ml-2 text-green-400">(Simple format)</span>}
              </p>
            </div>
          </div>
          <button onClick={resetAll} className="text-sm text-slate-400 hover:text-white transition-colors">Choose Different File</button>
        </div>

        {hasErrors && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <p className="text-sm font-medium text-red-400 mb-2">{parsed.errors.length} validation error{parsed.errors.length > 1 ? "s" : ""} found:</p>
            <ul className="space-y-1">
              {parsed.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-300 flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> {e}</li>
              ))}
            </ul>
            <p className="text-xs text-red-400/70 mt-3">Fix these errors in your Excel file and re-upload.</p>
          </div>
        )}

        {uploadError && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{uploadError}</div>
        )}

        {meta && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Quiz Info</h3>
              {(parsed.format === "flexiquiz" || parsed.format === "simple") && (
                <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  ✏️ Review & edit before uploading
                </span>
              )}
            </div>

            {editMeta ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Quiz Name *</label>
                  <input type="text" value={editMeta.quiz_name}
                    onChange={(e) => setEditMeta((m) => ({ ...m, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Year Level *</label>
                  <select value={editMeta.year_level}
                    onChange={(e) => setEditMeta((m) => ({ ...m, year_level: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value={0}>Select...</option>
                    <option value={3}>Year 3</option>
                    <option value={5}>Year 5</option>
                    <option value={7}>Year 7</option>
                    <option value={9}>Year 9</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Subject *</label>
                  <select value={editMeta.subject}
                    onChange={(e) => setEditMeta((m) => ({ ...m, subject: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">Select...</option>
                    <option value="Maths">Maths</option>
                    <option value="Reading">Reading</option>
                    <option value="Writing">Writing</option>
                    <option value="Language conventions">Language conventions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Tier</label>
                  <select value={editMeta.tier}
                    onChange={(e) => setEditMeta((m) => ({ ...m, tier: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Time Limit (min)</label>
                  <input type="number" value={editMeta.time_limit_minutes || ""}
                    onChange={(e) => setEditMeta((m) => ({ ...m, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="No limit"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Difficulty</label>
                  <select value={editMeta.difficulty || ""}
                    onChange={(e) => setEditMeta((m) => ({ ...m, difficulty: e.target.value || null }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">Auto</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">🔊 Voice / Audio URL</label>
                  <input type="url" value={editMeta.voice_url || ""}
                    onChange={(e) => setEditMeta((m) => ({ ...m, voice_url: e.target.value || null }))}
                    placeholder="https://... .mp3 / .wav"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">🎬 Video URL</label>
                  <input type="url" value={editMeta.video_url || ""}
                    onChange={(e) => setEditMeta((m) => ({ ...m, video_url: e.target.value || null }))}
                    placeholder="https://... YouTube / .mp4"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500">Name:</span>    <span className="text-white font-medium ml-1">{meta.quiz_name    || "—"}</span></div>
                <div><span className="text-slate-500">Year:</span>    <span className="text-white font-medium ml-1">{meta.year_level  || "—"}</span></div>
                <div><span className="text-slate-500">Subject:</span> <span className="text-white font-medium ml-1">{meta.subject     || "—"}</span></div>
                <div><span className="text-slate-500">Tier:</span>    <span className="text-white font-medium ml-1">{meta.tier        || "—"}</span></div>
                {meta.time_limit_minutes && <div><span className="text-slate-500">Time:</span>       <span className="text-white ml-1">{meta.time_limit_minutes} min</span></div>}
                {meta.difficulty         && <div><span className="text-slate-500">Difficulty:</span> <span className="text-white ml-1">{meta.difficulty}</span></div>}
                {meta.voice_url          && <div><span className="text-slate-500">🔊 Voice:</span>  <span className="text-indigo-400 ml-1 truncate text-xs">{meta.voice_url}</span></div>}
                {meta.video_url          && <div><span className="text-slate-500">🎬 Video:</span>  <span className="text-indigo-400 ml-1 truncate text-xs">{meta.video_url}</span></div>}
              </div>
            )}
          </div>
        )}

        {parsed.questions.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h3 className="text-sm font-medium text-slate-300">Questions Preview ({parsed.questions.length})</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase w-10">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Question</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase w-32">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase w-24">Options</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase w-20">Answer</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase w-28">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {parsed.questions.map((q, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-2.5 text-white max-w-xs truncate" title={q.question_text}>{q.question_text}</td>
                      <td className="px-4 py-2.5"><Badge type={q.type} /></td>
                      <td className="px-4 py-2.5 text-slate-400">{q.options.length || "—"}</td>
                      <td className="px-4 py-2.5 text-emerald-400 font-mono">{q.correct_answer || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-400 truncate" title={q.category}>{q.category || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSubmit} disabled={hasErrors || parsed.questions.length === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
            Upload {parsed.questions.length} Questions
          </button>
          <button onClick={resetAll} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // STEP: UPLOADING
  // ═══════════════════════════════════════
  if (step === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-400">Uploading quiz and questions...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // STEP: DONE
  // ═══════════════════════════════════════
  if (step === "done") {
    return (
      <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-emerald-300">Quiz Uploaded Successfully!</h3>
        <p className="text-sm text-emerald-400/70 mt-1">
          {uploadResult?.quiz_name || "Quiz"} — {uploadResult?.question_count || parsed?.questions?.length || 0} questions saved.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={resetAll} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors">
            Upload Another
          </button>
          <button onClick={() => onUploadSuccess?.()} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
            View All Quizzes
          </button>
        </div>
      </div>
    );
  }

  return null;
}
