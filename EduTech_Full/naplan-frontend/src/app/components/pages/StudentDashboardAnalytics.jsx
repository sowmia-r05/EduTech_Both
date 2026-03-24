import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchCumulativeFeedback, refreshCumulativeFeedback } from "@/app/utils/api-children";
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar, Cell,
  PieChart, Pie,
  CartesianGrid, XAxis, YAxis,
  Tooltip, ReferenceLine, Legend,
} from "recharts";
import {
  BookOpen, PenLine, Hash, Languages, Library, LayoutDashboard,
  TrendingUp, TrendingDown, AlertTriangle, Target, Star,
  Lightbulb, CheckCircle2, Minus, Flame, Trophy, Zap,
  Users, User, Dumbbell, Sparkles,
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
const SUBJECT_BG       = { Reading: "bg-blue-500",   Writing: "bg-purple-500", Numeracy: "bg-amber-500",   Language: "bg-emerald-500" };
const SUBJECT_LIGHT_BG = { Reading: "bg-blue-50",    Writing: "bg-purple-50",  Numeracy: "bg-amber-50",    Language: "bg-emerald-50"  };
const SUBJECT_TEXT     = { Reading: "text-blue-700", Writing: "text-purple-700",Numeracy: "text-amber-700", Language: "text-emerald-700"};
const SUBJECT_BORDER   = { Reading: "border-blue-200",Writing: "border-purple-200",Numeracy:"border-amber-200",Language:"border-emerald-200"};
const SUBJECT_ICON     = { Reading: BookOpen, Writing: PenLine, Numeracy: Hash, Language: Languages, Other: Library, All: LayoutDashboard };
const SUBJECT_EMOJI = { Reading: "📖", Writing: "✍️", Numeracy: "🔢", Language: "💬" };

const TIME_FILTERS = [
  { label: "Week",     days: 7 },
  { label: "Month",    days: 30 },
  { label: "3 Months", days: 90 },
  { label: "All Time", days: Infinity },
];

/* ═══════════════════════════════════════════════════════════
   DATA HELPERS  (shared)
   ═══════════════════════════════════════════════════════════ */

function normaliseScore(test) {
  if (test.subject === "Writing" && test.score <= 10) return test.score * 10;
  return test.score;
}

function buildSubjectStats(tests) {
  return SUBJECTS.map((subj) => {
    const st     = tests.filter((t) => t.subject === subj);
    const scores = st.map((t) => normaliseScore(t));
    const avg    = scores.length ? Math.round(scores.reduce((a, v) => a + v, 0) / scores.length) : null;
    const best   = scores.length ? Math.max(...scores) : null;
    const last   = scores.length ? scores[scores.length - 1] : null;
    const trend  = scores.length >= 2 ? scores[scores.length - 1] - scores[scores.length - 2] : null;
    return { subject: subj, avg, best, last, trend, count: st.length, color: SUBJECT_COLORS[subj] };
  });
}

function buildAllSubjectsTrend(tests) {
  const monthMap = {};
  tests.forEach((t) => {
    const d   = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
    if (!monthMap[key]) { monthMap[key] = { key, month: lbl }; SUBJECTS.forEach((s) => { monthMap[key][s + "_s"] = 0; monthMap[key][s + "_c"] = 0; }); }
    if (SUBJECTS.includes(t.subject)) { monthMap[key][t.subject + "_s"] += normaliseScore(t); monthMap[key][t.subject + "_c"] += 1; }
  });
  const monthly = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).map((m) => {
    const pt = { month: m.month };
    SUBJECTS.forEach((s) => { pt[s] = m[s + "_c"] > 0 ? Math.round(m[s + "_s"] / m[s + "_c"]) : null; });
    return pt;
  });
  if (monthly.length < 3) {
    const fb = [...tests].sort((a, b) => new Date(a.date) - new Date(b.date)).map((t, i) => {
      const pt = { month: new Date(t.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }), _i: i + 1 };
      SUBJECTS.forEach((s) => { pt[s] = null; });
      if (SUBJECTS.includes(t.subject)) pt[t.subject] = normaliseScore(t);
      return pt;
    });
    return { data: fb, mode: "attempts" };
  }
  return { data: monthly, mode: "monthly" };
}

function buildChronologicalTrend(tests) {
  return [...tests].sort((a, b) => new Date(a.date) - new Date(b.date)).map((t, i) => ({
    attempt: i + 1, score: normaliseScore(t),
    date: new Date(t.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    _name: t.name,
  }));
}

function buildDonutData(tests) {
  const high = tests.filter((t) => normaliseScore(t) >= 80).length;
  const mid  = tests.filter((t) => normaliseScore(t) >= 50 && normaliseScore(t) < 80).length;
  const low  = tests.filter((t) => normaliseScore(t) < 50).length;
  return [
    { name: "High (80%+)",  value: high, color: "#10B981", emoji: "🌟", label: "High"    },
    { name: "Mid (50-79%)", value: mid,  color: "#F59E0B", emoji: "📈", label: "Mid"     },
    { name: "Learning",     value: low,  color: "#F87171", emoji: "💪", label: "Growing" },
  ].filter((d) => d.value > 0);
}

function buildWeeklyFrequency(tests) {
  const wm = {};
  [...tests].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((t) => {
    const d = new Date(t.date);
    const k = d.toLocaleDateString("en-AU", { month: "short" }) + " W" + Math.ceil(d.getDate() / 7);
    wm[k] = (wm[k] || 0) + 1;
  });
  return Object.entries(wm).map(([week, count]) => ({ week, count }));
}

function calcStreak(tests) {
  if (!tests.length) return 0;
  const days = [...new Set(tests.map((t) => new Date(t.date).toDateString()))].map((d) => new Date(d)).sort((a, b) => b - a);
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (days[i - 1] - days[i]) / (1000 * 60 * 60 * 24);
    if (diff <= 1) streak++; else break;
  }
  return streak;
}

