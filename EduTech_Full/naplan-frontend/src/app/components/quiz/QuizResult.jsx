/**
 * QuizResult.jsx
 * Place in: src/app/components/quiz/QuizResult.jsx
 *
 * ✅ FIX: handleViewAIFeedback now fetches child status live from /api/child/me
 *         on mount so it never uses a stale localStorage value. Priority order:
 *           1. liveStatus      — fresh DB fetch on mount  ← NEW, most accurate
 *           2. childStatusProp — passed from ChildDashboard's own DB fetch
 *           3. cp?.status      — localStorage (stale after a purchase)
 *           4. "trial"         — safe fallback
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import AnswersModal from "./AnswersModal";

/* ─── Score Ring SVG ─── */
function ScoreRing({ percentage }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color =
    percentage >= 85 ? "#059669" :
    percentage >= 70 ? "#d97706" :
    percentage >= 50 ? "#2563eb" : "#dc2626";

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none" stroke={color} strokeWidth="8"
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

/* ─── Topic Breakdown Row ─── */
function TopicRow({ name, scored, total }) {
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";
  const textColor = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500";

  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-slate-700 font-medium">{name}</span>
        <span className={`text-xs font-semibold ${textColor}`}>{scored}/{total} ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Collapsible Topic Breakdown ─── */
function TopicBreakdown({ topicEntries }) {
  const [open, setOpen] = useState(false);
  if (topicEntries.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-800">Topic Breakdown</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {topicEntries.length} topics
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${open ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-4">
          {topicEntries.map(([name, data]) => (
            <TopicRow key={name} name={name} scored={data.scored} total={data.total} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Icons ─── */
const icons = {
  answers: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  ai: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  analytics: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  chevron: (
    <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
};

/* ═══════════════════════════════════════
   MAIN: QuizResult
   ═══════════════════════════════════════ */
export default function QuizResult({ result, quizName, violations = 0, onClose, childStatus: childStatusProp }) {
  const navigate = useNavigate();
  const { user, childProfile, apiFetch } = useAuth();

  const score     = result?.score || {};
  const topics    = result?.topic_breakdown || {};
  const isWriting = result?.is_writing;
  const aiStatus  = result?.ai_status;

  const [showAnswers, setShowAnswers] = useState(false);

  // ✅ FIX: fetch live status from DB on mount — never trust localStorage alone
  const [liveStatus, setLiveStatus] = useState(null);

  const attemptId = result?.attempt_id || result?.response_id || result?.responseId || null;

  const authRef = useRef({ user, childProfile });
  useEffect(() => { authRef.current = { user, childProfile }; });

  // Fetch the child's current status from the API as soon as the result page opens.
  // This ensures an "active" subscription that was just purchased is reflected immediately.
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/child/me");
        if (res.ok) {
          const data = await res.json();
          // Handle multiple possible field shapes returned by the API
          const s =
            data?.status              ||
            data?.child?.status       ||
            data?.profile?.status     ||
            data?.data?.status        ||
            null;
          if (s) setLiveStatus(s);
        }
      } catch (_) {
        // Silently ignore — the fallback chain below will handle it
      }
    })();
  }, [apiFetch]);

  const handleViewAIFeedback = useCallback(() => {
    if (!attemptId) return;
    const { childProfile: cp, user: u } = authRef.current;

    // ✅ Priority — always use the freshest available value:
    //   1. liveStatus      — just fetched from DB on mount       ← most accurate
    //   2. childStatusProp — passed from ChildDashboard's DB fetch
    //   3. cp?.status      — localStorage (stale after purchase)
    //   4. "trial"         — safe fallback
    const resolvedStatus = liveStatus || childStatusProp || cp?.status || "trial";

    const resolvedChildId =
      cp?.child_id  || cp?.id    || cp?.childId  ||
      u?.child_id   || u?.childId || null;

    const params = new URLSearchParams({ r: attemptId });
    if (u?.username)     params.set("username",  u.username);
    if (result?.subject) params.set("subject",   result.subject);
    if (quizName)        params.set("quiz_name", quizName);
    params.set("status", resolvedStatus);
    if (resolvedChildId) params.set("child_id", String(resolvedChildId));

    const hashPath = isWriting
      ? "writing-feedback/result"
      : "NonWritingLookupQuizResults/results";
    window.location.href = `${window.location.origin}/#/${hashPath}?${params}`;
  }, [attemptId, result?.subject, quizName, isWriting, childStatusProp, liveStatus]);

  const handleViewAnalytics = useCallback(() => navigate("/student-analytics"), [navigate]);

  const gradeLabel = useMemo(() => {
    const p = score.percentage || 0;
    if (p >= 90) return "Outstanding!";
    if (p >= 80) return "Great job!";
    if (p >= 70) return "Good work!";
    if (p >= 50) return "Keep practicing!";
    return "More practice needed";
  }, [score.percentage]);

  const topicEntries = Object.entries(topics).sort((a, b) => {
    const pA = a[1].total > 0 ? a[1].scored / a[1].total : 0;
    const pB = b[1].total > 0 ? b[1].scored / b[1].total : 0;
    return pA - pB;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="text-center space-y-1 pb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Quiz Complete</p>
          <h1 className="text-xl font-bold text-slate-800">{quizName}</h1>
        </div>

        {/* ── Score Card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
          <div className="flex justify-center">
            <ScoreRing percentage={score.percentage || 0} />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">{gradeLabel}</p>
            <p className="text-sm text-slate-500 mt-1">
              {score.points || 0} / {score.available || 0} points &middot; Grade {score.grade || "—"}
            </p>
          </div>
        </div>

        {/* ── Collapsible Topic Breakdown ── */}
        <TopicBreakdown topicEntries={topicEntries} />

        {/* ── Writing AI Feedback Status ── */}
        {isWriting && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 flex-shrink-0 bg-violet-100 rounded-full flex items-center justify-center">
              {aiStatus === "done" ? (
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-800">
                {aiStatus === "done" ? "AI Feedback Ready!" : "Generating AI Feedback..."}
              </p>
              <p className="text-xs text-violet-600 mt-0.5">
                {aiStatus === "done"
                  ? "Your personalised writing feedback is available on the dashboard."
                  : "Our AI is analysing your writing. Usually takes 1–2 minutes."}
              </p>
            </div>
          </div>
        )}

        {/* ── Duration ── */}
        {result?.duration_sec && (
          <p className="text-center text-xs text-slate-400">
            Completed in {Math.floor(result.duration_sec / 60)}m {result.duration_sec % 60}s
          </p>
        )}

        {/* ── Proctoring Summary ── */}
        {violations > 0 ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 bg-rose-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-800">
                {violations} exam violation{violations !== 1 ? "s" : ""} recorded
              </p>
              <p className="text-xs text-rose-600 mt-0.5">Tab switches or fullscreen exits were detected.</p>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 bg-emerald-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Clean exam session</p>
              <p className="text-xs text-emerald-600 mt-0.5">No tab switches or fullscreen exits detected. Great focus!</p>
            </div>
          </div>
        )}

        {/* ══ Actions ══ */}
        <div className="space-y-2.5 pt-1 pb-6">

          {/* Top row — View Answers + View Analytics side by side */}
          <div className="grid grid-cols-2 gap-2.5">
            {attemptId && !isWriting ? (
              <button
                onClick={() => setShowAnswers(true)}
                className="group inline-flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
              >
                <span className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-600">
                  {icons.answers}
                </span>
                <span className="text-xs font-semibold text-slate-700">View Answers</span>
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleViewAnalytics}
              className="group inline-flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <span className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-600">
                {icons.analytics}
              </span>
              <span className="text-xs font-semibold text-slate-700">View Progress</span>
            </button>
          </div>

          {/* View Test Insights — full-width primary */}
          {attemptId && (
            <button
              onClick={handleViewAIFeedback}
              className="group w-full inline-flex items-center justify-between px-5 py-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-300 transition-all shadow-sm"
            >
              <span className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors text-indigo-600">
                  {icons.ai}
                </span>
                <span className="text-sm font-semibold text-indigo-800">
                  View Test Insights
                  {/* Show a small "active" badge so we can confirm status is resolved */}
                  {liveStatus && liveStatus !== "trial" && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-700 uppercase tracking-wide">
                      {liveStatus}
                    </span>
                  )}
                </span>
              </span>
              {icons.chevron}
            </button>
          )}
        </div>

      </div>

      {/* ═══ Answers Modal ═══ */}
      {showAnswers && (
        <AnswersModal
          attemptId={attemptId}
          quizName={quizName}
          score={score}
          topics={topics}
          onClose={() => setShowAnswers(false)}
        />
      )}
    </div>
  );
}