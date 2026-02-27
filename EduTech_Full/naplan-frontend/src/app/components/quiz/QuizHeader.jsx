/**
 * QuizHeader.jsx
 *
 * Sticky header during quiz-taking. Shows:
 *   - Quiz name
 *   - Progress bar + question count
 *   - Countdown timer (if timed)
 *   - Cancel button
 *
 * Place in: src/app/components/quiz/QuizHeader.jsx
 */

import { useMemo } from "react";

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function QuizHeader({ quizName, currentIdx, totalQuestions, answeredCount, timeLeft, onCancel }) {
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const timeStr = formatTime(timeLeft);

  const timerColor = useMemo(() => {
    if (timeLeft === null) return "";
    if (timeLeft <= 60) return "text-red-600 bg-red-50 border-red-200 animate-pulse";
    if (timeLeft <= 300) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  }, [timeLeft]);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-3xl mx-auto px-4 md:px-8">
        {/* Top row */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onCancel}
              className="flex-shrink-0 p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Exit Quiz"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h1 className="text-sm font-semibold text-slate-800 truncate">{quizName}</h1>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Question counter */}
            <span className="text-xs font-medium text-slate-500">
              {currentIdx + 1} / {totalQuestions}
            </span>

            {/* Timer */}
            {timeStr && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono font-semibold ${timerColor}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {timeStr}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="pb-2">
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {answeredCount} of {totalQuestions} answered
          </p>
        </div>
      </div>
    </header>
  );
}
