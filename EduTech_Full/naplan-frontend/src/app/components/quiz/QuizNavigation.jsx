/**
 * QuizNavigation.jsx
 *
 * Bottom navigation bar during quiz-taking:
 *   - Prev / Next buttons
 *   - Question grid (jump to any question)
 *   - Review & Submit button
 *
 * Place in: src/app/components/quiz/QuizNavigation.jsx
 */

import { useState } from "react";

export default function QuizNavigation({ currentIdx, totalQuestions, questions, answers, flagged, onPrev, onNext, onGoTo, onReview, unansweredCount }) {
  const [showGrid, setShowGrid] = useState(false);

  return (
    <>
      {/* Question Grid Overlay */}
      {showGrid && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center" onClick={() => setShowGrid(false)}>
          <div
            className="w-full max-w-3xl bg-white rounded-t-2xl shadow-2xl p-6 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Jump to Question</h3>
              <button onClick={() => setShowGrid(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-2">
              {questions.map((q, idx) => {
                const a = answers[q.question_id];
                const isAnswered = a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
                const isFlagged = flagged.has(q.question_id);
                const isCurrent = idx === currentIdx;

                let bgClass = "bg-slate-100 text-slate-500 hover:bg-slate-200";
                if (isCurrent) bgClass = "bg-indigo-600 text-white ring-2 ring-indigo-300";
                else if (isFlagged) bgClass = "bg-amber-100 text-amber-700 border border-amber-300";
                else if (isAnswered) bgClass = "bg-emerald-100 text-emerald-700";

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onGoTo(idx);
                      setShowGrid(false);
                    }}
                    className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${bgClass}`}
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
                <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200" /> Unanswered
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="sticky bottom-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          {/* Left: Prev */}
          <button
            onClick={onPrev}
            disabled={currentIdx === 0}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              currentIdx === 0
                ? "text-slate-300 cursor-not-allowed"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Prev
          </button>

          {/* Center: Grid toggle */}
          <button
            onClick={() => setShowGrid(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            </svg>
            Questions
          </button>

          {/* Right: Next or Review */}
          {currentIdx < totalQuestions - 1 ? (
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all"
            >
              Next
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onReview}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all"
            >
              Review
              {unansweredCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                  {unansweredCount} left
                </span>
              )}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
