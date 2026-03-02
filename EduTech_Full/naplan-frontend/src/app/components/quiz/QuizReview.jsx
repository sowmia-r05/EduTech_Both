/**
 * QuizReview.jsx
 *
 * Pre-submission review screen. Shows:
 *   - Summary of answered/unanswered/flagged questions
 *   - Grid of all questions with status
 *   - Final submit button with confirmation
 *
 * Place in: src/app/components/quiz/QuizReview.jsx
 */

import { useState, useMemo } from "react";

export default function QuizReview({ questions, answers, flagged, onGoToQuestion, onSubmit, onBack }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stats = useMemo(() => {
    let answered = 0,
      unanswered = 0,
      flaggedCount = 0;
    questions.forEach((q) => {
      const a = answers[q.question_id];
      const hasAnswer = a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
      if (hasAnswer) answered++;
      else unanswered++;
      if (flagged.has(q.question_id)) flaggedCount++;
    });
    return { answered, unanswered, flaggedCount };
  }, [questions, answers, flagged]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800">Review Your Answers</h2>
          <p className="text-sm text-slate-500 mt-2">
            Check your answers before submitting. Click any question to go back and change it.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-700">{stats.answered}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">Answered</p>
          </div>
          <div className={`rounded-xl p-4 text-center border ${stats.unanswered > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
            <p className={`text-2xl font-bold ${stats.unanswered > 0 ? "text-red-700" : "text-slate-400"}`}>{stats.unanswered}</p>
            <p className={`text-xs font-medium mt-1 ${stats.unanswered > 0 ? "text-red-600" : "text-slate-400"}`}>Unanswered</p>
          </div>
          <div className={`rounded-xl p-4 text-center border ${stats.flaggedCount > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
            <p className={`text-2xl font-bold ${stats.flaggedCount > 0 ? "text-amber-700" : "text-slate-400"}`}>{stats.flaggedCount}</p>
            <p className={`text-xs font-medium mt-1 ${stats.flaggedCount > 0 ? "text-amber-600" : "text-slate-400"}`}>Flagged</p>
          </div>
        </div>

        {/* Question Grid */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">All Questions</h3>
          <div className="grid grid-cols-8 sm:grid-cols-10 gap-2">
            {questions.map((q, idx) => {
              const a = answers[q.question_id];
              const isAnswered = a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
              const isFlagged = flagged.has(q.question_id);

              let bgClass = "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100";
              if (isAnswered && isFlagged) bgClass = "bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200";
              else if (isAnswered) bgClass = "bg-emerald-100 text-emerald-700 hover:bg-emerald-200";
              else if (isFlagged) bgClass = "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100";

              return (
                <button
                  key={idx}
                  onClick={() => onGoToQuestion(idx)}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${bgClass}`}
                  title={`Question ${idx + 1}${isFlagged ? " (flagged)" : ""}${!isAnswered ? " (unanswered)" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Answered
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Flagged
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Unanswered
            </span>
          </div>
        </div>

        {/* Warning if unanswered */}
        {stats.unanswered > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                You have {stats.unanswered} unanswered question{stats.unanswered !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Unanswered questions will be scored as incorrect. Click on a red question above to answer it.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex-1 px-6 py-3 border border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Back to Quiz
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex-1 px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            Submit Quiz
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto bg-indigo-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800">Submit your quiz?</h3>
              <p className="text-sm text-slate-500 mt-2">
                {stats.unanswered > 0
                  ? `You still have ${stats.unanswered} unanswered question${stats.unanswered !== 1 ? "s" : ""}. Once submitted, you cannot change your answers.`
                  : "Once submitted, you cannot change your answers. Make sure you've reviewed everything."}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  onSubmit();
                }}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
