/**
 * QuizUploader.jsx
 * 
 * Handles the full upload flow:
 *   1. Download template (link)
 *   2. Upload filled Excel file
 *   3. Client-side parse & validate (using SheetJS)
 *   4. Preview questions in a table
 *   5. Submit to backend
 * 
 * Place in: src/app/components/admin/QuizUploader.jsx
 * 
 * Dependencies: npm install xlsx (SheetJS) — already in your project
 */

import { useState, useRef } from "react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

// ─── Parse Excel → structured quiz data ───
function parseExcel(workbook) {
  const errors = [];

  // ── 1. Parse Quiz Info sheet ──
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
    is_trial: meta.is_trial === "true",
  };

  if (!quizMeta.quiz_name) errors.push("Quiz name is required (Quiz Info sheet)");
  if (![3, 5, 7, 9].includes(quizMeta.year_level)) errors.push("Year level must be 3, 5, 7, or 9");
  if (!["Maths", "Reading", "Writing", "Conventions"].includes(quizMeta.subject)) {
    errors.push("Subject must be Maths, Reading, Writing, or Conventions");
  }

  // ── 2. Parse Questions sheet ──
  const qSheet = workbook.Sheets["Questions"];
  if (!qSheet) {
    errors.push("Missing 'Questions' sheet. Please use the provided template.");
    return { quizMeta, questions: [], errors };
  }

  const qRows = XLSX.utils.sheet_to_json(qSheet, { defval: "" });
  // Skip description row if present (row with italic descriptions)
  const dataRows = qRows.filter(
    (row) => row.question_text && !String(row.question_text).startsWith("The question text")
  );

  const validTypes = ["radio_button", "picture_choice", "free_text", "checkbox"];
  const questions = [];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 3; // Excel row number (1-header, 2-descriptions, 3+ data)
    const q = {
      _rowNum: rowNum,
      question_text: String(row.question_text || "").trim(),
      type: String(row.type || "").trim().toLowerCase(),
      options: [],
      correct_answer: String(row.correct_answer || "").trim().toUpperCase(),
      points: parseInt(row.points) || 1,
      category: String(row.category || "").trim(),
      image_url: String(row.image_url || "").trim(),
      explanation: String(row.explanation || "").trim(),
    };

    if (!q.question_text) { errors.push(`Row ${rowNum}: Missing question text`); return; }
    if (!validTypes.includes(q.type)) {
      errors.push(`Row ${rowNum}: Invalid type "${q.type}". Must be: ${validTypes.join(", ")}`);
      return;
    }

    // Build options
    const optionLetters = ["a", "b", "c", "d", "e"];
    optionLetters.forEach((letter) => {
      const text = String(row[`option_${letter}`] || "").trim();
      const image = String(row[`option_${letter}_image`] || "").trim();
      if (text || image) {
        q.options.push({
          label: letter.toUpperCase(),
          text,
          image_url: image || null,
        });
      }
    });

    // Validate based on type
    if (q.type === "free_text") {
      // Writing — no options or correct answer needed
      q.correct_answer = "";
    } else {
      if (q.options.length < 2) {
        errors.push(`Row ${rowNum}: MCQ needs at least 2 options (option_a and option_b)`);
        return;
      }
      if (!q.correct_answer) {
        errors.push(`Row ${rowNum}: Missing correct_answer for MCQ question`);
        return;
      }
      // Validate correct answer references valid options
      const validLabels = q.options.map((o) => o.label);
      const answerLetters = q.correct_answer.split(",").map((s) => s.trim());
      for (const a of answerLetters) {
        if (!validLabels.includes(a)) {
          errors.push(`Row ${rowNum}: Correct answer "${a}" doesn't match any option (${validLabels.join(",")})`);
        }
      }
      if (q.type !== "checkbox" && answerLetters.length > 1) {
        errors.push(`Row ${rowNum}: radio_button/picture_choice can only have one correct answer`);
      }
    }

    questions.push(q);
  });

  if (questions.length === 0 && errors.length === 0) {
    errors.push("No questions found. Add questions starting from row 3 in the Questions sheet.");
  }

  return { quizMeta, questions, errors };
}

// ─── Validation Badge ───
function Badge({ type }) {
  const styles = {
    radio_button: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    free_text: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    checkbox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>
      {type}
    </span>
  );
}