function scoreToStars(avg) {
  if (avg === null) return 0;
  if (avg >= 85) return 5;
  if (avg >= 70) return 4;
  if (avg >= 55) return 3;
  if (avg >= 40) return 2;
  return 1;
}

function overallStatus(subjectStats) {
  const active = subjectStats.filter((s) => s.count > 0);
  if (!active.length) return "no-data";
  const avg = active.reduce((a, s) => a + (s.avg || 0), 0) / active.length;
  if (avg >= 70) return "great";
  if (avg >= 50) return "okay";
  return "needs-help";
}

function childLevel(totalTests, avgScore) {
  if (totalTests === 0) return { label: "Newcomer",    emoji: "🌱", xp: 0,   next: 5,   color: "text-slate-500",   bg: "bg-slate-100"   };
  if (totalTests < 5)  return { label: "Beginner",     emoji: "🐣", xp: totalTests, next: 5,   color: "text-blue-600",   bg: "bg-blue-50"     };
  if (totalTests < 15) return { label: "Rising Star",  emoji: "⭐", xp: totalTests, next: 15,  color: "text-amber-600",  bg: "bg-amber-50"    };
  if (totalTests < 30) return { label: "Explorer",     emoji: "🚀", xp: totalTests, next: 30,  color: "text-indigo-600", bg: "bg-indigo-50"   };
  if (avgScore >= 75)  return { label: "Champion",     emoji: "🏆", xp: totalTests, next: null,color: "text-emerald-600",bg: "bg-emerald-50"  };
  return                      { label: "Pro Learner",  emoji: "💎", xp: totalTests, next: null,color: "text-purple-600", bg: "bg-purple-50"   };
}

/* ═══════════════════════════════════════════════════════════
   SHARED SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function SubjectIconEl({ subject, className = "w-4 h-4" }) {
  const Icon = SUBJECT_ICON[subject] || Library;
  return <Icon className={className} />;
}

function SubjectIconBadge({ subject, size = "md" }) {
  const Icon = SUBJECT_ICON[subject] || Library;
  const bg     = SUBJECT_LIGHT_BG[subject]  || "bg-slate-50";
  const color  = SUBJECT_TEXT[subject]       || "text-slate-500";
  const ring   = SUBJECT_BORDER[subject]     || "border-slate-200";
  const dims   = size === "sm" ? "w-7 h-7"  : size === "lg" ? "w-11 h-11" : "w-9 h-9";
  const icon   = size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className={`${dims} ${bg} border ${ring} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon className={`${icon} ${color}`} />
    </div>
  );
}


const Card = React.forwardRef(function Card({ children, className = "" }, ref) {
  return <div ref={ref} className={"bg-white rounded-2xl shadow-sm border border-slate-100 p-5 " + className}>{children}</div>;
});

function ChartEmpty({ message, height = 180 }) {
  return (
    <div style={{ height }} className="flex flex-col items-center justify-center gap-2">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
        <Target className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-xs text-slate-400 text-center">{message}</p>
    </div>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-1/3" /><div className="h-3 bg-slate-200 rounded w-full" />
      <div className="h-3 bg-slate-200 rounded w-5/6" /><div className="h-3 bg-slate-100 rounded w-2/3 mt-3" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AI COACH — shared helpers
   ═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   TONE TRANSFORMERS — same data, different voice
   ═══════════════════════════════════════════════════════════ */

