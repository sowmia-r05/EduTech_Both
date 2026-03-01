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
   PDF Generation (jsPDF — text-based, clean)
   ═══════════════════════════════════════ */
async function generatePDF({ quizName, score, topics, flashcards }) {
  // Dynamic import — only loaded when user clicks Download
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
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(quizName || "Quiz Results", marginL, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Generated on ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`, marginL, y);
  y += 10;

  // ─── Score Summary Box ───
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(marginL, y, contentW, 22, 3, 3, "F");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Score Summary", marginL + 5, y + 7);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105); // slate-600
  const pct = score?.percentage || 0;
  const pts = score?.points || 0;
  const avail = score?.available || 0;
  const grade = score?.grade || "—";
  doc.text(`Score: ${pts} / ${avail}  (${pct}%)   •   Grade: ${grade}`, marginL + 5, y + 14);

  // Pass/Fail indicator
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

      // Background bar
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(marginL, y - 3, contentW, 6, 1.5, 1.5, "F");

      // Filled bar
      const barColor = topicPct >= 80 ? [5, 150, 105] : topicPct >= 60 ? [217, 119, 6] : [220, 38, 38];
      doc.setFillColor(...barColor);
      const barW = Math.max(2, (topicPct / 100) * contentW);
      doc.roundedRect(marginL, y - 3, barW, 6, 1.5, 1.5, "F");

      // Label
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(`${name}  —  ${data.scored}/${data.total} (${topicPct}%)`, marginL + 2, y + 0.5);
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
    // Estimate space needed: question (~10) + child answer (~7) + correct (~7) + explanation (~7) + gap
    checkPage(40);

    const qNum = idx + 1;
    const isCorrect = card.is_correct;

    // Status icon line
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);

    const statusIcon = isCorrect ? "✓" : "✗";
    const statusColor = isCorrect ? [5, 150, 105] : [220, 38, 38];

    // Question number + text
    const qText = `Q${qNum}. ${card.question_text || "Question"}`;
    const qLines = doc.splitTextToSize(qText, contentW - 10);
    doc.text(qLines, marginL, y);

    // Status badge
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...statusColor);
    doc.text(statusIcon + (isCorrect ? " Correct" : " Wrong"), marginL + contentW - 5, y, { align: "right" });

    y += qLines.length * 5 + 2;

    // Child's answer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const childAns = card.child_answer || "No answer";
    doc.setTextColor(...(isCorrect ? [5, 150, 105] : [220, 38, 38]));
    const childLabel = `Your Answer: ${childAns}`;
    const childLines = doc.splitTextToSize(childLabel, contentW - 5);
    doc.text(childLines, marginL + 4, y);
    y += childLines.length * 4.5 + 1;

    // Correct answer (show only if wrong)
    if (!isCorrect) {
      doc.setTextColor(5, 150, 105);
      const correctLabel = `Correct Answer: ${card.correct_answer || "—"}`;
      const correctLines = doc.splitTextToSize(correctLabel, contentW - 5);
      doc.text(correctLines, marginL + 4, y);
      y += correctLines.length * 4.5 + 1;
    }

    // Explanation (if exists)
    if (card.explanation) {
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "italic");
      const expLines = doc.splitTextToSize(`💡 ${card.explanation}`, contentW - 5);
      doc.text(expLines, marginL + 4, y);
      y += expLines.length * 4.5 + 1;
    }

    y += 5; // gap between questions

    // Light divider between questions
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

  // Sanitise filename
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
  const totalCorrect = flashcards.filter((f) => f.is_correct).length;
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
                      {totalCorrect} of {totalQuestions} correct · Grade {score?.grade || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Topic Breakdown (compact) */}
              {Object.keys(topics || {}).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Topics</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(topics).map(([name, data]) => {
                      const topicPct = data.total > 0 ? Math.round((data.scored / data.total) * 100) : 0;
                      const bgColor = topicPct >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : topicPct >= 60 ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-red-50 text-red-700 border-red-200";
                      return (
                        <span key={name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${bgColor}`}>
                          {name} <span className="opacity-70">{topicPct}%</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider */}
              <hr className="border-slate-200" />

              {/* Questions List */}
              <div className="space-y-4">
                {flashcards.map((card, idx) => {
                  const isCorrect = card.is_correct;
                  return (
                    <div
                      key={card.question_id || idx}
                      className={`rounded-xl border p-4 space-y-3 ${
                        isCorrect
                          ? "bg-emerald-50/50 border-emerald-200"
                          : "bg-red-50/50 border-red-200"
                      }`}
                    >
                      {/* Question header */}
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center mt-0.5 ${
                          isCorrect ? "bg-emerald-100" : "bg-red-100"
                        }`}>
                          {isCorrect ? (
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>

                        {/* Question text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-400 mb-1">Question {idx + 1}</p>
                          <p className="text-sm font-medium text-slate-800 leading-relaxed">
                            {card.question_text || "Question"}
                          </p>
                        </div>
                      </div>

                      {/* Answers */}
                      <div className="ml-10 space-y-2">
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
                            <span className="font-medium">{card.child_answer || "No answer"}</span>
                          </div>
                        </div>

                        {/* Correct answer (only if wrong) */}
                        {!isCorrect && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-100/70 text-emerald-800">
                            <span className="font-semibold text-xs mt-0.5 flex-shrink-0">✓</span>
                            <div>
                              <span className="text-xs font-medium opacity-70">Correct answer: </span>
                              <span className="font-medium">{card.correct_answer || "—"}</span>
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
