import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchCumulativeFeedback, refreshCumulativeFeedback } from "@/app/utils/api-children";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";

// ✅ Lucide icons for subjects
import { BookOpen, PenLine, Hash, Languages, Library, LayoutDashboard, ClipboardList } from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

const SUBJECT_COLORS = {
  Reading: "#6366F1",
  Writing: "#EF4444",
  Numeracy: "#10B981",
  Language: "#F59E0B",
};
const SUBJECT_BG = {
  Reading: "bg-indigo-500",
  Writing: "bg-red-500",
  Numeracy: "bg-emerald-500",
  Language: "bg-amber-500",
};
const SUBJECT_LIGHT_BG = {
  Reading: "bg-indigo-50",
  Writing: "bg-red-50",
  Numeracy: "bg-emerald-50",
  Language: "bg-amber-50",
};
const SUBJECT_TEXT = {
  Reading: "text-indigo-600",
  Writing: "text-red-600",
  Numeracy: "text-emerald-600",
  Language: "text-amber-600",
};
const SUBJECT_BORDER = {
  Reading: "border-indigo-300",
  Writing: "border-red-300",
  Numeracy: "border-emerald-300",
  Language: "border-amber-300",
};

// ✅ Lucide icon map — replaces SUBJECT_EMOJI
const SUBJECT_ICON = {
  Reading:  BookOpen,
  Writing:  PenLine,
  Numeracy: Hash,
  Language: Languages,
  Other:    Library,
  All:      LayoutDashboard,
};

/* ─── Helper: renders a subject icon safely as JSX ─── */
function SubjectIconEl({ subject, className = "w-4 h-4" }) {
  const Icon = SUBJECT_ICON[subject] || Library;
  return <Icon className={className} />;
}

const TIME_FILTERS = [
  { label: "This Week",     days: 7 },
  { label: "This Month",    days: 30 },
  { label: "Last 3 Months", days: 90 },
  { label: "All Time",      days: Infinity },
];

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function buildSubjectTrendData(tests) {
  return [...tests]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((t, i) => ({
      attempt: i + 1,
      score: t.score,
      name: t.name,
      date: new Date(t.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    }));
}

function buildAllSubjectsTrendData(tests) {
  const monthMap = {};
  tests.forEach((t) => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
    if (!monthMap[key]) {
      monthMap[key] = { key, month: label };
      SUBJECTS.forEach((s) => { monthMap[key][`${s}_sum`] = 0; monthMap[key][`${s}_count`] = 0; });
    }
    const subj = t.subject;
    if (SUBJECTS.includes(subj)) {
      monthMap[key][`${subj}_sum`] += t.score;
      monthMap[key][`${subj}_count`] += 1;
    }
  });
  return Object.values(monthMap)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => {
      const point = { month: m.month };
      SUBJECTS.forEach((s) => {
        point[s] = m[`${s}_count`] > 0 ? Math.round(m[`${s}_sum`] / m[`${s}_count`]) : null;
      });
      return point;
    });
}

function buildSubjectComparison(tests) {
  return SUBJECTS.map((subj) => {
    const subjectTests = tests.filter((t) => t.subject === subj);
    const avg = subjectTests.length
      ? Math.round(subjectTests.reduce((s, t) => s + t.score, 0) / subjectTests.length)
      : 0;
    return { subject: subj, score: avg, count: subjectTests.length, color: SUBJECT_COLORS[subj] };
  });
}

