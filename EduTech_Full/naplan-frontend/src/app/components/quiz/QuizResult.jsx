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

function ScoreRing({ percentage }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color = percentage >= 85 ? "#059669" : percentage >= 70 ? "#d97706" : percentage >= 50 ? "#2563eb" : "#dc2626";

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
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

function TopicBar({ name, scored, total }) {
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium truncate">{name}</span>
        <span className="text-slate-500 text-xs flex-shrink-0 ml-2">{scored}/{total} ({pct}%)</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function QuizResult({ result, quizName, onClose }) {
  const score = result?.score || {};
  const topics = result?.topic_breakdown || {};
  const isWriting = result?.is_writing;
  const aiStatus = result?.ai_status;

  const gradeEmoji = useMemo(() => {
    const p = score.percentage || 0;
    if (p >= 90) return { emoji: "🌟", label: "Outstanding!" };
    if (p >= 80) return { emoji: "🎉", label: "Great job!" };
    if (p >= 70) return { emoji: "👍", label: "Good work!" };
    if (p >= 50) return { emoji: "💪", label: "Keep practicing!" };
    return { emoji: "📚", label: "More practice needed" };
  }, [score.percentage]);

  const topicEntries = Object.entries(topics).sort((a, b) => {
    const pA = a[1].total > 0 ? a[1].scored / a[1].total : 0;
    const pB = b[1].total > 0 ? b[1].scored / b[1].total : 0;
    return pA - pB; // Weakest first
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8">
      <div className="max-w-xl mx-auto space-y-8">
        {/* Score Header */}
        <div className="text-center space-y-4">
          <div className="text-4xl">{gradeEmoji.emoji}</div>
          <h1 className="text-2xl font-bold text-slate-800">{gradeEmoji.label}</h1>
          <p className="text-sm text-slate-500">{quizName}</p>
        </div>

        {/* Score Ring */}
        {!isWriting && (
          <div className="flex justify-center">
            <ScoreRing percentage={score.percentage || 0} />
          </div>
        )}

        {/* Score Details */}
        {!isWriting && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-lg font-bold text-slate-800">{score.points || 0}/{score.available || 0}</p>
              <p className="text-xs text-slate-500 mt-1">Points</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-lg font-bold text-slate-800">{score.grade || "—"}</p>
              <p className="text-xs text-slate-500 mt-1">Grade</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-lg font-bold ${score.pass ? "text-emerald-600" : "text-red-600"}`}>
                {score.pass ? "Pass" : "Fail"}
              </p>
              <p className="text-xs text-slate-500 mt-1">Status</p>
            </div>
          </div>
        )}

        {/* Writing: AI Processing Notice */}
        {isWriting && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-sm font-semibold text-indigo-800 mt-4">AI Coach is evaluating your writing...</h3>
            <p className="text-xs text-indigo-600 mt-1">
              This usually takes 30-60 seconds. You can close this and check back later from your dashboard.
            </p>
          </div>
        )}

        {/* Topic Breakdown */}
        {topicEntries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Topic Breakdown</h3>
            <div className="space-y-3">
              {topicEntries.map(([name, data]) => (
                <TopicBar key={name} name={name} scored={data.scored} total={data.total} />
              ))}
            </div>
          </div>
        )}

        {/* AI Feedback Status */}
        {aiStatus && aiStatus !== "done" && !isWriting && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-indigo-700">
              AI Coach feedback is being generated. Check your dashboard in a minute for personalized tips!
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="text-center pt-4">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
