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

import {
  BookOpen, PenLine, Hash, Languages, Library, LayoutDashboard, ClipboardList,
  TrendingUp, TrendingDown, Trophy, AlertTriangle, Target, Star, Lightbulb,
  Award, CheckCircle2, Minus, Flame,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

const SUBJECT_COLORS = {
  Reading:  "#3B82F6",
  Writing:  "#7C3AED",
  Numeracy: "#F59E0B",
  Language: "#10B981",
};
const SUBJECT_BG = {
  Reading:  "bg-blue-500",
  Writing:  "bg-purple-500",
  Numeracy: "bg-amber-500",
  Language: "bg-emerald-500",
};
const SUBJECT_LIGHT_BG = {
  Reading:  "bg-blue-50",
  Writing:  "bg-purple-50",
  Numeracy: "bg-amber-50",
  Language: "bg-emerald-50",
};
const SUBJECT_TEXT = {
  Reading:  "text-blue-700",
  Writing:  "text-purple-700",
  Numeracy: "text-amber-700",
  Language: "text-emerald-700",
};
const SUBJECT_BORDER = {
  Reading:  "border-blue-300",
  Writing:  "border-purple-300",
  Numeracy: "border-amber-300",
  Language: "border-emerald-300",
};

const SUBJECT_ICON = {
  Reading:  BookOpen,
  Writing:  PenLine,
  Numeracy: Hash,
  Language: Languages,
  Other:    Library,
  All:      LayoutDashboard,
};

function SubjectIconEl({ subject, className = "w-4 h-4" }) {
  const Icon = SUBJECT_ICON[subject] || Library;
  return <Icon className={className} />;
}

const TIME_FILTERS = [
  { label: "Week",     days: 7 },
  { label: "Month",    days: 30 },
  { label: "3 Months", days: 90 },
  { label: "All Time", days: Infinity },
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
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, light = false }) {
  return (
    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${light ? "text-white/80" : "text-slate-400"}`}>
      {children}
    </h3>
  );
}

function KPI({ title, value, accent = false, warning = false, subject = null, subtext = null }) {
  const accentColor = subject
    ? SUBJECT_TEXT[subject]
    : accent ? "text-indigo-600" : warning ? "text-rose-500" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
      <span className={`text-2xl font-bold leading-tight ${value === "—" ? "text-slate-300" : accentColor}`}>
        {value}
      </span>
      {subtext && <span className="text-xs text-slate-400 mt-0.5">{subtext}</span>}
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="h-3 w-20 bg-slate-100 rounded mb-3 animate-pulse" />
      <div className="h-7 w-24 bg-slate-100 rounded animate-pulse" />
    </div>
  );
}

function ChartSkeleton({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
        <LayoutDashboard className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-sm text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}

function SummaryRow({ label, value, positive }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${positive === true ? "text-emerald-600" : positive === false ? "text-rose-500" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PARENT TONE REFRAMER
   Transforms child-addressed text ("You've", "your") into
   parent-addressed text ("Liam has", "Liam's") when a parent
   is viewing the dashboard.
   ═══════════════════════════════════════════════════════════ */

function reframeForParent(text, childName) {
  if (!text || !childName) return text;

  // ── Step 1: Contractions FIRST (must come before bare "you" replacement)
  text = text
    .replace(/\bYou'll\b/g,   `${childName} will`)
    .replace(/\byou'll\b/g,   `${childName} will`)
    .replace(/\bYou'd\b/g,    `${childName} would`)
    .replace(/\byou'd\b/g,    `${childName} would`)
    .replace(/\bYou've\b/g,   `${childName} has`)
    .replace(/\byou've\b/g,   `${childName} has`)
    .replace(/\bYou're\b/g,   `${childName} is`)
    .replace(/\byou're\b/g,   `${childName} is`)
    .replace(/\bYou've\b/g,   `${childName} has`);

  // ── Step 2: Multi-word patterns
  text = text
    .replace(/\bYou are\b/g,  `${childName} is`)
    .replace(/\byou are\b/g,  `${childName} is`)
    .replace(/\bYou have\b/g, `${childName} has`)
    .replace(/\byou have\b/g, `${childName} has`);

  // ── Step 3: Possessive
  text = text
    .replace(/\bYour\b/g, `${childName}'s`)
    .replace(/\byour\b/g, `${childName}'s`);

  // ── Step 4: Bare "You" / "you"
  text = text
    .replace(/\bYou\b/g, childName)
    .replace(/\byou\b/g, childName);

  // ── Step 5: Remove doubled name from vocative patterns
  // e.g. "Liam is doing great, Liam!" → "Liam is doing great!"
  // Gemini often writes "You're doing great, [name]!" — after replacement the
  // name appears twice. Strip the trailing comma-name address.
  const escapedName = childName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text
    .replace(new RegExp(`,\\s*${escapedName}([!.?]|\\b)`, "gi"), "$1")
    .replace(new RegExp(`^${escapedName},\\s*${escapedName}\\b`, "gi"), childName);

  // ── Step 6: Fix subject–verb agreement edge cases left behind
  // "Before [name] start" → "Before [name] starts"
  text = text
    .replace(
      new RegExp(`(Before\\s+${escapedName}\\s+)(start)\\b`, "gi"),
      (_, prefix) => `${prefix}starts`
    );

  // ── Step 7: Common phrase replacements
  text = text
    .replace(/\bkeep practising\b/gi,  `encourage ${childName} to keep practising`)
    .replace(/\bKeep going!\b/g,       `${childName} is on a great track!`)
    .replace(/\bKeep it up!\b/g,       `Encourage ${childName} to keep it up!`);

  return text;
}

/* ═══════════════════════════════════════════════════════════
   AI COACH PANEL
   ═══════════════════════════════════════════════════════════ */

const TREND_CONFIG = {
  improving: { Icon: TrendingUp,   label: "Improving",    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  stable:    { Icon: Minus,        label: "Stable",       color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200" },
  declining: { Icon: TrendingDown, label: "Needs Focus",  color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200" },
  new:       { Icon: Star,         label: "Just Started", color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200" },
};

function TrendBadge({ trend }) {
  const cfg = TREND_CONFIG[trend] || TREND_CONFIG.new;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-1/3" />
      <div className="h-3 bg-slate-200 rounded w-full" />
      <div className="h-3 bg-slate-200 rounded w-5/6" />
      <div className="h-3 bg-slate-100 rounded w-2/3 mt-4" />
      <div className="h-3 bg-slate-100 rounded w-3/4" />
    </div>
  );
}

function ChipList({ items, color }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 3).map((item, i) => (
        <span key={i} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
          {typeof item === "string" ? item : item.issue || item}
        </span>
      ))}
    </div>
  );
}

/* ─── AICumulativeCoachPanel ───────────────────────────────
   Now accepts isParentViewing + displayName to adapt all
   feedback text to the correct audience tone.
─────────────────────────────────────────────────────────── */
function AICumulativeCoachPanel({
  feedbackDoc,
  subject,
  onRefresh,
  refreshing,
  loading,
  isParentViewing = false,   // ← NEW
  displayName = "Student",   // ← NEW
}) {
  const status      = feedbackDoc?.status;
  const rawFeedback = feedbackDoc?.feedback;

  // ── Reframe stored child-tone text into parent tone when needed ──
  const feedback = isParentViewing && rawFeedback
    ? {
        ...rawFeedback,
        summary:       reframeForParent(rawFeedback.summary, displayName),
        encouragement: reframeForParent(rawFeedback.encouragement, displayName),
        strengths:     rawFeedback.strengths?.map((s) => reframeForParent(s, displayName)),
        study_tips:    rawFeedback.study_tips?.map((t) => reframeForParent(t, displayName)),
        areas_for_improvement: rawFeedback.areas_for_improvement?.map((a) => ({
          ...a,
          issue:          reframeForParent(a.issue, displayName),
          how_to_improve: reframeForParent(a.how_to_improve, displayName),
        })),
      }
    : rawFeedback;

  const subjectColor      = subject !== "All" ? SUBJECT_TEXT[subject]    : "text-indigo-600";
  const subjectBgLight    = subject !== "All" ? SUBJECT_LIGHT_BG[subject] : "bg-indigo-50";
  const subjectBorderColor= subject !== "All" ? SUBJECT_BORDER[subject]  : "border-indigo-200";

  /* ── Loading / generating states ── */
  if (loading || status === "pending" || status === "generating" || refreshing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>
            {isParentViewing
              ? `Generating coaching report for ${displayName}…`
              : "Generating AI coaching report…"}
          </span>
        </div>
        <FeedbackSkeleton />
      </div>
    );
  }

  /* ── No feedback doc yet ── */
  if (!feedbackDoc) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm space-y-1">
        <BookOpen className="w-8 h-8 mx-auto text-slate-200 mb-2" />
        <p>No AI feedback yet for {subject !== "All" ? subject : "overall"}.</p>
        <p className="text-xs">
          {isParentViewing
            ? `${displayName} needs to complete more quizzes to unlock this report.`
            : "Complete more quizzes to unlock your coaching report."}
        </p>
      </div>
    );
  }

  /* ── Error state ── */
  if (status === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-rose-600 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">Feedback generation failed</span>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  /* ── Empty feedback ── */
  if (!feedback || (!feedback.summary && !feedback.strengths?.length)) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm">
        <BookOpen className="w-8 h-8 mx-auto text-slate-200 mb-2" />
        <p>
          {isParentViewing
            ? `${displayName} needs to take more ${subject !== "All" ? subject : ""} quizzes to unlock this report.`
            : `Take more ${subject !== "All" ? subject : ""} quizzes to unlock your coaching report.`}
        </p>
      </div>
    );
  }

  /* ── Full feedback panel ── */
  return (
    <div className="space-y-4">

      {/* Trend badge + meta */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <TrendBadge trend={feedback.trend || "new"} />
        {feedbackDoc.attempt_count > 0 && (
          <span className="text-xs text-slate-400">
            {feedbackDoc.attempt_count} quiz{feedbackDoc.attempt_count !== 1 ? "zes" : ""}
            {feedbackDoc.average_score ? ` · Avg ${Math.round(feedbackDoc.average_score)}%` : ""}
          </span>
        )}
      </div>

      {/* Summary */}
      {feedback.summary && (
        <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
          {feedback.summary}
        </p>
      )}

      {/* Strengths */}
      {feedback.strengths?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isParentViewing ? `${displayName}'s Strengths` : "Strengths"}
          </p>
          <ChipList
            items={feedback.strengths}
            color="bg-emerald-50 border-emerald-200 text-emerald-700"
          />
        </div>
      )}

      {/* Focus areas */}
      {feedback.areas_for_improvement?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
            <Target className="w-3.5 h-3.5" />
            {isParentViewing ? `Areas for ${displayName} to Focus On` : "Focus Areas"}
          </p>
          <ChipList
            items={feedback.areas_for_improvement.map((a) => a.issue || a)}
            color="bg-amber-50 border-amber-200 text-amber-700"
          />
        </div>
      )}

      {/* Study tip */}
      {feedback.study_tips?.[0] && (
        <div className={`flex items-start gap-2.5 rounded-xl p-3 ${subjectBgLight} border ${subjectBorderColor}`}>
          <Lightbulb className={`w-4 h-4 mt-0.5 flex-shrink-0 ${subjectColor}`} />
          <p className={`text-xs leading-relaxed ${subjectColor}`}>
            {isParentViewing
              ? `💡 Tip for supporting ${displayName}: ${feedback.study_tips[0]}`
              : feedback.study_tips[0]}
          </p>
        </div>
      )}

      {/* Encouragement */}
      {feedback.encouragement && (
        <p className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-3">
          "{feedback.encouragement}"
        </p>
      )}

      {/* Timestamp */}
      {feedbackDoc.generated_at && (
        <p className="text-[10px] text-slate-400 text-right">
          Updated {new Date(feedbackDoc.generated_at).toLocaleDateString("en-AU", {
            day: "numeric", month: "short", year: "numeric",
          })}
          {feedbackDoc.model ? ` · ${feedbackDoc.model}` : ""}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUBJECT TABS
   ═══════════════════════════════════════════════════════════ */

function SubjectTabBar({ selectedSubject, onChange, tests }) {
  const options = [
    { value: "All", label: "All" },
    ...SUBJECTS.map((s) => ({ value: s, label: s })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const count = opt.value === "All" ? tests.length : tests.filter((t) => t.subject === opt.value).length;
        const isActive = opt.value === selectedSubject;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${isActive
                ? opt.value === "All"
                  ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                  : `${SUBJECT_BG[opt.value]} text-white border-transparent shadow-sm`
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
          >
            <SubjectIconEl
              subject={opt.value}
              className={`w-3.5 h-3.5 ${isActive ? "text-white" : opt.value !== "All" ? SUBJECT_TEXT[opt.value] : "text-slate-500"}`}
            />
            <span>{opt.label}</span>
            {count > 0 && (
              <span className={`text-[10px] px-1 py-0.5 rounded-full ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
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
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{score}%</span>;
}

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
  childId: childIdProp = null,
  viewerType = null,
}) {
  const navigate = useNavigate();
  const { logout, logoutChild, childToken, parentToken, user } = useAuth();

  const [timeFilter, setTimeFilter]         = useState(3);
  const [selectedSubject, setSelectedSubject] = useState("All");
  const [cumulativeFeedback, setCumulativeFeedback] = useState({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const pollTimerRef = useRef(null);

  const childId = useMemo(() => {
    if (childIdProp) return childIdProp;
    if (user?.childId) return user.childId;
    if (user?.child_id) return user.child_id;
    return null;
  }, [childIdProp, user]);

  const activeToken = childToken || parentToken || null;

  // Derive whether a parent (not the child) is currently viewing
  const isParentView = viewerType
    ? viewerType !== "child"
    : Boolean(parentToken && !childToken);

  const loadCumulativeFeedback = useCallback(async () => {
    if (!childId || !activeToken) return;
    try {
      const { feedback, generating } = await fetchCumulativeFeedback(activeToken, childId);
      setCumulativeFeedback(feedback || {});
      const stillGenerating =
        generating ||
        Object.values(feedback || {}).some(
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

  /* ── Derived data ── */
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
    const avgFirst  = sorted.slice(0, half).reduce((a, t) => a + t.score, 0) / half;
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

  const subjectTrendData = useMemo(() => buildSubjectTrendData(subjectTests),         [subjectTests]);
  const allSubjectsTrend = useMemo(() => buildAllSubjectsTrendData(timeFilteredTests), [timeFilteredTests]);
  const topicData        = useMemo(() => buildTopicBreakdown(subjectTests).slice(0, 8),[subjectTests]);
  const activeSubjects   = useMemo(() => comparisonData.filter((c) => c.count > 0).length, [comparisonData]);

  const subjectColor     = selectedSubject !== "All" ? SUBJECT_COLORS[selectedSubject] : "#6366F1";
  const subjectBg        = selectedSubject !== "All" ? SUBJECT_LIGHT_BG[selectedSubject] : "bg-indigo-50";
  const subjectTextClass = selectedSubject !== "All" ? SUBJECT_TEXT[selectedSubject] : "text-indigo-600";

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className={embedded ? "" : "min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40"}>
      <div className={`${embedded ? "" : "max-w-screen-2xl mx-auto px-4 sm:px-8 py-8"} space-y-5`}>

        {/* ── HEADER — standalone (not embedded) ── */}
        {!embedded && (
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{displayName}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {yearLevel ? `Year ${yearLevel} · ` : ""}Analytics Dashboard
              </p>
            </div>
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm self-start sm:self-auto">
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
          </header>
        )}

        {/* ── EMBEDDED HEADER — compact single bar ── */}
        {embedded && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isParentView ? `${displayName}'s Learning Progress` : "Your Learning Progress"}
              </h2>
              {yearLevel && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {isParentView ? `Year ${yearLevel} · Parent View` : `Year ${yearLevel} Dashboard`}
                </p>
              )}
            </div>
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm self-start sm:self-auto">
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
          </div>
        )}

        {/* ── FILTER BAR ── */}
        <div className="flex flex-col gap-2">
          <SubjectTabBar
            selectedSubject={selectedSubject}
            onChange={setSelectedSubject}
            tests={timeFilteredTests}
          />
          {selectedSubject !== "All" && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${subjectBg} border ${SUBJECT_BORDER[selectedSubject]} text-xs`}>
              <SubjectIconEl subject={selectedSubject} className={`w-4 h-4 ${subjectTextClass}`} />
              <span className={`font-semibold ${subjectTextClass}`}>{selectedSubject}</span>
              <span className="text-slate-500">· {subjectTests.length} assessment{subjectTests.length !== 1 ? "s" : ""}</span>
              <button onClick={() => setSelectedSubject("All")} className="ml-auto text-slate-400 hover:text-slate-600 underline text-xs">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* ── KPI CARDS ── */}
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {hasData ? (
            <>
              <KPI
                title={selectedSubject === "All" ? "Overall Average" : `${selectedSubject} Avg`}
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
                  <KPI
                    title="Strongest Subject"
                    value={strongest || "—"}
                    subtext={!strongest || strongest === "—"
                      ? (isParentView ? "Still exploring" : "Keep practising!")
                      : null}
                    accent
                  />
                  <KPI
                    title={isParentView ? "Needs Attention" : "Next Focus"}
                    value={weakest || "—"}
                    subtext={!weakest || weakest === "—" ? "All looking good!" : null}
                    warning
                  />
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

        {/* ── CHARTS ROW ── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Performance Trend */}
          <Card className="xl:col-span-2">
            <CardTitle>
              {selectedSubject === "All"
                ? "Performance Trend (All Subjects)"
                : `${selectedSubject} Score History`}
            </CardTitle>

            {selectedSubject === "All" ? (
              hasData && allSubjectsTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
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
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", padding: "10px 14px" }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    {SUBJECTS.map((key) => (
                      <Area
                        key={key} type="monotone" dataKey={key}
                        stroke={SUBJECT_COLORS[key]} strokeWidth={2.5}
                        fill={`url(#gradient-${key})`}
                        dot={{ r: 3, fill: SUBJECT_COLORS[key] }}
                        activeDot={{ r: 5 }} connectNulls={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartSkeleton message={
                  isParentView
                    ? `${displayName} hasn't taken enough tests yet to show a trend`
                    : "Take some tests to see your performance trend over time"
                } />
              )
            ) : (
              hasData && subjectTrendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={subjectTrendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="attempt" stroke="#94a3b8" fontSize={11}
                      label={{ value: "Attempt #", position: "insideBottom", offset: -2, fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                    <ReferenceLine y={avgScore} stroke={subjectColor} strokeDasharray="4 4" strokeOpacity={0.5}
                      label={{ value: `Avg: ${avgScore}%`, position: "right", fontSize: 10, fill: subjectColor }} />
                    <Tooltip content={(props) => <SubjectTrendTooltip {...props} subject={selectedSubject} />} />
                    <Line
                      type="monotone" dataKey="score"
                      stroke={subjectColor} strokeWidth={3}
                      dot={{ r: 4, fill: subjectColor, strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : hasData && subjectTrendData.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className={`w-16 h-16 rounded-full ${subjectBg} flex items-center justify-center`}>
                    <span className={`text-2xl font-bold ${subjectTextClass}`}>{subjectTrendData[0].score}%</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    {isParentView
                      ? `${displayName} needs more ${selectedSubject} tests to show a trend`
                      : `Take more ${selectedSubject} tests to see your trend!`}
                  </p>
                </div>
              ) : (
                <ChartSkeleton message={
                  isParentView
                    ? `${displayName} hasn't taken any ${selectedSubject} tests yet`
                    : `No ${selectedSubject} tests yet — take a quiz to see your score history!`
                } />
              )
            )}

            {selectedSubject === "All" && hasData && (
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-50">
                {SUBJECTS.map((s) => (
                  <button key={s} onClick={() => setSelectedSubject(s)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SUBJECT_COLORS[s] }} />
                    {s}
                  </button>
                ))}
                <span className="text-xs text-slate-300 ml-auto">Click to drill down →</span>
              </div>
            )}
          </Card>

          {/* Subject Comparison */}
          <Card>
            <CardTitle>
              {selectedSubject === "All" ? "Subject Comparison" : `${selectedSubject} Quiz Scores`}
            </CardTitle>

            {selectedSubject === "All" ? (
              hasData ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={comparisonData} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="subject" stroke="#94a3b8" fontSize={10} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Average"]}
                        contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}
                      />
                      <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                        {comparisonData.map((entry) => (
                          <rect key={entry.subject} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1.5">
                    {comparisonData.filter((c) => c.count > 0).map((c) => (
                      <button key={c.subject} onClick={() => setSelectedSubject(c.subject)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition text-left">
                        <span className={`flex-shrink-0 ${SUBJECT_TEXT[c.subject]}`}>
                          <SubjectIconEl subject={c.subject} className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-sm text-slate-700 flex-1">{c.subject}</span>
                        <ScoreBadge score={c.score} />
                        <span className="text-xs text-slate-400">{c.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ChartSkeleton message={
                  isParentView
                    ? `${displayName} needs to complete tests in different subjects`
                    : "Complete tests in different subjects to compare"
                } />
              )
            ) : (
              hasData ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {topicData.map((q, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-2 border-b border-slate-50 last:border-0">
                      <div className={`w-5 h-5 rounded-full ${i === 0 ? SUBJECT_BG[selectedSubject] : "bg-slate-100"} flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-[10px] font-bold ${i === 0 ? "text-white" : "text-slate-400"}`}>{i + 1}</span>
                      </div>
                      <span className="text-sm text-slate-700 flex-1 truncate">{q.name}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${q.score}%`, background: subjectColor }} />
                        </div>
                        <ScoreBadge score={q.score} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ChartSkeleton message={
                  isParentView
                    ? `${displayName} hasn't taken any ${selectedSubject} quizzes yet`
                    : `No ${selectedSubject} quizzes taken yet`
                } />
              )
            )}
          </Card>
        </section>

        {/* ── BOTTOM ROW: Summary + Distribution + Insights ── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Academic Summary */}
          <Card>
            <CardTitle>
              {selectedSubject === "All" ? "Academic Summary" : `${selectedSubject} Summary`}
            </CardTitle>
            {hasData ? (
              <>
                <div className="space-y-0.5 text-sm">
                  <SummaryRow
                    label={selectedSubject === "All" ? "Overall Average" : "Subject Average"}
                    value={`${avgScore}%`}
                  />
                  <SummaryRow label="Best Score" value={`${bestScore}%`} />
                  {improvement !== null && (
                    <SummaryRow
                      label="Improvement"
                      value={`${improvement >= 0 ? "+" : ""}${improvement}%`}
                      positive={improvement >= 0}
                    />
                  )}
                  <SummaryRow
                    label={selectedSubject === "All" ? "Total Tests" : `${selectedSubject} Tests`}
                    value={String(subjectTests.length)}
                  />
                  {selectedSubject === "All" && (
                    <SummaryRow label="Subjects Active" value={String(activeSubjects)} />
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-1.5">
                    {isParentView
                      ? `Progress Toward Target (85%)`
                      : "Your Goal: 85%"}
                  </p>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min((avgScore / 85) * 100, 100)}%`,
                        background: selectedSubject !== "All"
                          ? subjectColor
                          : "linear-gradient(to right, #6366F1, #8B5CF6)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {avgScore >= 85
                      ? "🎉 Goal reached!"
                      : isParentView
                        ? `${85 - avgScore}% to go`
                        : `You're ${avgScore}% there — keep going!`}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 py-4 text-center">No data yet</div>
            )}
          </Card>

          {/* Score Distribution */}
          <Card>
            <CardTitle>Score Distribution</CardTitle>
            {hasData ? (
              <div className="space-y-3.5">
                {[
                  { label: "High (80%+)",         tests: subjectTests.filter((t) => t.score >= 80),                  color: "bg-emerald-400" },
                  { label: "Mid (50–79%)",         tests: subjectTests.filter((t) => t.score >= 50 && t.score < 80), color: "bg-amber-400"   },
                  { label: "Learning Zone (<50%)", tests: subjectTests.filter((t) => t.score < 50),                  color: "bg-rose-400"    },
                ].map((bucket) => {
                  const pct = subjectTests.length
                    ? Math.round((bucket.tests.length / subjectTests.length) * 100)
                    : 0;
                  return (
                    <div key={bucket.label}>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span className="font-medium">{bucket.label}</span>
                        <span>{bucket.tests.length} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${bucket.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400 py-4 text-center">No data yet</div>
            )}
          </Card>

          {/* Performance Insights */}
          <Card className="border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-slate-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Performance Insights
                  </h3>
                  <span className="text-[10px] text-indigo-400 font-medium">AI-powered</span>
                </div>
              </div>
            </div>

            {!hasData ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                {isParentView
                  ? selectedSubject === "All"
                    ? `${displayName} needs to take some tests to unlock insights`
                    : `${displayName} needs to take a ${selectedSubject} test to unlock insights`
                  : selectedSubject === "All"
                    ? "Take some tests to see your insights"
                    : `Take a ${selectedSubject} test to unlock insights`}
              </p>

            ) : feedbackLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-slate-200 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-2.5 bg-slate-200 rounded w-full" />
                      <div className="h-2.5 bg-slate-100 rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>

            ) : activeFeedbackDoc?.status === "generating" || activeFeedbackDoc?.status === "pending" ? (
              <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
                <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>
                  {isParentView
                    ? `Analysing ${displayName}'s quiz history…`
                    : "Analysing your quiz history…"}
                </span>
              </div>

            ) : activeFeedbackDoc?.feedback ? (() => {
              const rawFb = activeFeedbackDoc.feedback;
              // Apply parent reframe to insight snippets too
              const fb = isParentView
                ? {
                    ...rawFb,
                    summary:      reframeForParent(rawFb.summary, displayName),
                    strengths:    rawFb.strengths?.map((s) => reframeForParent(s, displayName)),
                    areas_for_improvement: rawFb.areas_for_improvement?.map((a) => ({
                      ...a,
                      issue: reframeForParent(a.issue, displayName),
                    })),
                    study_tips:   rawFb.study_tips?.map((t) => reframeForParent(t, displayName)),
                    encouragement: reframeForParent(rawFb.encouragement, displayName),
                  }
                : rawFb;

              const rows = [
                fb.trend && {
                  Icon: fb.trend === "improving" ? TrendingUp : fb.trend === "declining" ? TrendingDown : Minus,
                  bg:   fb.trend === "improving" ? "bg-emerald-100" : fb.trend === "declining" ? "bg-rose-100" : "bg-slate-100",
                  iconColor: fb.trend === "improving" ? "text-emerald-600" : fb.trend === "declining" ? "text-rose-500" : "text-slate-400",
                  text: fb.trend === "improving"
                    ? (isParentView ? `${displayName}'s scores are trending upward — great momentum!` : "Scores trending upward — great momentum!")
                    : fb.trend === "declining"
                      ? (isParentView ? `${displayName}'s recent scores have dipped — time to refocus.` : "Recent scores have dipped — time to refocus.")
                      : (isParentView ? `${displayName}'s performance is holding steady.` : "Performance is holding steady."),
                },
                fb.summary && {
                  Icon: Lightbulb, bg: "bg-cyan-100", iconColor: "text-cyan-600",
                  text: fb.summary.split(" ").slice(0, 18).join(" ") + (fb.summary.split(" ").length > 18 ? "…" : ""),
                },
                fb.strengths?.[0] && {
                  Icon: Trophy, bg: "bg-amber-100", iconColor: "text-amber-600",
                  text: fb.strengths[0],
                },
                fb.areas_for_improvement?.[0] && {
                  Icon: Target, bg: "bg-blue-100", iconColor: "text-blue-600",
                  text: fb.areas_for_improvement[0].issue || fb.areas_for_improvement[0],
                },
                fb.study_tips?.[0] && {
                  Icon: Award, bg: "bg-purple-100", iconColor: "text-purple-600",
                  text: fb.study_tips[0],
                },
                fb.encouragement && {
                  Icon: Star, bg: "bg-yellow-100", iconColor: "text-yellow-600",
                  text: fb.encouragement,
                },
              ].filter(Boolean).slice(0, 4);

              return (
                <ul className="space-y-2.5">
                  {rows.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className={`w-6 h-6 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <item.Icon className={`w-3 h-3 ${item.iconColor}`} />
                      </div>
                      <span className="text-sm leading-relaxed text-slate-700">{item.text}</span>
                    </li>
                  ))}
                  {activeFeedbackDoc.generated_at && (
                    <li className="pt-1">
                      <span className="text-[10px] text-slate-400">
                        Updated {new Date(activeFeedbackDoc.generated_at).toLocaleDateString("en-AU", {
                          day: "numeric", month: "short",
                        })}
                      </span>
                    </li>
                  )}
                </ul>
              );
            })() : (
              // Fallback static insights (no AI feedback yet)
              <ul className="space-y-2.5">
                {[
                  {
                    Icon: Trophy, bg: "bg-amber-100", iconColor: "text-amber-600",
                    text: strongest !== "—"
                      ? (isParentView
                          ? `${strongest} is ${displayName}'s strongest at ${comparisonData.find((c) => c.subject === strongest)?.score}%`
                          : `${strongest} is your strongest at ${comparisonData.find((c) => c.subject === strongest)?.score}%`)
                      : (isParentView
                          ? `Keep encouraging ${displayName} to reveal their strongest subject`
                          : "Keep completing tests to reveal your strongest subject"),
                  },
                  {
                    Icon: Target, bg: "bg-blue-100", iconColor: "text-blue-600",
                    text: `Averaging ${avgScore}% — ${avgScore >= 85 ? "target reached!" : `${85 - avgScore}% away from the 85% target`}`,
                  },
                  {
                    Icon: improvement !== null && improvement > 0 ? TrendingUp : improvement !== null && improvement < 0 ? TrendingDown : Minus,
                    bg:   improvement !== null && improvement > 0 ? "bg-emerald-100" : improvement !== null && improvement < 0 ? "bg-rose-100" : "bg-slate-100",
                    iconColor: improvement !== null && improvement > 0 ? "text-emerald-600" : improvement !== null && improvement < 0 ? "text-rose-500" : "text-slate-400",
                    text: improvement !== null
                      ? `Scores ${improvement >= 0 ? "up" : "down"} ${Math.abs(improvement)}% comparing recent vs earlier tests`
                      : (isParentView
                          ? `${displayName} needs more tests to track the improvement trend`
                          : "Take more tests to track your improvement trend"),
                  },
                  {
                    Icon: Lightbulb, bg: "bg-cyan-100", iconColor: "text-cyan-600",
                    text: isParentView
                      ? `${subjectTests.length || timeFilteredTests.length} test${(subjectTests.length || timeFilteredTests.length) !== 1 ? "s" : ""} done — more quizzes will unlock AI insights`
                      : `${subjectTests.length || timeFilteredTests.length} test${(subjectTests.length || timeFilteredTests.length) !== 1 ? "s" : ""} done — take more quizzes to unlock AI insights`,
                  },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <item.Icon className={`w-3 h-3 ${item.iconColor}`} />
                    </div>
                    <span className="text-sm leading-relaxed text-slate-700">{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* ── AI CUMULATIVE COACH ── */}
        <section>
          <Card className="border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {isParentView
                      ? `AI Coach — ${displayName}'s ${selectedSubject === "All" ? "Overall Summary" : `${selectedSubject} Analysis`}`
                      : `AI Coach — ${selectedSubject === "All" ? "Overall Summary" : `${selectedSubject} Analysis`}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isParentView
                      ? `Powered by AI · updates after every quiz ${displayName} completes`
                      : "Powered by AI · updates after every quiz"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden sm:flex gap-1 flex-wrap">
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
                            ? key === "All"
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : `${SUBJECT_BG[key]} text-white border-transparent`
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                          }`}
                      >
                        <SubjectIconEl
                          subject={key}
                          className={`w-3 h-3 ${isActive ? "text-white" : key !== "All" ? SUBJECT_TEXT[key] : "text-slate-500"}`}
                        />
                        {label}
                        {isDone && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleRefreshFeedback}
                  disabled={refreshing || feedbackLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 transition-all disabled:opacity-50"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {/* ── Pass isParentViewing + displayName so panel adapts its tone ── */}
            <AICumulativeCoachPanel
              feedbackDoc={activeFeedbackDoc}
              subject={selectedSubject}
              onRefresh={handleRefreshFeedback}
              refreshing={refreshing}
              loading={feedbackLoading}
              isParentViewing={isParentView}
              displayName={displayName}
            />

            {selectedSubject === "All" && Object.keys(cumulativeFeedback).length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Subject Feedback Status
                </p>
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
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all hover:shadow-sm ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                      >
                        <SubjectIconEl subject={s} className="w-3 h-3" />
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

      </div>
    </div>
  );
}