function buildTopicBreakdown(tests) {
  const quizMap = {};
  tests.forEach((t) => {
    const key = t.name || "Unknown Quiz";
    if (!quizMap[key]) quizMap[key] = { name: key, sum: 0, count: 0 };
    quizMap[key].sum += t.score;
    quizMap[key].count += 1;
  });
  return Object.values(quizMap)
    .map((q) => ({ name: q.name, score: Math.round(q.sum / q.count), count: q.count }))
    .sort((a, b) => b.score - a.score);
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-6 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, light = false }) {
  return (
    <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${light ? "text-white/80" : "text-slate-400"}`}>
      {children}
    </h3>
  );
}

function KPI({ title, value, accent = false, warning = false, subject = null }) {
  const accentColor = subject
    ? SUBJECT_TEXT[subject]
    : accent ? "text-indigo-600" : warning ? "text-rose-500" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
      <span className={`text-3xl font-bold ${accentColor}`}>{value}</span>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="h-3 w-20 bg-slate-100 rounded mb-3 animate-pulse" />
      <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
    </div>
  );
}

function ChartSkeleton({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
        <LayoutDashboard className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}

function SummaryRow({ label, value, positive }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${positive === true ? "text-emerald-600" : positive === false ? "text-rose-500" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AI COACH PANEL COMPONENTS
   ═══════════════════════════════════════════════════════════ */

const TREND_CONFIG = {
  improving: { icon: "📈", label: "Improving",    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  stable:    { icon: "➡️",  label: "Stable",       color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
  declining: { icon: "📉", label: "Declining",    color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200" },
  new:       { icon: "🌱", label: "Just Started", color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200" },
};

function TrendBadge({ trend }) {
  const cfg = TREND_CONFIG[trend] || TREND_CONFIG.new;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-4 bg-slate-200 rounded w-full" />
      <div className="h-4 bg-slate-200 rounded w-5/6" />
      <div className="h-3 bg-slate-100 rounded w-1/2 mt-6" />
      <div className="flex gap-2">
        <div className="h-7 bg-slate-100 rounded-full w-24" />
        <div className="h-7 bg-slate-100 rounded-full w-32" />
      </div>
    </div>
  );
}

function FeedbackSection({ icon, title, children, color = "text-slate-700" }) {
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${color}`}>
        <span>{icon}</span>{title}
      </h4>
      {children}
    </div>
  );
}

