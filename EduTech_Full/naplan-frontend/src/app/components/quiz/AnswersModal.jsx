/**
 * AnswersModal.jsx
 *
 * Full-screen modal that displays the child's quiz answers after completion.
 * Features:
 *   - Score summary header
 *   - Topic breakdown
 *   - Each question with green/red correct/wrong indicators
 *   - "Download PDF" button using jsPDF (clean text-based)
 *
 * Data source: GET /api/attempts/:attemptId/flashcards
 *
 * ✅ FIXES APPLIED:
 *   1. PDF text sanitizer — strips HTML, decodes entities, replaces unsupported chars
 *   2. Field name compatibility — reads both child_answer and child_answer_text
 *   3. is_correct fallback — uses points_scored > 0 when is_correct is missing
 *
 * Props:
 *   - attemptId : string (attempt_id to fetch flashcards)
 *   - quizName  : string
 *   - score     : { points, available, percentage, grade }
 *   - topics    : { [name]: { scored, total } }
 *   - onClose   : () => void
 *
 * Place in: src/app/components/quiz/AnswersModal.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/context/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "";

/* ═══════════════════════════════════════
   ✅ FIX: Text sanitizer for jsPDF
   jsPDF's built-in Helvetica only supports Windows-1252.
   We must strip HTML, decode entities, and replace unsupported chars.
   ═══════════════════════════════════════ */
function sanitizeForPDF(text) {
  if (!text) return "";
  let t = String(text);

  // 1. Strip HTML tags
  t = t.replace(/<[^>]+>/g, " ");

  // 2. Decode common HTML entities
  const entities = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
    "&nbsp;": " ", "&ndash;": "-", "&mdash;": "--", "&lsquo;": "'", "&rsquo;": "'",
    "&ldquo;": '"', "&rdquo;": '"', "&bull;": "-", "&hellip;": "...", "&times;": "x",
    "&divide;": "/", "&plusmn;": "+/-", "&frac12;": "1/2", "&frac14;": "1/4",
    "&frac34;": "3/4", "&deg;": " degrees", "&trade;": "(TM)", "&copy;": "(c)",
    "&reg;": "(R)", "&euro;": "EUR", "&pound;": "GBP", "&yen;": "JPY",
  };
  for (const [entity, replacement] of Object.entries(entities)) {
    t = t.replaceAll(entity, replacement);
  }

  // 3. Decode numeric HTML entities (&#123; or &#x7B;)
  t = t.replace(/&#(\d+);/g, (_, code) => {
    const ch = String.fromCharCode(Number(code));
    return isPrintableAscii(ch) ? ch : replaceFallback(Number(code));
  });
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = parseInt(hex, 16);
    const ch = String.fromCharCode(code);
    return isPrintableAscii(ch) ? ch : replaceFallback(code);
  });

  // 4. Replace common Unicode chars that Helvetica can't render
  const unicodeReplacements = {
    "\u00D7": "x",       // ×
    "\u00F7": "/",       // ÷
    "\u2013": "-",       // –
    "\u2014": "--",      // —
    "\u2018": "'",       // '
    "\u2019": "'",       // '
    "\u201C": '"',       // "
    "\u201D": '"',       // "
    "\u2022": "-",       // •
    "\u2026": "...",     // …
    "\u2190": "<-",      // ←
    "\u2192": "->",      // →
    "\u2264": "<=",      // ≤
    "\u2265": ">=",      // ≥
    "\u2260": "!=",      // ≠
    "\u221A": "sqrt",    // √
    "\u03C0": "pi",      // π
    "\u00B2": "^2",      // ²
    "\u00B3": "^3",      // ³
    "\u00BC": "1/4",     // ¼
    "\u00BD": "1/2",     // ½
    "\u00BE": "3/4",     // ¾
    "\u2212": "-",       // −
    "\u2248": "~=",      // ≈
    "\u221E": "infinity",// ∞
    "\u00B0": " degrees",// °
    "\u2713": "[correct]", // ✓
    "\u2717": "[wrong]",   // ✗
    "\u2714": "[correct]", // ✔
    "\u2716": "[wrong]",   // ✖
    "\u00A0": " ",       // non-breaking space
    "\u200B": "",        // zero-width space
    "\u200C": "",        // zero-width non-joiner
    "\u200D": "",        // zero-width joiner
    "\uFEFF": "",        // BOM
  };

  for (const [char, replacement] of Object.entries(unicodeReplacements)) {
    t = t.replaceAll(char, replacement);
  }

  // 5. Final pass: replace any remaining non-ASCII chars
  t = t.replace(/[^\x20-\x7E\n\r\t]/g, (ch) => {
    const code = ch.charCodeAt(0);
    // Allow some extended Latin (Windows-1252 compatible: 0xA0-0xFF)
    if (code >= 0xA0 && code <= 0xFF) return ch;
    return "?";
  });

  // 6. Clean up whitespace
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