function reframeForParent(text, name) {
  if (!text || !name) return text;
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text
    // ✅ Step 1: Remove direct name address at start of sentences
    // "Tharun, you are..." → "You are..."
    // "Hey Tharun! You..." → "Hey! You..."
    .replace(new RegExp("\\b" + e + ",\\s*", "gi"), "")
    .replace(new RegExp("Hey\\s+" + e + "!", "gi"), "Hey!")

    // ✅ Step 2: Remove trailing direct address
    // "Keep it up, Tharun!" → "Keep it up!"
    .replace(new RegExp(",\\s*" + e + "([!.?])", "gi"), "$1")

    // ✅ Step 3: Now safely convert second-person → third-person
    .replace(/\bYou('ve| have)\b/gi, name + " has")
    .replace(/\bYou're\b/gi, name + " is")
    .replace(/\bYou are\b/gi, name + " is")
    .replace(/\bYou\b/gi, name)
    .replace(/\byour\b/gi, name + "'s")
    .replace(/\bYour\b/gi, name + "'s")

    // ✅ Step 4: Reframe child-directed encouragement as parent guidance
    .replace(/\bkeep practising\b/gi, "encourage " + name + " to keep practising")
    .replace(/\bKeep going!\b/g, name + " is on a great track!")
    .replace(/\bKeep it up!\b/g, "Encourage " + name + " to keep it up!")
    .replace(/\btry again\b/gi, "give it another go")
    .replace(/\bYou can do it\b/gi, name + " can do it")

    // ✅ Step 5: Clean up any double spaces left behind
    .replace(/\s{2,}/g, " ")
    .trim();
}



// 🧒 CHILD tone — warm, exciting, personal, direct second-person
// Keeps "you", adds energy, gamified language
function reframeForChild(text, name) {
  if (!text || !name) return text;
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text
    // ✅ Step 1: Remove direct address comma at start
    // "Tharun, you are..." → "you are..."
    .replace(new RegExp("\\b" + e + ",\\s*", "gi"), "")
    .replace(new RegExp("Hey\\s+" + e + "!", "gi"), "Hey!")

    // ✅ Step 2: Replace remaining name references with "you"
    .replace(new RegExp(e + " has\\b", "gi"), "You've")
    .replace(new RegExp(e + " is\\b", "gi"), "You are")
    .replace(new RegExp(e + "'s\\b", "gi"), "Your")
    .replace(new RegExp("\\b" + e + "\\b", "gi"), "you")

    // ✅ Step 3: Boost energy
    .replace(/\bCompleted\b/gi, "Crushed")
    .replace(/\barea for improvement\b/gi, "next level to unlock")
    .replace(/\bneeds more practice\b/gi, "is your next big win")
    .replace(/\bwork on\b/gi, "level up in")
    .replace(/\bpractise\b/gi, "practise — you've got this")

    // ✅ Step 4: Clean up double spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}



const TREND_CONFIG = {
  improving: { Icon: TrendingUp,   label: "Improving",    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  stable:    { Icon: Minus,        label: "Stable",       color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200"    },
  declining: { Icon: TrendingDown, label: "Needs Focus",  color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200"    },
  new:       { Icon: Star,         label: "Just Started", color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200"  },
};

function TrendBadge({ trend }) {
  const cfg = TREND_CONFIG[trend] || TREND_CONFIG.new;
  const { Icon } = cfg;
  return (
    <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border " + cfg.bg + " " + cfg.color + " " + cfg.border}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}




/* ═══════════════════════════════════════════════════════════
   ██████████████████████████████████████████████████████
   PARENT VIEW
   ██████████████████████████████████████████████████████
   ═══════════════════════════════════════════════════════════ */

function ParentView({ tests, displayName, yearLevel, cumulativeFeedback, feedbackLoading, refreshing, onRefresh, timeFilter, setTimeFilter, selectedSubject, setSelectedSubject }) {
  const subjectStats  = useMemo(() => buildSubjectStats(tests), [tests]);
  const status        = useMemo(() => overallStatus(subjectStats), [subjectStats]);
  const subjectFilteredStats = useMemo(() => {
    if (selectedSubject === "All") return subjectStats;
    return subjectStats.filter((s) => s.subject === selectedSubject);
  }, [subjectStats, selectedSubject]);


  const weakestSubj   = useMemo(() => {
    const active = subjectStats.filter((s) => s.count > 0);
    return active.length ? active.reduce((p, c) => ((c.avg || 0) < (p.avg || 0) ? c : p)) : null;
  }, [subjectStats]);
  const strongestSubj = useMemo(() => {
    const active = subjectStats.filter((s) => s.count > 0);
    return active.length ? active.reduce((p, c) => ((c.avg || 0) > (p.avg || 0) ? c : p)) : null;
  }, [subjectStats]);

  const totalQuizzes = tests.length;
  const streak       = useMemo(() => calcStreak(tests), [tests]);
  const overallAvg   = useMemo(() => {
    const active = subjectStats.filter((s) => s.avg !== null);
    return active.length ? Math.round(active.reduce((a, s) => a + s.avg, 0) / active.length) : 0;
  }, [subjectStats]);

  // Weekly activity for simple bar
  const weeklyData = useMemo(() => buildWeeklyFrequency(tests), [tests]);
  const maxWeek    = weeklyData.length ? Math.max(...weeklyData.map((w) => w.count)) : 0;

  const statusConfig = {
    "great":     { Icon: CheckCircle2, iconColor: "text-emerald-500", headline: displayName + " is doing great!",     sub: "Keep up the encouragement — they're on track.",       bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
    "okay":      { Icon: TrendingUp,   iconColor: "text-amber-500",   headline: displayName + " is making progress",  sub: "A little extra practice will make a big difference.",  bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-700"    },
    "needs-help":{ Icon: Dumbbell,     iconColor: "text-rose-500",    headline: displayName + " needs more practice", sub: "Now is a great time to encourage daily quizzes.",      bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    badge: "bg-rose-100 text-rose-700"      },
    "no-data":   { Icon: Sparkles,     iconColor: "text-slate-400",   headline: "Welcome!",                           sub: displayName + " hasn't started any quizzes yet.",       bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   badge: "bg-slate-100 text-slate-600"    },
  }[status];

  // In ParentView — update feedbackDoc lookup:
  const feedbackDoc = cumulativeFeedback[selectedSubject === "All" ? "Overall" : selectedSubject] || null;
  const rawFeedback = feedbackDoc?.feedback;
  const aiSummary   = rawFeedback?.summary     ? reframeForParent(rawFeedback.summary, displayName)     : null;
  const aiTips      = rawFeedback?.study_tips?.slice(0, 2).map((t) => reframeForParent(t, displayName)) || [];
  const aiFocus     = rawFeedback?.areas_for_improvement?.[0];



  return (
    <div className="space-y-5">

      {/* ── Time filter (compact, right-aligned) ── */}
      {/* ── Filters row: Subject pills + Time filter ── */}
      <div className="flex flex-col gap-3">

        {/* Subject filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-slate-400 font-medium shrink-0">Subject:</p>
          {["All", ...SUBJECTS].map((s) => {
            const isActive = selectedSubject === s;
            const Icon = SUBJECT_ICON[s] || Library;
            const activeBg   = s === "All" ? "bg-slate-800 text-white border-slate-800" : SUBJECT_LIGHT_BG[s] + " " + SUBJECT_TEXT[s] + " " + SUBJECT_BORDER[s] + " ring-2 ring-offset-1 ring-" + (
              s === "Reading" ? "blue" : s === "Writing" ? "purple" : s === "Numeracy" ? "amber" : "emerald"
            ) + "-300";
            const inactiveBg = "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700";
            return (
              <button
                key={s}
                onClick={() => {
                  setSelectedSubject(s);
                }}
                className={
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shadow-sm " +
                  (isActive ? activeBg : inactiveBg)
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {s}
              </button>
            );
          })}
        </div>

        {/* Time filter — unchanged */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">Time period:</p>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {TIME_FILTERS.map((f, i) => (
              <button key={f.label} onClick={() => setTimeFilter(i)}
                className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-all " + (timeFilter === i ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

      </div>




      {/* ════════════════════════════════════════════
          SECTION 1 — "Is my child doing OK?"
      ════════════════════════════════════════════ */}
      <div className={"rounded-2xl border-2 p-5 " + statusConfig.bg + " " + statusConfig.border}>
        <div className="flex items-start gap-4">
          <div className={"w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 " + statusConfig.bg + " border " + statusConfig.border}>
            <statusConfig.Icon className={"w-6 h-6 " + statusConfig.iconColor} />
          </div>          <div className="flex-1">
            <h2 className={"text-lg font-bold " + statusConfig.text}>{statusConfig.headline}</h2>
            <p className="text-sm text-slate-600 mt-1">{statusConfig.sub}</p>

            {/* Quick stats in plain English */}
            {totalQuizzes > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={"text-xs font-semibold px-3 py-1 rounded-full " + statusConfig.badge}>
                  {totalQuizzes} quiz{totalQuizzes !== 1 ? "zes" : ""} completed
                </span>
                {streak > 1 && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-orange-100 text-orange-700">
                    🔥 {streak}-day streak
                  </span>
                )}
                {overallAvg > 0 && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-100 text-indigo-700">
                    Average score: {overallAvg}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 2 — "Where do they need help?"
          4 subject tiles — stars not percentages
      ════════════════════════════════════════════ */}
      <div>
       <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500" />
          How are they doing in each subject?
        </h3>        <div className="grid grid-cols-2 gap-3">
          {subjectFilteredStats.map((s) => {
            const stars  = scoreToStars(s.avg);
            const hasData = s.count > 0;
            const trendUp = s.trend !== null && s.trend > 0;
            const trendDn = s.trend !== null && s.trend < 0;
            return (
              <div key={s.subject}
                className={"rounded-2xl border-2 p-4 transition-all " + (hasData ? SUBJECT_LIGHT_BG[s.subject] + " " + SUBJECT_BORDER[s.subject] : "bg-slate-50 border-slate-200")}>
                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                    <SubjectIconBadge subject={s.subject} size="sm" />
                    <span className={"text-sm font-bold " + (hasData ? SUBJECT_TEXT[s.subject] : "text-slate-400")}>{s.subject}</span>
                  </div>                  {hasData && (
                    <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (trendUp ? "bg-emerald-100 text-emerald-700" : trendDn ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500")}>
                      {trendUp ? "↑ Up" : trendDn ? "↓ Down" : "→ Steady"}
                    </span>
                  )}
                </div>

                {hasData ? (
                  <>
                    {/* Star rating — much easier than % for parents */}
                    <div className="flex gap-0.5 mb-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={"w-4 h-4 " + (n <= stars ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200")} />
                      ))}
                    </div>
                    {/* Plain English label */}
                    <p className="text-xs text-slate-600 font-medium">
                      {stars >= 5 ? "Outstanding! 🎉" :
                       stars >= 4 ? "Doing really well" :
                       stars >= 3 ? "On track" :
                       stars >= 2 ? "Needs more practice" :
                       "Needs extra help"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.count} quiz{s.count !== 1 ? "zes" : ""} · avg {s.avg}%</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">No quizzes yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 3 — Weekly Activity (simple bar)
      ════════════════════════════════════════════ */}
      {weeklyData.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-700 mb-1">📅 Quiz activity by week</h3>
          <p className="text-xs text-slate-400 mb-4">How many quizzes {displayName} completed each week</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
              <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                formatter={(v) => [v + " quiz" + (v !== 1 ? "zes" : ""), "Completed"]}
                labelFormatter={(l) => "📅 " + l}
              />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={36}>
                {weeklyData.map((entry, i) => (
                  <Cell key={i} fill={entry.count === maxWeek ? "#6366F1" : "#c7d2fe"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ════════════════════════════════════════════
          SECTION 4 — "What should I do?" — Next Step
      ════════════════════════════════════════════ */}
      {weakestSubj && weakestSubj.count > 0 && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-sm font-bold text-indigo-800">Suggested next step</p>
              <p className="text-sm text-indigo-700 mt-1 leading-relaxed">
                Encourage {displayName} to practise more <strong>{weakestSubj.subject}</strong> — it's the area where a little extra effort will make the biggest difference right now.
              </p>
              {strongestSubj && strongestSubj.subject !== weakestSubj.subject && (
                <p className="text-xs text-indigo-500 mt-2">
                  💡 They're already strong in <strong>{strongestSubj.subject}</strong> — let them know that's something to be proud of!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          SECTION 5 — AI Teacher's Note
          Written like a note from a teacher,
          not a technical AI report
      ════════════════════════════════════════════ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              📝 {selectedSubject === "All" ? `${displayName}'s Overall Report` : `${displayName}'s ${selectedSubject} Report`}
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {selectedSubject === "All" ? "Across all subjects" : `Based on ${selectedSubject} quizzes only`}
            </p>
          </div>
          <button onClick={onRefresh} disabled={refreshing || feedbackLoading}
            className="text-xs text-indigo-600 font-medium disabled:opacity-40 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1">
            <svg className={"w-3 h-3 " + (refreshing ? "animate-spin" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {feedbackLoading || refreshing ? (
          <FeedbackSkeleton />
        ) : aiSummary ? (
          <div className="space-y-4">
            {/* Summary as a plain letter */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
            </div>

            {/* Focus area — plain English */}
            {aiFocus && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-xs font-bold text-amber-700 mb-1">⚠️ What to work on</p>
                <p className="text-sm text-amber-800 font-medium">{reframeForParent(aiFocus.issue, displayName)}</p>
                {aiFocus.how_to_improve && (
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">{reframeForParent(aiFocus.how_to_improve, displayName)}</p>
                )}
              </div>
            )}

            {/* Tips as simple bullet list — no jargon */}
            {aiTips.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">💡 Simple tips to help at home</p>
                <ul className="space-y-2">
                  {aiTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-indigo-400 font-bold mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Encouragement */}
            {rawFeedback?.encouragement && (
              <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">
                ✨ {reframeForParent(rawFeedback.encouragement, displayName)}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 space-y-2">
            <BookOpen className="w-10 h-10 mx-auto text-slate-200" />
            <p className="text-sm">{displayName} needs to complete a few more quizzes before a report can be generated.</p>
          </div>
        )}
      </Card>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ██████████████████████████████████████████████████████
   CHILD VIEW
   ██████████████████████████████████████████████████████
   ═══════════════════════════════════════════════════════════ */

function ChildView({ tests, displayName, cumulativeFeedback, feedbackLoading, refreshing, onRefresh, timeFilter, setTimeFilter, selectedSubject, setSelectedSubject  }) {
  const subjectStats = useMemo(() => buildSubjectStats(tests), [tests]);
  const streak       = useMemo(() => calcStreak(tests), [tests]);
  const totalTests   = tests.length;
  const avgScore     = useMemo(() => {
    const s = tests.map((t) => normaliseScore(t));
    return s.length ? Math.round(s.reduce((a, v) => a + v, 0) / s.length) : 0;
  }, [tests]);
  const level = useMemo(() => childLevel(totalTests, avgScore), [totalTests, avgScore]);

  const subjectTests = selectedSubject === "All" ? tests : tests.filter((t) => t.subject === selectedSubject);

  const { data: trendData, mode: trendMode } = useMemo(() => buildAllSubjectsTrend(tests), [tests]);
  const chronoData      = useMemo(() => buildChronologicalTrend(subjectTests), [subjectTests]);
  const donutData       = useMemo(() => buildDonutData(subjectTests), [subjectTests]);
  const freqData        = useMemo(() => buildWeeklyFrequency(tests), [tests]);
  const maxFreq         = freqData.length ? Math.max(...freqData.map((d) => d.count)) : 0;
  const activeSubjs     = SUBJECTS.filter((s) => trendData.some((d) => d[s] !== null));

  const subjectColor    = selectedSubject !== "All" ? SUBJECT_COLORS[selectedSubject] : "#6366F1";

  // AI feedback for selected subject
  const feedbackDoc  = cumulativeFeedback[selectedSubject === "All" ? "Overall" : selectedSubject] || null;
  const rawFeedback  = feedbackDoc?.feedback;

  const childSummary      = rawFeedback?.summary      ? reframeForChild(rawFeedback.summary, displayName)      : null;
  const childEncouragement= rawFeedback?.encouragement? reframeForChild(rawFeedback.encouragement, displayName) : null;
  const childTips         = rawFeedback?.study_tips?.slice(0, 3).map((t) => reframeForChild(t, displayName))   || [];
  const childStrengths    = rawFeedback?.strengths?.slice(0, 3).map((s) => reframeForChild(s, displayName))    || [];
  const childImprovements = rawFeedback?.areas_for_improvement?.slice(0, 2).map((a) => ({
    issue:          reframeForChild(a.issue, displayName),
    how_to_improve: reframeForChild(a.how_to_improve, displayName),
  })) || [];


  return (
    <div className="space-y-4">

      {/* ── Subject + time filters ── */}
      <div className="flex flex-col gap-2">
        {/* Subject tabs */}
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "All", label: "🏠 All" }, ...SUBJECTS.map((s) => ({ value: s, label: SUBJECT_EMOJI[s] + " " + s }))].map((opt) => {
            const isActive = selectedSubject === opt.value;
            const activeBg = opt.value !== "All" ? SUBJECT_BG[opt.value] : "bg-indigo-600";
            return (
              <button key={opt.value} onClick={() => setSelectedSubject(opt.value)}
                className={"px-3 py-1.5 rounded-xl text-xs font-bold border transition-all " + (isActive ? activeBg + " text-white border-transparent shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300")}>
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* Time filter */}
        <div className="flex justify-end">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {TIME_FILTERS.map((f, i) => (
              <button key={f.label} onClick={() => setTimeFilter(i)}
                className={"px-2.5 py-1 rounded-lg text-xs font-medium transition-all " + (timeFilter === i ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          HERO — Streak + Level card
      ════════════════════════════════════════════ */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">Hey {displayName}! 👋</p>
            <h2 className="text-2xl font-black leading-tight">
              {streak > 1 ? "You're on a " + streak + "-day streak! 🔥" :
               totalTests > 0 ? "Keep going, you're doing great!" :
               "Ready to start your journey? 🚀"}
            </h2>
            <p className="text-indigo-200 text-sm mt-1">
              {totalTests > 0 ? totalTests + " quiz" + (totalTests !== 1 ? "zes" : "") + " done · avg " + avgScore + "%" : "Complete your first quiz to get started!"}
            </p>
          </div>
          {/* Level badge */}
          <div className={"shrink-0 rounded-2xl px-4 py-3 text-center min-w-[80px] " + level.bg}>
            <p className="text-2xl leading-none">{level.emoji}</p>
            <p className={"text-[10px] font-black uppercase tracking-wide mt-1 " + level.color}>{level.label}</p>
          </div>
        </div>

        {/* XP bar */}
        {level.next !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-indigo-200 mb-1">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-indigo-300" /> XP Progress</span>              <span>{level.xp} / {level.next} quizzes to next level</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: Math.min((level.xp / level.next) * 100, 100) + "%" }} />
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          STAT CHIPS — quick numbers
      ════════════════════════════════════════════ */}
      {totalTests > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Target className="w-4 h-4 text-indigo-500" />,    bg: "bg-indigo-50",  label: "Avg Score",  value: avgScore + "%",     color: "text-indigo-600" },
            { icon: <Flame  className="w-4 h-4 text-orange-500" />,    bg: "bg-orange-50",  label: "Streak",     value: streak + " days",   color: "text-orange-500" },
            { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, bg: "bg-emerald-50", label: "Quizzes", value: String(totalTests), color: "text-emerald-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <div className={"w-8 h-8 rounded-xl " + stat.bg + " flex items-center justify-center mx-auto"}>
                {stat.icon}
              </div>
              <p className={"text-lg font-black mt-1.5 " + stat.color}>{stat.value}</p>
              <p className="text-[10px] text-slate-400 font-medium">{stat.label}</p>
            </div>
          ))}        </div>
      )}

      {/* ════════════════════════════════════════════
          TWO-COLUMN: Charts LEFT | AI Coach RIGHT
      ════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">

        {/* LEFT — Charts */}
        <div className="space-y-4">

          {/* Chart 1 — Your Journey (score trend) */}
          <Card>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              {selectedSubject === "All" ? "🗺️ Your Learning Journey" : "📈 Your " + selectedSubject + " Journey"}
            </h4>
            <p className="text-[11px] text-slate-400 mb-3">
              {selectedSubject === "All" ? "Every subject over time — watch those lines go up! 🚀" : "Your score each time you practised " + selectedSubject}
            </p>

            {selectedSubject === "All" ? (
              activeSubjs.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <defs>
                        {activeSubjs.map((key) => (
                          <linearGradient key={key} id={"cg-" + key} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => v + "%"} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 8px 30px rgba(0,0,0,0.1)", fontSize: 12 }}
                        formatter={(v, name) => v !== null ? [v + "%", name] : [null, name]} />
                      <Legend verticalAlign="bottom" height={22} iconSize={8}
                        formatter={(v) => <span style={{ fontSize: 11, fontWeight: 700 }}>{v}</span>} />
                      {activeSubjs.map((key) => (
                        <Area key={key} type="monotone" dataKey={key}
                          stroke={SUBJECT_COLORS[key]} strokeWidth={2.5}
                          fill={"url(#cg-" + key + ")"}
                          dot={{ r: 3, fill: SUBJECT_COLORS[key], stroke: "#fff", strokeWidth: 1.5 }}
                          activeDot={{ r: 5 }} connectNulls={trendMode === "monthly"} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                  {trendMode === "attempts" && <p className="text-[10px] text-slate-400 text-center mt-1">Monthly view unlocks after 3+ months 🗓️</p>}
                </>
              ) : <ChartEmpty message="Complete some quizzes to see your journey! 🚀" height={220} />
            ) : (
              chronoData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chronoData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="attempt" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false}
                      label={{ value: "Attempt", position: "insideBottom", offset: -2, fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => v + "%"} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white rounded-xl border border-slate-100 shadow-xl p-3 text-xs">
                          <p className="font-bold text-slate-700 mb-0.5">{d?._name}</p>
                          <p className="text-slate-400">{d?.date}</p>
                          <p className="font-black text-lg mt-1" style={{ color: subjectColor }}>{d?.score}%</p>
                        </div>
                      );
                    }} />
                    <ReferenceLine y={70} stroke={subjectColor} strokeDasharray="5 3" strokeOpacity={0.3}
                      label={{ value: "Target: 70%", position: "insideTopRight", fontSize: 9, fill: subjectColor }} />                    <Line type="monotone" dataKey="score" stroke={subjectColor} strokeWidth={3}
                      dot={{ r: 5, fill: subjectColor, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 7 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <ChartEmpty message={"No " + selectedSubject + " quizzes yet — go try one! 💪"} height={220} />
            )}
          </Card>

          {/* Chart 2 — Subject Power Cards (All view) */}
          {selectedSubject === "All" && (
            <Card>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Your Subject Power
              </h4>              
              <p className="text-[11px] text-slate-400 mb-3">How strong you are in each subject</p>
              <div className="space-y-2.5">
                {subjectStats.map((s) => {
                  const pct  = s.avg ?? 0;
                  const stars = scoreToStars(s.avg);
                  return (
                    <div key={s.subject} className="flex items-center gap-3">
                    <SubjectIconBadge subject={s.subject} size="sm" />                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className={"text-xs font-bold " + (s.count > 0 ? SUBJECT_TEXT[s.subject] : "text-slate-300")}>{s.subject}</span>
                          <span className="text-xs text-slate-500 font-semibold">{s.count > 0 ? pct + "%" : "Not started"}</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + "%", background: s.color }} />
                        </div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {[1,2,3].map((n) => (
                          <Star key={n} className={"w-3 h-3 " + (n <= Math.ceil(stars / 2) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200")} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Chart 3 — Performance Donut */}
          <Card>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">🍩 How are your scores?</h4>
            <p className="text-[11px] text-slate-400 mb-3">
              {selectedSubject === "All" ? "All your quizzes split by score band" : selectedSubject + " quizzes split by score band"}
            </p>
            {donutData.length > 0 ? (() => {
              const total = donutData.reduce((a, d) => a + d.value, 0);
              const top   = donutData.reduce((p, c) => c.value > p.value ? c : p);
              return (
                <div className="flex items-center gap-5">
                  <div className="relative shrink-0">
                    <PieChart width={140} height={140}>
                      <Pie data={donutData} cx={66} cy={66} innerRadius={38} outerRadius={58}
                        paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                        formatter={(v, name) => [v + " quiz" + (v !== 1 ? "zes" : ""), name]} />
                    </PieChart>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl">{top.emoji}</span>
                      <span className="text-[9px] font-black text-slate-600 mt-0.5">{top.label}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {donutData.map((band) => {
                      const pct = Math.round((band.value / total) * 100);
                      return (
                        <div key={band.name}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs font-bold text-slate-600">{band.emoji} {band.label}</span>
                            <span className="text-xs font-black" style={{ color: band.color }}>{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: pct + "%", background: band.color }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-slate-400">{total} total quiz{total !== 1 ? "zes" : ""}</p>
                  </div>
                </div>
              );
            })() : <ChartEmpty message="Complete some quizzes to see this! 🍩" height={140} />}
          </Card>

          {/* Chart 4 — Practice Streak bar */}
          <Card>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">🔥 Practice streak</h4>
            <p className="text-[11px] text-slate-400 mb-3">Quizzes completed each week — try to beat your best week!</p>
            {freqData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={freqData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 8px 30px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(v) => [v + " quiz" + (v !== 1 ? "zes" : ""), "This week"]}
                    labelFormatter={(l) => "🔥 " + l} />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={36}>
                    {freqData.map((entry, i) => <Cell key={i} fill={entry.count === maxFreq ? "#6366F1" : "#c7d2fe"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty message="Start practising to build your streak! 🔥" height={140} />}
          </Card>

        </div>{/* end left charts */}

        {/* RIGHT — AI Coach */}
        <div className="space-y-4">

          {/* Achievements (badges) */}
          {totalTests > 0 && (
            <Card>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🏅 Your Achievements</h4>
              <div className="flex flex-wrap gap-2">
                {totalTests >= 1  && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">🎯 First Quiz!</span>}
                {totalTests >= 5  && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">🚀 5 Quizzes Done</span>}
                {totalTests >= 10 && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">⭐ 10 Quiz Star</span>}
                {totalTests >= 25 && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">🏆 25 Quiz Legend</span>}
                {streak >= 3      && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">🔥 {streak}-Day Streak!</span>}
                {avgScore >= 80   && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">🌟 80%+ Average</span>}
                {avgScore >= 90   && <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">💎 90%+ Champion</span>}
                {subjectStats.filter((s) => s.count > 0).length === 4 && (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">🌈 All 4 Subjects</span>
                )}
              </div>
            </Card>
          )}

          {/* AI Coach Card */}
          <Card>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      🤖 {selectedSubject === "All" ? "Your AI Coach" : `Your ${selectedSubject} Coach`}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {selectedSubject === "All" ? "Personalised just for you" : `Tips for your ${selectedSubject} journey`}
                    </p>
                  </div>
                 <button onClick={onRefresh} disabled={refreshing || feedbackLoading}
                className="text-xs text-indigo-600 font-bold disabled:opacity-40 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1">
                <svg className={"w-3 h-3 " + (refreshing ? "animate-spin" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? "Updating…" : "Update"}
              </button>
                </div>

                {feedbackLoading || refreshing ? (
                  <FeedbackSkeleton />
                ) : childSummary ? (
                  <div className="space-y-4">
                    {rawFeedback.trend && <TrendBadge trend={rawFeedback.trend} />}

                    {/* Summary — child voice */}
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <p className="text-sm text-indigo-800 leading-relaxed font-medium">{childSummary}</p>
                    </div>

                    {/* Strengths — celebrate! */}
                    {childStrengths.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">💪 You're crushing it at</p>
                        <div className="flex flex-wrap gap-1.5">
                          {childStrengths.map((s, i) => (
                            <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✅ {s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next level unlocks */}
                    {childImprovements.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">🎮 Next level to unlock</p>
                        {childImprovements.map((a, i) => (
                          <div key={i} className={"rounded-xl border p-3 mb-2 " + (selectedSubject !== "All" ? SUBJECT_LIGHT_BG[selectedSubject] + " " + SUBJECT_BORDER[selectedSubject] : "bg-amber-50 border-amber-200")}>
                            <p className={"text-xs font-bold mb-0.5 " + (selectedSubject !== "All" ? SUBJECT_TEXT[selectedSubject] : "text-amber-700")}>{a.issue}</p>
                            <p className="text-xs text-slate-500 leading-relaxed">{a.how_to_improve}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pro tips */}
                    {childTips.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">⚡ Power moves</p>
                        <div className="flex flex-wrap gap-1.5">
                          {childTips.map((tip, i) => (
                            <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">⚡ {tip}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Encouragement */}
                    {childEncouragement && (
                      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-100 mt-2">
                        <p className="text-sm text-indigo-700 font-semibold">✨ {childEncouragement}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <span className="text-4xl">🤖</span>
                    <p className="text-sm font-bold text-slate-600">Your coach is ready!</p>
                    <p className="text-xs text-slate-400">Complete more quizzes to unlock your personalised coaching report.</p>
                  </div>
                )}


            {/* Per-subject feedback buttons */}
            {selectedSubject === "All" && Object.keys(cumulativeFeedback).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">View by subject</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUBJECTS.map((s) => {
                    const doc = cumulativeFeedback[s];
                    const st  = doc?.status || "none";
                    const icon = { done: "✓", generating: "⏳", error: "✗", none: "○", pending: "○" }[st] || "○";
                    return (
                      <button key={s} onClick={() => setSelectedSubject(s)}
                        className={"flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all " + SUBJECT_LIGHT_BG[s] + " " + SUBJECT_TEXT[s] + " " + SUBJECT_BORDER[s]}>
                        {SUBJECT_EMOJI[s]} {s} {icon}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

        </div>{/* end right AI */}
      </div>{/* end two-col */}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT — routes to Parent or Child view
   ═══════════════════════════════════════════════════════════ */

export default function StudentDashboardAnalytics({
  tests = [],
  displayName = "Student",
  yearLevel = null,
  onLogout = null,
  embedded = false,
  childId: childIdProp = null,
  viewerType = null,
}) {
  const navigate = useNavigate();
  const { logout, logoutChild, childToken, parentToken, user } = useAuth();

  const [timeFilter,         setTimeFilter]         = useState(3);
  const [selectedSubject, setSelectedSubject]       = useState("All");
  
  const [cumulativeFeedback, setCumulativeFeedback] = useState({});
  const [feedbackLoading,    setFeedbackLoading]    = useState(false);
  const [refreshing,         setRefreshing]         = useState(false);
  const pollTimerRef = useRef(null);

  const childId = useMemo(() => {
    if (childIdProp) return childIdProp;
    if (user?.childId) return user.childId;
    if (user?.child_id) return user.child_id;
    return null;
  }, [childIdProp, user]);

  useEffect(() => {
    if(!embedded && !childId){
      navigate("/parent-dashboard", {replace: true});
    }
  },[embedded,childId, navigate]);

  const activeToken  = childToken || parentToken || null;
  const isParentView = viewerType ? viewerType !== "child" : Boolean(parentToken && !childToken);

  // Filter tests by time window
  const timeFilteredTests = useMemo(() => {
    const { days } = TIME_FILTERS[timeFilter];
    if (days === Infinity) return tests;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return tests.filter((t) => new Date(t.date) >= cutoff);
  }, [tests, timeFilter]);

  const loadCumulativeFeedback = useCallback(async () => {
    if (!childId || !activeToken) return;
    try {
      const { feedback, generating } = await fetchCumulativeFeedback(activeToken, childId);
      setCumulativeFeedback(feedback || {});
      const still = generating || Object.values(feedback || {}).some((d) => d.status === "generating" || d.status === "pending");
      if (still) pollTimerRef.current = setTimeout(loadCumulativeFeedback, 4000);
    } catch (err) { console.warn("Failed to load cumulative feedback:", err.message); }
  }, [childId, activeToken]);

  useEffect(() => {
    setFeedbackLoading(true);
    loadCumulativeFeedback().finally(() => setFeedbackLoading(false));
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [loadCumulativeFeedback]);

  const handleRefresh = useCallback(async () => {
    if (!childId || !activeToken || refreshing) return;
    setRefreshing(true);
    try {
      await refreshCumulativeFeedback(activeToken, childId);
      pollTimerRef.current = setTimeout(loadCumulativeFeedback, 3000);
    } catch (err) { console.warn("Refresh failed:", err.message); }
    finally { setRefreshing(false); }
  }, [childId, activeToken, refreshing, loadCumulativeFeedback]);

  const sharedProps = {
    tests: timeFilteredTests,
    displayName,
    yearLevel,
    cumulativeFeedback,
    feedbackLoading,
    refreshing,
    onRefresh: handleRefresh,
    timeFilter,
    setTimeFilter,
    selectedSubject,
    setSelectedSubject,
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40"}>
      <div className={(embedded ? "" : "max-w-screen-xl mx-auto px-4 sm:px-8 py-8 ")}>

        {/* ── Page header (standalone only) ── */}
        {!embedded && (
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-5 border-b border-slate-200">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {yearLevel ? "Year " + yearLevel + " · " : ""}
                {isParentView ? "Parent Dashboard" : "My Learning Dashboard"}
              </p>
            </div>
            {/* View mode pill */}
            <div className={"inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border " + (isParentView ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-indigo-600 text-white border-indigo-600")}>
             <span className="flex items-center gap-1.5">
                {isParentView
                  ? <><Users className="w-3.5 h-3.5" /> Parent View</>
                  : <><User  className="w-3.5 h-3.5" /> {displayName}'s View</>
                }
              </span>            
              </div>
          </header>
        )}

        {/* Year 3: same layout for both parent & child (use parent layout)
            Year 5, 7, 9: distinguish parent vs child views */}
        {([3, 5].includes(Number(yearLevel)) || isParentView) ? (
          <ParentView {...sharedProps}
          selectedSubject={selectedSubject} 
          setSelectedSubject={setSelectedSubject}/>
        ) : (
          <ChildView
            {...sharedProps}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
          />
        )}



      </div>
    </div>
  );
}
