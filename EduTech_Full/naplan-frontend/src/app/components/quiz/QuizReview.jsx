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
    let answered = 0, unanswered = 0, flaggedCount = 0;
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.answered}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">Answered</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-500">{stats.unanswered}</p>
            <p className="text-xs text-slate-500 font-medium mt-1">Unanswered</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.flaggedCount}</p>
            <p className="text-xs text-amber-600 font-medium mt-1">Flagged</p>
          </div>
        </div>

        {/* Question Grid */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">All Questions</h3>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {questions.map((q, idx) => {
              const a = answers[q.question_id];
              const isAnswered = a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
              const isFlagged = flagged.has(q.question_id);

              let bgClass = "bg-slate-100 text-slate-500 hover:bg-slate-200";
              if (isFlagged && isAnswered) bgClass = "bg-amber-100 text-amber-700 border border-amber-300";
              else if (isFlagged) bgClass = "bg-amber-50 text-amber-600 border border-amber-300";
              else if (isAnswered) bgClass = "bg-emerald-100 text-emerald-700";

              return (
                <button
                  key={idx}
                  onClick={() => onGoToQuestion(idx)}
                  className={`w-full aspect-square rounded-lg text-xs font-semibold transition-all ${bgClass}`}
                  title={`Q${idx + 1}: ${isAnswered ? "Answered" : "Unanswered"}${isFlagged ? " (Flagged)" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100" /> Answered</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Flagged</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100" /> Unanswered</span>
          </div>
        </div>

        {/* Warning for unanswered */}
        {stats.unanswered > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">
                You have {stats.unanswered} unanswered question{stats.unanswered > 1 ? "s" : ""}.
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Unanswered questions will be scored as incorrect. Click a question above to go back.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Back to Quiz
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
          >
            Submit Answers
          </button>
        </div>

        {/* Confirmation Modal */}
        {confirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800">Submit your quiz?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {stats.unanswered > 0
                    ? `You still have ${stats.unanswered} unanswered question${stats.unanswered > 1 ? "s" : ""}. They will be scored as incorrect.`
                    : "You've answered all questions. Ready to submit?"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={() => { setConfirmOpen(false); onSubmit(); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