function isPrintableAscii(ch) {
  const code = ch.charCodeAt(0);
  return code >= 0x20 && code <= 0x7E;
}

function replaceFallback(code) {
  if (code === 215) return "x";  // ×
  if (code === 247) return "/";  // ÷
  if (code === 176) return " degrees"; // °
  return "?";
}

/* ═══════════════════════════════════════
   ✅ FIX: Helper to read flashcard fields with fallback aliases
   API returns child_answer_text but older code may use child_answer
   ═══════════════════════════════════════ */
function getChildAnswer(card) {
  return card.child_answer || card.child_answer_text || "No answer";
}

function getCorrectAnswer(card) {
  return card.correct_answer || card.correct_answer_text || "—";
}

function getIsCorrect(card) {
  // 1. Explicit boolean
  if (card.is_correct === true) return true;
  if (card.is_correct === false) return false;
  // 2. Fallback: points earned
  if (card.points_earned > 0) return true;
  // 3. Fallback: points_scored on the answer
  if (card.points_scored > 0) return true;
  return false;
}

/* ═══════════════════════════════════════
   PDF Generation (jsPDF — text-based, clean)
   ═══════════════════════════════════════ */
async function generatePDF({ quizName, score, topics, flashcards }) {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;
  let y = 15;

  const checkPage = (needed = 20) => {
    if (y + needed > pageH - 15) {
      doc.addPage();
      y = 15;
    }
  };

  // ─── Header ───
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(sanitizeForPDF(quizName || "Quiz Results"), marginL, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`, marginL, y);
  y += 10;

  // ─── Score Summary Box ───
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginL, y, contentW, 22, 3, 3, "F");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Score Summary", marginL + 5, y + 7);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const pct = score?.percentage || 0;
  const pts = score?.points || 0;
  const avail = score?.available || 0;
  const grade = score?.grade || "—";

  // ✅ FIX: Use points-based count (consistent with score header)
  const correctCount = flashcards.filter((f) => getIsCorrect(f)).length;
  doc.text(`Score: ${pts} / ${avail}  (${pct}%)   |   Grade: ${grade}   |   ${correctCount}/${flashcards.length} correct`, marginL + 5, y + 14);

  const passText = pct >= 50 ? "PASS" : "NEEDS IMPROVEMENT";
  const passColor = pct >= 50 ? [5, 150, 105] : [220, 38, 38];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...passColor);
  doc.text(passText, marginL + contentW - 5, y + 7, { align: "right" });

  y += 28;

  // ─── Topic Breakdown ───
  const topicEntries = Object.entries(topics || {});
  if (topicEntries.length > 0) {
    checkPage(10 + topicEntries.length * 7);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Topic Breakdown", marginL, y);
    y += 6;

    topicEntries.forEach(([name, data]) => {
      const topicPct = data.total > 0 ? Math.round((data.scored / data.total) * 100) : 0;

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(marginL, y - 3, contentW, 6, 1.5, 1.5, "F");

      const barColor = topicPct >= 80 ? [5, 150, 105] : topicPct >= 60 ? [217, 119, 6] : [220, 38, 38];
      doc.setFillColor(...barColor);
      const barW = Math.max(2, (topicPct / 100) * contentW);
      doc.roundedRect(marginL, y - 3, barW, 6, 1.5, 1.5, "F");

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(sanitizeForPDF(`${name}  --  ${data.scored}/${data.total} (${topicPct}%)`), marginL + 2, y + 0.5);
      y += 8;
    });

    y += 4;
  }

  // ─── Divider ───
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, marginL + contentW, y);
  y += 8;

  // ─── Questions & Answers ───
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Questions & Answers", marginL, y);
  y += 8;

  flashcards.forEach((card, idx) => {
    checkPage(40);

    const qNum = idx + 1;
    const isCorrect = getIsCorrect(card);

    const statusIcon = isCorrect ? "[correct]" : "[wrong]";
    const statusColor = isCorrect ? [5, 150, 105] : [220, 38, 38];

    // Question number + text
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);

    const qText = sanitizeForPDF(`Q${qNum}. ${card.question_text || "Question"}`);
    const qLines = doc.splitTextToSize(qText, contentW - 10);
    doc.text(qLines, marginL, y);

    // Status badge (right-aligned)
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...statusColor);
    doc.text(isCorrect ? "Correct" : "Wrong", marginL + contentW - 5, y, { align: "right" });

    y += qLines.length * 5 + 2;

    // Child's answer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const childAns = sanitizeForPDF(getChildAnswer(card));
    doc.setTextColor(...(isCorrect ? [5, 150, 105] : [220, 38, 38]));
    const childLabel = `Your Answer: ${childAns}`;
    const childLines = doc.splitTextToSize(childLabel, contentW - 5);
    doc.text(childLines, marginL + 4, y);
    y += childLines.length * 4.5 + 1;

    // Correct answer (show only if wrong)
    if (!isCorrect) {
      doc.setTextColor(5, 150, 105);
      const correctLabel = sanitizeForPDF(`Correct Answer: ${getCorrectAnswer(card)}`);
      const correctLines = doc.splitTextToSize(correctLabel, contentW - 5);
      doc.text(correctLines, marginL + 4, y);
      y += correctLines.length * 4.5 + 1;
    }

    // Explanation
    if (card.explanation) {
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "italic");
      const expText = sanitizeForPDF(card.explanation);
      const expLines = doc.splitTextToSize(expText, contentW - 5);
      doc.text(expLines, marginL + 4, y);
      y += expLines.length * 4.5 + 1;
    }

    y += 5;

    // Light divider
    if (idx < flashcards.length - 1) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(marginL + 4, y - 3, marginL + contentW - 4, y - 3);
    }
  });

  // ─── Footer ───
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
  }

  const safeName = (quizName || "Quiz").replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  doc.save(`${safeName} - Answers.pdf`);
}

/* ═══════════════════════════════════════
   MAIN: AnswersModal
   ═══════════════════════════════════════ */
export default function AnswersModal({ attemptId, quizName, score, topics, onClose }) {
  const { apiFetch } = useAuth();
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // ─── Fetch flashcards ───
  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(`/api/attempts/${attemptId}/flashcards`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to load answers");
        }
        const data = await res.json();
        if (!cancelled) setFlashcards(data.flashcards || data || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [attemptId, apiFetch]);

  // ─── Download handler ───
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await generatePDF({ quizName, score, topics, flashcards });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [quizName, score, topics, flashcards]);

  // ─── Close on Escape ───
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ─── Summary stats ───
  // ✅ FIX: Use getIsCorrect helper for consistent counting
  const totalCorrect = flashcards.filter((f) => getIsCorrect(f)).length;
  const totalQuestions = flashcards.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 pt-8 pb-8">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Modal Header ─── */}
        <div className="sticky top-0 bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Your Answers</h2>
            <p className="text-xs text-slate-500 mt-0.5">{quizName}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download PDF */}
            {!loading && !error && flashcards.length > 0 && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                {downloading ? (
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                )}
                {downloading ? "Generating..." : "Download PDF"}
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ─── Modal Body (scrollable) ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading your answers...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <button
                onClick={onClose}
                className="mt-3 text-xs text-red-600 underline hover:text-red-800"
              >
                Close
              </button>
            </div>
          )}

          {/* Content */}
          {!loading && !error && (
            <>
              {/* Score Summary Mini */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    (score?.percentage || 0) >= 50 ? "bg-emerald-500" : "bg-red-500"
                  }`}>
                    {score?.percentage || 0}%
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {score?.points || 0} / {score?.available || 0} points
                    </p>
                    <p className="text-xs text-slate-500">
                      {/* ✅ FIX: Use consistent correct count */}
                      {totalCorrect} of {totalQuestions} correct · Grade {score?.grade || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Topic Breakdown */}
              {topics && Object.keys(topics).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(topics).map(([name, data]) => {
                      const topicPct = data.total > 0 ? Math.round((data.scored / data.total) * 100) : 0;
                      const color =
                        topicPct >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        topicPct >= 50 ? "bg-amber-100 text-amber-700 border-amber-200" :
                        "bg-red-100 text-red-700 border-red-200";
                      return (
                        <span key={name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
                          {name} {topicPct}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-3">
                {flashcards.map((card, idx) => {
                  const isCorrect = getIsCorrect(card);
                  return (
                    <div
                      key={card.question_id || idx}
                      className={`rounded-xl border p-4 space-y-2 ${
                        isCorrect
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-red-200 bg-red-50/30"
                      }`}
                    >
                      {/* Question header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-white ${
                            isCorrect ? "bg-emerald-500" : "bg-red-500"
                          }`}>
                            {isCorrect ? "✓" : "✗"}
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                              Question {idx + 1}
                            </p>
                            <p className="text-sm text-slate-800 font-medium leading-relaxed">
                              {card.question_text}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Answers */}
                      <div className="ml-7.5 space-y-1.5" style={{ marginLeft: "30px" }}>
                        {/* Child's answer */}
                        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                          isCorrect
                            ? "bg-emerald-100/70 text-emerald-800"
                            : "bg-red-100/70 text-red-800"
                        }`}>
                          <span className="font-semibold text-xs mt-0.5 flex-shrink-0">
                            {isCorrect ? "✓" : "✗"}
                          </span>
                          <div>
                            <span className="text-xs font-medium opacity-70">Your answer: </span>
                            {/* ✅ FIX: Use helper that reads both field names */}
                            <span className="font-medium">{getChildAnswer(card)}</span>
                          </div>
                        </div>

                        {/* Correct answer (only if wrong) */}
                        {!isCorrect && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-100/70 text-emerald-800">
                            <span className="font-semibold text-xs mt-0.5 flex-shrink-0">✓</span>
                            <div>
                              <span className="text-xs font-medium opacity-70">Correct answer: </span>
                              {/* ✅ FIX: Use helper that reads both field names */}
                              <span className="font-medium">{getCorrectAnswer(card)}</span>
                            </div>
                          </div>
                        )}

                        {/* Explanation */}
                        {card.explanation && (
                          <div className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs leading-relaxed">
                            <span className="font-semibold">💡 </span>
                            {card.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty state */}
              {flashcards.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-500">No answer data available for this attempt.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Modal Footer ─── */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 rounded-b-2xl px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {/* ✅ FIX: Consistent correct count using getIsCorrect */}
            {!loading && !error && flashcards.length > 0
              ? `${totalCorrect}/${totalQuestions} correct`
              : ""
            }
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