function AICumulativeCoachPanel({ feedbackDoc, subject, onRefresh, refreshing }) {
  const status = feedbackDoc?.status;
  const feedback = feedbackDoc?.feedback;
  const subjectColor = subject !== "All" ? SUBJECT_TEXT[subject] : "text-indigo-600";
  const subjectBgLight = subject !== "All" ? SUBJECT_LIGHT_BG[subject] : "bg-indigo-50";
  const subjectBorderColor = subject !== "All" ? SUBJECT_BORDER[subject] : "border-indigo-200";

  if (!feedbackDoc || status === "pending" || status === "generating" || refreshing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Generating AI coaching report…</span>
        </div>
        <FeedbackSkeleton />
        <p className="text-xs text-slate-400">
          {status === "generating" ? "Analysing your quiz history with Gemini…" : "Starting up — this takes a moment on first load"}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-rose-600 text-sm">
          <span>⚠️</span><span className="font-medium">Feedback generation failed</span>
        </div>
        <p className="text-xs text-slate-500">{feedbackDoc.status_message || "Unknown error"}</p>
        <button onClick={onRefresh} className="mt-2 text-xs px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition">
          Try Again
        </button>
      </div>
    );
  }

  if (!feedback || (!feedback.summary && !feedback.strengths?.length)) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm space-y-2">
        <div className="text-3xl">🤖</div>
        <p>Take more {subject !== "All" ? subject : ""} quizzes to unlock your AI coaching report!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <TrendBadge trend={feedback.trend || "new"} />
        {feedbackDoc.attempt_count > 0 && (
          <span className="text-xs text-slate-400">
            Based on {feedbackDoc.attempt_count} quiz{feedbackDoc.attempt_count !== 1 ? "zes" : ""}
            {feedbackDoc.average_score ? ` · Avg ${Math.round(feedbackDoc.average_score)}%` : ""}
          </span>
        )}
      </div>

      {feedback.summary && (
        <p className="text-sm text-slate-700 leading-relaxed">{feedback.summary}</p>
      )}

      {feedback.strengths?.length > 0 && (
        <FeedbackSection icon="✅" title="Strengths" color="text-emerald-700">
          <ul className="space-y-1.5">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-0.5 text-emerald-500 flex-shrink-0">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}

      {feedback.areas_for_improvement?.length > 0 && (
        <FeedbackSection icon="🎯" title="Focus Areas" color="text-amber-700">
          <div className="space-y-2.5">
            {feedback.areas_for_improvement.map((area, i) => (
              <div key={i} className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                <p className="text-sm font-medium text-amber-800 mb-1">{area.issue}</p>
                <p className="text-xs text-amber-700 leading-relaxed">{area.how_to_improve}</p>
              </div>
            ))}
          </div>
        </FeedbackSection>
      )}

      {feedback.study_tips?.length > 0 && (
        <FeedbackSection icon="📚" title="Study Tips" color="text-indigo-700">
          <ol className="space-y-1.5">
            {feedback.study_tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-0.5 text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>
                <span>{tip}</span>
              </li>
            ))}
          </ol>
        </FeedbackSection>
      )}

      {feedback.topic_highlights?.length > 0 && (
        <FeedbackSection icon="💡" title="Topic Highlights" color="text-violet-700">
          <ul className="space-y-1.5">
            {feedback.topic_highlights.map((h, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-violet-400 flex-shrink-0">→</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </FeedbackSection>
      )}

      {feedback.encouragement && (
        <div className={`rounded-xl p-4 ${subjectBgLight} border ${subjectBorderColor}`}>
          <p className={`text-sm font-medium italic ${subjectColor}`}>
            💬 "{feedback.encouragement}"
          </p>
        </div>
      )}

      {feedbackDoc.generated_at && (
        <p className="text-xs text-slate-400 text-right">
          Updated {new Date(feedbackDoc.generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          {feedbackDoc.model ? ` · ${feedbackDoc.model}` : ""}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUBJECT DROPDOWN
   ═══════════════════════════════════════════════════════════ */

function SubjectDropdown({ selectedSubject, onChange, tests }) {
  const [open, setOpen] = useState(false);

  const options = [
    { value: "All", label: "All Subjects", count: tests.length },
    ...SUBJECTS.map((s) => ({
      value: s,
      label: s,
      count: tests.filter((t) => t.subject === s).length,
    })),
  ];

  const selected = options.find((o) => o.value === selectedSubject) || options[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 shadow-sm font-semibold text-sm transition-all
          ${selectedSubject !== "All"
            ? `${SUBJECT_LIGHT_BG[selectedSubject]} ${SUBJECT_BORDER[selectedSubject]} ${SUBJECT_TEXT[selectedSubject]}`
            : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
          }`}
      >
        <SubjectIconEl subject={selected.value} className="w-4 h-4" />
        <span>{selected.label}</span>
        {selected.count > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal
            ${selectedSubject !== "All" ? "bg-white/60" : "bg-slate-100"}`}>
            {selected.count}
          </span>
        )}
        <svg
          className={`w-4 h-4 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                ${opt.value === selectedSubject ? "bg-slate-50 font-semibold" : "hover:bg-slate-50"}
                ${opt.value !== "All" && opt.value === selectedSubject ? SUBJECT_TEXT[opt.value] : "text-slate-700"}
              `}
            >
              <SubjectIconEl subject={opt.value} className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{opt.label}</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUBJECT TABS
   ═══════════════════════════════════════════════════════════ */

function SubjectTabBar({ selectedSubject, onChange, tests }) {
  const options = [
    { value: "All", label: "All Subjects" },
    ...SUBJECTS.map((s) => ({ value: s, label: s })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const count = opt.value === "All"
          ? tests.length
          : tests.filter((t) => t.subject === opt.value).length;
        const isActive = opt.value === selectedSubject;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all
              ${isActive
                ? opt.value === "All"
                  ? "bg-slate-800 text-white border-slate-800 shadow-md"
                  : `${SUBJECT_BG[opt.value]} text-white border-transparent shadow-md`
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
          >
            <SubjectIconEl
              subject={opt.value}
              className={`w-4 h-4 ${isActive ? "text-white" : opt.value !== "All" ? SUBJECT_TEXT[opt.value] : "text-slate-500"}`}
            />
            <span>{opt.label}</span>
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCORE BADGE
   ═══════════════════════════════════════════════════════════ */

function ScoreBadge({ score }) {
  const color =
    score >= 80 ? "bg-emerald-100 text-emerald-700" :
    score >= 60 ? "bg-amber-100 text-amber-700" :
    "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {score}%
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   CUSTOM TOOLTIP FOR SUBJECT TREND
   ═══════════════════════════════════════════════════════════ */

function SubjectTrendTooltip({ active, payload, label, subject }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-xl p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{d?.name || `Attempt ${label}`}</p>
      <p className="text-slate-500 text-xs mb-2">{d?.date}</p>
      <p className={`font-bold text-lg ${SUBJECT_TEXT[subject] || "text-slate-900"}`}>{d?.score}%</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function StudentDashboardAnalytics({
  tests = [],
  displayName = "Student",
  yearLevel = null,
  onBack = null,
  onLogout = null,
  embedded = false,
  childId: childIdProp = null,   // ✅ FIX: accept childId as prop (needed for parent viewing child)
}) {
  const navigate = useNavigate();
  const { logout, logoutChild, childToken, parentToken, user } = useAuth();

  const [timeFilter, setTimeFilter] = useState(3);
  const [selectedSubject, setSelectedSubject] = useState("All");

  const [cumulativeFeedback, setCumulativeFeedback] = useState({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollTimerRef = useRef(null);

  // ✅ FIX: prop takes priority — fixes parent viewing child's analytics (user.childId is null for parents)
  const childId = useMemo(() => {
    if (childIdProp) return childIdProp;
    if (user?.childId) return user.childId;
    if (user?.child_id) return user.child_id;
    return null;
  }, [childIdProp, user]);

  const activeToken = childToken || parentToken || null;

  const loadCumulativeFeedback = useCallback(async () => {
    if (!childId || !activeToken) return;
    try {
      const data = await fetchCumulativeFeedback(activeToken, childId);
      setCumulativeFeedback(data || {});
      const stillGenerating = Object.values(data || {}).some(
        (d) => d.status === "generating" || d.status === "pending"
      );
      if (stillGenerating) {
        pollTimerRef.current = setTimeout(loadCumulativeFeedback, 4000);
      }
    } catch (err) {
      console.warn("Failed to load cumulative feedback:", err.message);
    }
  }, [childId, activeToken]);

  useEffect(() => {
    setFeedbackLoading(true);
    loadCumulativeFeedback().finally(() => setFeedbackLoading(false));
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [loadCumulativeFeedback]);

  const handleRefreshFeedback = useCallback(async () => {
    if (!childId || !activeToken || refreshing) return;
    setRefreshing(true);
    try {
      await refreshCumulativeFeedback(activeToken, childId);
      pollTimerRef.current = setTimeout(loadCumulativeFeedback, 3000);
    } catch (err) {
      console.warn("Refresh failed:", err.message);
    } finally {
      setRefreshing(false);
    }
  }, [childId, activeToken, refreshing, loadCumulativeFeedback]);

  const activeFeedbackDoc = useMemo(() => {
    const key = selectedSubject === "All" ? "Overall" : selectedSubject;
    return cumulativeFeedback[key] || null;
  }, [cumulativeFeedback, selectedSubject]);

  const handleBack = onBack || (() => {
    if (childToken) navigate("/child-dashboard");
    else if (parentToken) navigate("/parent-dashboard");
    else navigate("/");
  });

  const handleLogout = onLogout || (() => {
    if (childToken) logoutChild();
    else logout();
    navigate("/");
  });

  const timeFilteredTests = useMemo(() => {
    const { days } = TIME_FILTERS[timeFilter];
    if (days === Infinity) return tests;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return tests.filter((t) => new Date(t.date) >= cutoff);
  }, [tests, timeFilter]);

  const subjectTests = useMemo(() => {
    if (selectedSubject === "All") return timeFilteredTests;
    return timeFilteredTests.filter((t) => t.subject === selectedSubject);
  }, [timeFilteredTests, selectedSubject]);

  const hasData = subjectTests.length > 0;

  const avgScore = useMemo(() => {
    if (!subjectTests.length) return 0;
    return Math.round(subjectTests.reduce((a, t) => a + t.score, 0) / subjectTests.length);
  }, [subjectTests]);

  const bestScore = useMemo(() => {
    if (!subjectTests.length) return 0;
    return Math.max(...subjectTests.map((t) => t.score));
  }, [subjectTests]);

  const improvement = useMemo(() => {
    if (subjectTests.length < 2) return null;
    const sorted = [...subjectTests].sort((a, b) => new Date(a.date) - new Date(b.date));
    const half = Math.floor(sorted.length / 2);
    const avgFirst = sorted.slice(0, half).reduce((a, t) => a + t.score, 0) / half;
    const avgSecond = sorted.slice(half).reduce((a, t) => a + t.score, 0) / (sorted.length - half);
    return Math.round(avgSecond - avgFirst);
  }, [subjectTests]);

  const comparisonData = useMemo(() => buildSubjectComparison(timeFilteredTests), [timeFilteredTests]);

  const strongest = useMemo(() => {
    const withData = comparisonData.filter((c) => c.count > 0 && c.score >= 50);
    if (withData.length <= 1) return "—";
    return withData.reduce((p, c) => (c.score > p.score ? c : p)).subject;
  }, [comparisonData]);

  const weakest = useMemo(() => {
    const withData = comparisonData.filter((c) => c.count > 0);
    if (!withData.length) return "—";
    return withData.reduce((p, c) => (c.score < p.score ? c : p)).subject;
  }, [comparisonData]);

  const subjectTrendData = useMemo(() => buildSubjectTrendData(subjectTests), [subjectTests]);
  const allSubjectsTrend = useMemo(() => buildAllSubjectsTrendData(timeFilteredTests), [timeFilteredTests]);
  const topicData = useMemo(() => buildTopicBreakdown(subjectTests).slice(0, 8), [subjectTests]);

  const recentAssessments = useMemo(() => {
    return [...subjectTests]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  }, [subjectTests]);

  const activeSubjects = useMemo(
    () => comparisonData.filter((c) => c.count > 0).length,
    [comparisonData]
  );

  const subjectColor = selectedSubject !== "All" ? SUBJECT_COLORS[selectedSubject] : "#6366F1";
  const subjectBg = selectedSubject !== "All" ? SUBJECT_LIGHT_BG[selectedSubject] : "bg-indigo-50";
  const subjectTextClass = selectedSubject !== "All" ? SUBJECT_TEXT[selectedSubject] : "text-indigo-600";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-8 space-y-8">

        {/* ──────────── HEADER ──────────── */}
        <header className="flex flex-col lg:flex-row justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="flex items-start gap-4">
            {!embedded && (
              <button
                onClick={handleBack}
                className="mt-1 inline-flex items-center justify-center w-10 h-10 rounded-xl
                           bg-white border border-slate-200 shadow-sm
                           hover:bg-slate-50 hover:border-slate-300 transition-all"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{displayName}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {yearLevel ? `Year ${yearLevel} · ` : ""}Analytics Dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {TIME_FILTERS.map((f, i) => (
                <button
                  key={f.label}
                  onClick={() => setTimeFilter(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    timeFilter === i ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-700 transition-all"
            >
              Log out
            </button>
          </div>
        </header>

        {/* ──────────── SUBJECT FILTER BAR ──────────── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Filter by Subject</span>
            </div>
            <div className="hidden sm:block">
              <SubjectTabBar selectedSubject={selectedSubject} onChange={setSelectedSubject} tests={timeFilteredTests} />
            </div>
            <div className="sm:hidden">
              <SubjectDropdown selectedSubject={selectedSubject} onChange={setSelectedSubject} tests={timeFilteredTests} />
            </div>
          </div>

          {/* Subject context banner */}
          {selectedSubject !== "All" && (
            <div className={`mt-4 flex items-center gap-3 px-5 py-3 rounded-xl ${subjectBg} border ${SUBJECT_BORDER[selectedSubject]}`}>
              <span className={`${subjectTextClass}`}>
                <SubjectIconEl subject={selectedSubject} className="w-6 h-6" />
              </span>
              <div>
                <p className={`font-bold text-base ${subjectTextClass}`}>{selectedSubject}</p>
                <p className="text-xs text-slate-500">
                  Showing analytics for {selectedSubject} only · {subjectTests.length} assessment{subjectTests.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubject("All")}
                className="ml-auto text-xs text-slate-400 hover:text-slate-700 underline"
              >
                Clear filter
              </button>
            </div>
          )}
        </section>

        {/* ──────────── KPI CARDS ──────────── */}
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {hasData ? (
            <>
              <KPI
                title={selectedSubject === "All" ? "Overall Average" : `${selectedSubject} Average`}
                value={`${avgScore}%`}
                subject={selectedSubject !== "All" ? selectedSubject : null}
                accent={selectedSubject === "All"}
              />
              <KPI
                title="Best Score"
                value={`${bestScore}%`}
                subject={selectedSubject !== "All" ? selectedSubject : null}
              />
              {selectedSubject === "All" ? (
                <>
                  <KPI title="Strongest Subject" value={strongest} accent />
                  <KPI title="Needs Attention" value={weakest} warning />
                </>
              ) : (
                <>
                  <KPI
                    title="Improvement"
                    value={improvement !== null ? `${improvement >= 0 ? "+" : ""}${improvement}%` : "—"}
                    subject={selectedSubject}
                  />
                  <KPI title="Tests Taken" value={String(subjectTests.length)} subject={selectedSubject} />
                </>
              )}
            </>
          ) : (
            <><KPISkeleton /><KPISkeleton /><KPISkeleton /><KPISkeleton /></>
          )}
        </section>

        {/* ──────────── CHARTS ROW ──────────── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardTitle>
              {selectedSubject === "All" ? "Performance Trend (All Subjects)" : `${selectedSubject} Score History`}
            </CardTitle>

            {selectedSubject === "All" ? (
              hasData && allSubjectsTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={allSubjectsTrend}>
                    <defs>
                      {SUBJECTS.map((key) => (
                        <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", padding: "12px 16px" }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    {SUBJECTS.map((key) => (
                      <Area
                        key={key} type="monotone" dataKey={key}
                        stroke={SUBJECT_COLORS[key]} strokeWidth={2.5}
                        fill={`url(#gradient-${key})`}
                        dot={{ r: 4, fill: SUBJECT_COLORS[key] }}
                        activeDot={{ r: 6 }} connectNulls={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartSkeleton message="Take some tests to see your performance trend over time" />
              )
            ) : (
              hasData && subjectTrendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={subjectTrendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="attempt" stroke="#94a3b8" fontSize={12} label={{ value: "Attempt #", position: "insideBottom", offset: -2, fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                    <ReferenceLine y={avgScore} stroke={subjectColor} strokeDasharray="4 4" strokeOpacity={0.5}
                      label={{ value: `Avg: ${avgScore}%`, position: "right", fontSize: 11, fill: subjectColor }} />
                    <Tooltip content={(props) => <SubjectTrendTooltip {...props} subject={selectedSubject} />} />
                    <Line
                      type="monotone" dataKey="score"
                      stroke={subjectColor} strokeWidth={3}
                      dot={{ r: 5, fill: subjectColor, strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : hasData && subjectTrendData.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className={`w-20 h-20 rounded-full ${subjectBg} flex items-center justify-center`}>
                    <span className={`text-3xl font-bold ${subjectTextClass}`}>{subjectTrendData[0].score}%</span>
                  </div>
                  <p className="text-sm text-slate-400">Only 1 attempt so far — take more {selectedSubject} tests to see your trend!</p>
                </div>
              ) : (
                <ChartSkeleton message={`No ${selectedSubject} tests yet — take a quiz to see your score history!`} />
              )
            )}

            {selectedSubject === "All" && hasData && (
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-50">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSubject(s)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: SUBJECT_COLORS[s] }} />
                    {s}
                  </button>
                ))}
                <span className="text-xs text-slate-300 ml-auto">Click a subject to drill down →</span>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>
              {selectedSubject === "All" ? "Subject Comparison" : `${selectedSubject} Quiz Scores`}
            </CardTitle>

            {selectedSubject === "All" ? (
              hasData ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={comparisonData} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="subject" stroke="#94a3b8" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Average"]}
                        contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}
                      />
                      <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                        {comparisonData.map((entry) => (
                          <rect key={entry.subject} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {comparisonData.filter((c) => c.count > 0).map((c) => (
                      <button
                        key={c.subject}
                        onClick={() => setSelectedSubject(c.subject)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition text-left"
                      >
                        <span className={`flex-shrink-0 ${SUBJECT_TEXT[c.subject]}`}>
                          <SubjectIconEl subject={c.subject} className="w-4 h-4" />
                        </span>
                        <span className="text-sm text-slate-700 flex-1">{c.subject}</span>
                        <ScoreBadge score={c.score} />
                        <span className="text-xs text-slate-400">{c.count} tests</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ChartSkeleton message="Complete tests in different subjects to compare" />
              )
            ) : (
              hasData ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {topicData.map((q, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div className={`w-6 h-6 rounded-full ${i === 0 ? SUBJECT_BG[selectedSubject] : "bg-slate-100"} flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-xs font-bold ${i === 0 ? "text-white" : "text-slate-400"}`}>{i + 1}</span>
                      </div>
                      <span className="text-sm text-slate-700 flex-1 truncate" title={q.name}>{q.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${q.score}%`, background: subjectColor }} />
                        </div>
                        <ScoreBadge score={q.score} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ChartSkeleton message={`No ${selectedSubject} quizzes taken yet`} />
              )
            )}
          </Card>
        </section>

        {/* ──────────── SECOND ROW ──────────── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card>
            <CardTitle>
              {selectedSubject === "All" ? "Academic Summary" : `${selectedSubject} Summary`}
            </CardTitle>
            {hasData ? (
              <>
                <div className="space-y-1 text-sm">
                  <SummaryRow label={selectedSubject === "All" ? "Overall Average" : "Subject Average"} value={`${avgScore}%`} />
                  <SummaryRow label="Best Score" value={`${bestScore}%`} />
                  {improvement !== null && (
                    <SummaryRow label="Improvement" value={`${improvement >= 0 ? "+" : ""}${improvement}%`} positive={improvement >= 0} />
                  )}
                  <SummaryRow label={selectedSubject === "All" ? "Total Tests" : `${selectedSubject} Tests`} value={String(subjectTests.length)} />
                  {selectedSubject === "All" && (
                    <SummaryRow label="Subjects Active" value={String(activeSubjects)} />
                  )}
                </div>
                <div className="mt-5">
                  <p className="text-xs text-slate-500 mb-2">Progress Toward Target (85%)</p>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min((avgScore / 85) * 100, 100)}%`,
                        background: selectedSubject !== "All" ? subjectColor : "linear-gradient(to right, #6366F1, #8B5CF6)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {avgScore >= 85 ? "🎉 Target reached!" : `${85 - avgScore}% to go`}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 py-4 text-center">No data yet</div>
            )}
          </Card>

          <Card>
            <CardTitle>Score Distribution</CardTitle>
            {hasData ? (
              <div className="space-y-4">
                {[
                  { label: "High (80%+)",      tests: subjectTests.filter((t) => t.score >= 80),                      color: "bg-emerald-500" },
                  { label: "Mid (50–79%)",      tests: subjectTests.filter((t) => t.score >= 50 && t.score < 80),     color: "bg-amber-500" },
                  { label: "Needs Work (<50%)", tests: subjectTests.filter((t) => t.score < 50),                      color: "bg-rose-500" },
                ].map((bucket) => {
                  const pct = subjectTests.length ? Math.round((bucket.tests.length / subjectTests.length) * 100) : 0;
                  return (
                    <div key={bucket.label}>
                      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                        <span className="font-medium">{bucket.label}</span>
                        <span>{bucket.tests.length} tests ({pct}%)</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${bucket.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400 py-4 text-center">No data yet</div>
            )}
          </Card>

          <Card className={hasData ? "bg-gradient-to-br from-indigo-600/95 to-purple-600/95 text-white shadow-xl" : ""}>
            <CardTitle light={hasData}>Performance Insights</CardTitle>
            {hasData ? (
              <ul className="space-y-4 text-sm leading-relaxed">
                {selectedSubject === "All" ? (
                  <>
                    {strongest !== "—" && <li className="flex items-start gap-2"><span className="mt-0.5">✓</span><span>{strongest} is your strongest subject — keep it up!</span></li>}
                    {weakest !== "—" && weakest !== strongest && <li className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>{weakest} needs more practice — focus here</span></li>}
                    {improvement !== null && improvement > 0 && <li className="flex items-start gap-2"><span className="mt-0.5">📈</span><span>Scores improved by {improvement}% — great progress!</span></li>}
                    {activeSubjects < 4 && <li className="flex items-start gap-2"><span className="mt-0.5">📝</span><span>Try tests in more subjects for a complete picture</span></li>}
                  </>
                ) : (
                  <>
                    {avgScore >= 80 && <li className="flex items-start gap-2"><span className="mt-0.5">🌟</span><span>Excellent {selectedSubject} performance — averaging {avgScore}%!</span></li>}
                    {avgScore < 80 && avgScore >= 60 && <li className="flex items-start gap-2"><span className="mt-0.5">💪</span><span>Good effort in {selectedSubject} — push for 80%+ average!</span></li>}
                    {avgScore < 60 && <li className="flex items-start gap-2"><span className="mt-0.5">📚</span><span>Focus more on {selectedSubject} — regular practice will help a lot.</span></li>}
                    {improvement !== null && improvement > 0 && <li className="flex items-start gap-2"><span className="mt-0.5">📈</span><span>Your {selectedSubject} scores improved by {improvement}% — great momentum!</span></li>}
                    {improvement !== null && improvement <= 0 && <li className="flex items-start gap-2"><span className="mt-0.5">🎯</span><span>Try to build consistency in {selectedSubject} — review your weaker quizzes</span></li>}
                    {subjectTests.length >= 5 && <li className="flex items-start gap-2"><span className="mt-0.5">🏆</span><span>{subjectTests.length} {selectedSubject} tests completed — dedication pays off!</span></li>}
                  </>
                )}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">
                {selectedSubject === "All" ? "Take some tests to see your insights" : `Take a ${selectedSubject} test to unlock insights`}
              </p>
            )}
          </Card>
        </section>

        {/* ──────────── AI CUMULATIVE COACH ──────────── */}
        <section>
          <Card className="border-2 border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">🤖</div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    AI Coach — {selectedSubject === "All" ? "Overall Summary" : `${selectedSubject} Analysis`}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cumulative insights powered by Gemini · updates after every quiz
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Subject quick-switch pills */}
                <div className="hidden sm:flex gap-1.5 flex-wrap">
                  {[{ key: "All", label: "Overall" }, ...SUBJECTS.map((s) => ({ key: s, label: s }))].map(({ key, label }) => {
                    const isActive = (selectedSubject === "All" && key === "All") || selectedSubject === key;
                    const doc = cumulativeFeedback[key === "All" ? "Overall" : key];
                    const isDone = doc?.status === "done";
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedSubject(key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                          ${isActive
                            ? key === "All" ? "bg-indigo-600 text-white border-indigo-600" : `${SUBJECT_BG[key]} text-white border-transparent`
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                          }`}
                      >
                        <SubjectIconEl subject={key} className={`w-3.5 h-3.5 ${isActive ? "text-white" : key !== "All" ? SUBJECT_TEXT[key] : "text-slate-500"}`} />
                        {label}
                        {isDone && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block ml-0.5" title="Ready" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleRefreshFeedback}
                  disabled={refreshing || feedbackLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 transition-all disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            <AICumulativeCoachPanel
              feedbackDoc={activeFeedbackDoc}
              subject={selectedSubject}
              onRefresh={handleRefreshFeedback}
              refreshing={refreshing}
            />

            {/* Subject feedback overview pills (only in "All" view) */}
            {selectedSubject === "All" && Object.keys(cumulativeFeedback).length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Subject Feedback Status</p>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map((s) => {
                    const doc = cumulativeFeedback[s];
                    const status = doc?.status || "none";
                    const statusConfig = {
                      done:       { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: "✓" },
                      generating: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   icon: "⏳" },
                      error:      { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    icon: "✗" },
                      none:       { bg: "bg-slate-50",   text: "text-slate-400",   border: "border-slate-200",   icon: "○" },
                      pending:    { bg: "bg-slate-50",   text: "text-slate-400",   border: "border-slate-200",   icon: "○" },
                    }[status] || { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200", icon: "○" };
                    return (
                      <button
                        key={s}
                        onClick={() => setSelectedSubject(s)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all hover:shadow-sm ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                      >
                        <SubjectIconEl subject={s} className="w-3.5 h-3.5" />
                        <span>{s}</span>
                        <span className="font-bold">{statusConfig.icon}</span>
                        {doc?.attempt_count > 0 && (
                          <span className="text-slate-400 font-normal">{doc.attempt_count} tests</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* ──────────── RECENT ASSESSMENTS ──────────── */}
        <Card>
          <CardTitle>
            {selectedSubject === "All" ? "Recent Assessments" : `Recent ${selectedSubject} Assessments`}
          </CardTitle>
          {hasData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Quiz</th>
                    {selectedSubject === "All" && (
                      <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Subject</th>
                    )}
                    <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Score</th>
                    <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                    <th className="text-left py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAssessments.map((t) => (
                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 pr-4 text-slate-700 font-medium max-w-xs truncate">{t.name}</td>
                      {selectedSubject === "All" && (
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${SUBJECT_LIGHT_BG[t.subject] || "bg-slate-100"} ${SUBJECT_TEXT[t.subject] || "text-slate-600"}`}>
                            <SubjectIconEl subject={t.subject} className="w-3 h-3" />
                            {t.subject}
                          </span>
                        </td>
                      )}
                      <td className="py-3 pr-4"><ScoreBadge score={t.score} /></td>
                      <td className="py-3 pr-4 text-slate-500">
                        {new Date(t.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })}
                      </td>
                      <td className="py-3 text-slate-400">{formatDuration(t.duration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <SubjectIconEl
                  subject={selectedSubject !== "All" ? selectedSubject : "All"}
                  className="w-7 h-7 text-slate-400"
                />
              </div>
              <p className="text-slate-500 font-medium">No assessments yet</p>
              <p className="text-sm text-slate-400">
                {selectedSubject === "All"
                  ? "Take a quiz to see your results here"
                  : `Take a ${selectedSubject} quiz to see your results here`}
              </p>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}