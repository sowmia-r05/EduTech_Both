/**
 * QuizResult.jsx
 *
 * Post-submission result screen. Shows:
 *   - Score & grade (instant for MCQ)
 *   - Topic breakdown
 *   - "Generating AI feedback..." polling for writing quizzes
 *   - Link back to dashboard
 *
 * Place in: src/app/components/quiz/QuizResult.jsx
 */

import { useMemo } from "react";

/* ─── Score Ring SVG ─── */
function ScoreRing({ percentage }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage >= 85 ? "#059669" : percentage >= 70 ? "#d97706" : percentage >= 50 ? "#2563eb" : "#dc2626";

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-800">{percentage}%</span>
      </div>
    </div>
  );
}

/* ─── Topic Breakdown Bar ─── */
function TopicBar({ name, scored, total }) {
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium truncate">{name}</span>
        <span className="text-slate-500 text-xs flex-shrink-0 ml-2">
          {scored}/{total} ({pct}%)
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN: QuizResult
   ═══════════════════════════════════════ */
export default function QuizResult({ result, quizName, onClose }) {
  const score = result?.score || {};
  const topics = result?.topic_breakdown || {};
  const isWriting = result?.is_writing;
  const aiStatus = result?.ai_status;

  const gradeEmoji = useMemo(() => {
    const p = score.percentage || 0;
    if (p >= 90) return { emoji: "\u{1F31F}", label: "Outstanding!" };
    if (p >= 80) return { emoji: "\u{1F389}", label: "Great job!" };
    if (p >= 70) return { emoji: "\u{1F44D}", label: "Good work!" };
    if (p >= 50) return { emoji: "\u{1F4AA}", label: "Keep practicing!" };
    return { emoji: "\u{1F4DA}", label: "More practice needed" };
  }, [score.percentage]);

  const topicEntries = Object.entries(topics).sort((a, b) => {
    const pA = a[1].total > 0 ? a[1].scored / a[1].total : 0;
    const pB = b[1].total > 0 ? b[1].scored / b[1].total : 0;
    return pA - pB; // Weakest first
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50 px-4 py-8">
      <div className="max-w-xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Quiz Complete</p>
          <h1 className="text-xl font-bold text-slate-800">{quizName}</h1>
        </div>

        {/* Score Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
          <div className="flex justify-center">
            <ScoreRing percentage={score.percentage || 0} />
          </div>
          <div>
            <p className="text-4xl mb-1">{gradeEmoji.emoji}</p>
            <p className="text-lg font-bold text-slate-800">{gradeEmoji.label}</p>
            <p className="text-sm text-slate-500 mt-1">
              {score.points || 0} / {score.available || 0} points &middot; Grade {score.grade || "—"}
            </p>
          </div>
        </div>

        {/* Topic Breakdown */}
        {topicEntries.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Topic Breakdown</h3>
            <div className="space-y-3">
              {topicEntries.map(([name, data]) => (
                <TopicBar key={name} name={name} scored={data.scored} total={data.total} />
              ))}
            </div>
          </div>
        )}

        {/* Writing AI Feedback Status */}
        {isWriting && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6 text-center space-y-3">
            {aiStatus === "done" ? (
              <>
                <div className="w-12 h-12 mx-auto bg-violet-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-violet-800">AI Feedback Ready!</p>
                <p className="text-xs text-violet-600">Your personalised writing feedback is available on the dashboard.</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto bg-violet-100 rounded-full flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm font-semibold text-violet-800">Generating AI Feedback...</p>
                <p className="text-xs text-violet-600">
                  Our AI is analysing your writing. This usually takes 1-2 minutes. You can check back on the dashboard.
                </p>
              </>
            )}
          </div>
        )}

        {/* Duration */}
        {result?.duration_sec && (
          <div className="text-center text-xs text-slate-400">
            Completed in {Math.floor(result.duration_sec / 60)}m {result.duration_sec % 60}s
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