export default function QuizUploader({ onUploadSuccess }) {
  const [step, setStep] = useState("select"); // select | preview | uploading | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef(null);

  // ── Handle file selection ──
  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploadError("");

    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const result = parseExcel(wb);
      setParsed(result);

      if (result.errors.length === 0 && result.questions.length > 0) {
        setStep("preview");
      } else if (result.errors.length > 0) {
        setStep("preview"); // Show preview with errors
      }
    } catch (err) {
      setUploadError(`Failed to read Excel file: ${err.message}`);
    }
  };

  // ── Submit to backend ──
  const handleSubmit = async () => {
    if (!parsed || parsed.errors.length > 0) return;
    setStep("uploading");
    setUploadError("");

    try {
      const payload = {
        quiz: parsed.quizMeta,
        questions: parsed.questions.map((q, i) => ({
          question_text: q.question_text,
          type: q.type,
          options: q.options.map((opt) => ({
            text: opt.text,
            image_url: opt.image_url,
            correct: q.correct_answer.split(",").map((s) => s.trim()).includes(opt.label),
          })),
          points: q.points,
          category: q.category,
          image_url: q.image_url,
          explanation: q.explanation,
          order: i + 1,
        })),
      };

      const res = await adminFetch("/api/admin/quizzes/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadResult(data);
      setStep("done");
    } catch (err) {
      setUploadError(err.message);
      setStep("preview");
    }
  };

  const resetAll = () => {
    setStep("select");
    setFile(null);
    setParsed(null);
    setUploadError("");
    setUploadResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ═══════════════════════════════════════
  // STEP: FILE SELECT
  // ═══════════════════════════════════════
  if (step === "select") {
    return (
      <div className="space-y-6">
        {/* Download template */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">Step 1: Download Template</h3>
              <p className="text-sm text-slate-400 mt-1">
                Download the Excel template, fill in quiz metadata and questions, then come back to upload.
              </p>
              <a
                href={`${API}/api/admin/template`}
                download="Quiz_Upload_Template.xlsx"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 
                           text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Template (.xlsx)
              </a>
            </div>
          </div>
        </div>

        {/* Upload file */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">Step 2: Upload Filled Template</h3>
              <p className="text-sm text-slate-400 mt-1">
                Upload your completed Excel file. Questions will be validated before saving.
              </p>

              {uploadError && (
                <div className="mt-3 bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
                  {uploadError}
                </div>
              )}

              <label className="mt-4 flex flex-col items-center justify-center w-full h-40 border-2 border-dashed 
                                border-slate-700 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-slate-800/50 transition-all">
                <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-slate-400">
                  <span className="text-indigo-400 font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500 mt-1">.xlsx files only</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
            </div>
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
    const meta = parsed.quizMeta;

    return (
      <div className="space-y-6">
        {/* File info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{file?.name}</p>
              <p className="text-xs text-slate-400">{parsed.questions.length} questions parsed</p>
            </div>
          </div>
          <button onClick={resetAll} className="text-sm text-slate-400 hover:text-white transition-colors">
            Choose Different File
          </button>
        </div>

        {/* Errors */}
        {hasErrors && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <p className="text-sm font-medium text-red-400 mb-2">
              {parsed.errors.length} validation error{parsed.errors.length > 1 ? "s" : ""} found:
            </p>
            <ul className="space-y-1">
              {parsed.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-300 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">&#x2022;</span> {e}
                </li>
              ))}
            </ul>
            <p className="text-xs text-red-400/70 mt-3">Fix these errors in your Excel file and re-upload.</p>
          </div>
        )}

        {uploadError && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
            {uploadError}
          </div>
        )}

        {/* Quiz Metadata */}
        {meta && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Quiz Info</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-500">Name:</span> <span className="text-white font-medium ml-1">{meta.quiz_name || "—"}</span></div>
              <div><span className="text-slate-500">Year:</span> <span className="text-white font-medium ml-1">{meta.year_level || "—"}</span></div>
              <div><span className="text-slate-500">Subject:</span> <span className="text-white font-medium ml-1">{meta.subject || "—"}</span></div>
              <div><span className="text-slate-500">Tier:</span> <span className="text-white font-medium ml-1">{meta.tier || "—"}</span></div>
              {meta.time_limit_minutes && <div><span className="text-slate-500">Time:</span> <span className="text-white ml-1">{meta.time_limit_minutes} min</span></div>}
              {meta.difficulty && <div><span className="text-slate-500">Difficulty:</span> <span className="text-white ml-1">{meta.difficulty}</span></div>}
            </div>
          </div>
        )}

        {/* Questions Preview Table */}
        {parsed.questions.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h3 className="text-sm font-medium text-slate-300">Questions Preview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
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
                      <td className="px-4 py-2.5 text-white max-w-xs truncate">{q.question_text}</td>
                      <td className="px-4 py-2.5"><Badge type={q.type} /></td>
                      <td className="px-4 py-2.5 text-slate-400">{q.options.length || "—"}</td>
                      <td className="px-4 py-2.5 text-emerald-400 font-mono">{q.correct_answer || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-400 truncate">{q.category || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={hasErrors || parsed.questions.length === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
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
          <button
            onClick={() => { resetAll(); }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Upload Another
          </button>
          <button
            onClick={() => onUploadSuccess?.()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View All Quizzes
          </button>
        </div>
      </div>
    );
  }

  return null;
}
