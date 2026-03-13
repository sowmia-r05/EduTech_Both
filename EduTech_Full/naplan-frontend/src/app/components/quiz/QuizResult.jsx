/**
 * QuizResult.jsx  (v8 — TABS INSIDE KAI HEADER)
 *
 * The component owns its own full-page header:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [KAI Logo]    [📋 Results | 📊 Dashboard]    [Name  Avatar] │  ← one sticky bar
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Dashboard tab = pixel-perfect copy of Dashboard.jsx layout.
 *
 * ────────────────────────────────────────────────────────────────
 * REQUIRED CHANGE in ChildDashboard.jsx  (see patch file)
 *
 *   REMOVE the entire wrapper:
 *     <div className="min-h-screen bg-slate-100">
 *       <DashboardHeader> … </DashboardHeader>
 *       <QuizResult … />
 *     </div>
 *
 *   REPLACE WITH:
 *     <QuizResult
 *       result={selectedQuizResult.result}
 *       quizName={selectedQuizResult.quizName}
 *       childStatus={childStatus}
 *       displayName={displayName}
 *       isParentViewing={isParentViewing}
 *       onClose={() => setSelectedQuizResult(null)}
 *       onRetake={…}
 *       onViewAnalytics={…}
 *       onViewAIFeedback={…}
 *     />
 * ────────────────────────────────────────────────────────────────
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth }     from "@/app/context/AuthContext";
import AnswersModal    from "./AnswersModal";
import ChildAvatarMenu from "@/app/components/ui/ChildAvatarMenu";
import DateRangeFilter from "@/app/components/dashboardComponents/DateRangeFilter";

import DonutScoreChart      from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart   from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";
import AICoachPanel         from "@/app/components/dashboardComponents/AICoachPanel";
import AISuggestionPanel    from "@/app/components/dashboardComponents/AISuggestionPanel";

import {
  Trophy, Clock, Target, RefreshCw,
  BarChart2, PieChart, TrendingUp, Lightbulb, Bot, ShieldAlert,
} from "lucide-react";

/* ═══════════════════════════════════════════
   SELF-CONTAINED HEADER
   KAI logo  |  Tab pills  |  Quiz name + Avatar
   ═══════════════════════════════════════════ */
function QuizHeader({ activeTab, onTabChange, quizName, displayName, isParentViewing, onBack, onBackToParent }) {
  const navigate = useNavigate();

  return (
    <nav style={{
      background:    "#fff",
      borderBottom:  "1px solid #E5E7EB",
      height:        "58px",
      display:       "flex",
      alignItems:    "center",
      justifyContent:"space-between",
      padding:       "0 24px",
      position:      "sticky",
      top:           0,
      zIndex:        100,
      gap:           16,
    }}>

      {/* ── Left: KAI logo (identical to DashboardHeader.jsx) ── */}
      <div
        onClick={() => navigate("/")}
        style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", flexShrink:0 }}
      >
        <div style={{
          width:36, height:36, borderRadius:9,
          background:"linear-gradient(135deg,#7C3AED,#6D28D9)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3"  y="3"  width="7" height="7"/>
            <rect x="14" y="3"  width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3"  y="14" width="7" height="7"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>KAI Solutions</div>
          <div style={{ fontSize:10, color:"#9CA3AF", letterSpacing:"0.08em" }}>NAPLAN PREP</div>
        </div>
      </div>

      {/* ── Centre: Tab pills ── */}
      <div style={{
        display:"flex", alignItems:"center",
        background:"#F1F5F9", borderRadius:10, padding:4, gap:4,
      }}>
        {[
          { id:0, emoji:"📋", label:"Results"   },
          { id:1, emoji:"📊", label:"Dashboard" },
        ].map(tab => (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"6px 20px", borderRadius:8,
            border:     activeTab === tab.id ? "1px solid #E2E8F0" : "1px solid transparent",
            background: activeTab === tab.id ? "#fff" : "transparent",
            boxShadow:  activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            color:      activeTab === tab.id ? "#1E293B" : "#64748B",
            fontWeight: 600, fontSize:14, cursor:"pointer",
            transition:"all 0.15s", whiteSpace:"nowrap",
          }}>
            <span style={{ fontSize:16, lineHeight:1 }}>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Right: Quiz name (truncated) + Avatar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flexShrink:0 }}>
        <span style={{
          fontSize:13, color:"#6B7280", fontWeight:500,
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:220,
        }}>
          {quizName}
        </span>
        <ChildAvatarMenu
          displayName={displayName || "Student"}
          isParentViewing={isParentViewing || false}
          onBackToChildDashboard={onBack}
          onBackToParent={onBackToParent}
          isOnAnalyticsPage={false}
        />
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════
   SCORE RING  (Results tab)
   ═══════════════════════════════════════════ */
function ScoreRing({ percentage }) {
  const R = 52, C = 2 * Math.PI * R;
  const color = percentage >= 85 ? "#059669" : percentage >= 70 ? "#d97706"
              : percentage >= 50 ? "#2563eb" : "#dc2626";
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="8"/>
        <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C - (percentage/100)*C}
          className="transition-all duration-1000 ease-out"/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-slate-800">{percentage}%</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TOPIC BREAKDOWN  (Results tab)
   ═══════════════════════════════════════════ */
function TopicBreakdown({ entries }) {
  const [open, setOpen] = useState(false);
  if (!entries?.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
        Topic Breakdown
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180":""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100">
          {entries.map(([name, { scored, total }]) => {
            const pct = total > 0 ? Math.round((scored/total)*100) : 0;
            const bar = pct>=80?"bg-emerald-500":pct>=50?"bg-amber-400":"bg-red-500";
            const txt = pct>=80?"text-emerald-600":pct>=50?"text-amber-600":"text-red-600";
            return (
              <div key={name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 font-medium truncate max-w-[70%]">{name}</span>
                  <span className={`font-semibold ${txt}`}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width:`${pct}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
const buildTopicStrength = (tb={}) => {
  const strong=[], weak=[];
  Object.entries(tb).forEach(([topic,v]) => {
    const total=Number(v?.total)||0, scored=Number(v?.scored)||0;
    if (!total) return;
    const p=scored/total;
    if (p>=0.75) strong.push({ topic, accuracy:p });
    else if (p<=0.5) weak.push({ topic, lostMarks:total-scored });
  });
  return { strongTopics:strong, weakTopics:weak.sort((a,b)=>b.lostMarks-a.lostMarks) };
};

const buildSuggestions = (fb) => {
  if (!fb) return [];
  const list=[];
  if (fb.overall_feedback) list.push({ title:"Overall Feedback", description:fb.overall_feedback });
  (fb.strengths||[]).forEach(s=>list.push({ title:"Strength", description:s }));
  (fb.weaknesses||[]).forEach(w=>list.push({ title:"Weak Area", description:w }));
  (fb.growth_areas||[]).forEach(g=>{ if(g) list.push({ title:"Improvement", description:g }); });
  (fb.areas_of_improvement||[]).forEach(a=>{
    const d=[a?.issue,a?.how_to_improve].filter(Boolean).join(" — ");
    if(d) list.push({ title:"Improvement", description:d });
  });
  if (fb.encouragement) list.push({ title:"Encouragement", description:fb.encouragement });
  return list;
};

const fmtDuration = s => {
  const n=Number(s);
  if (!Number.isFinite(n)||n<=0) return "—";
  const m=Math.floor(n/60), r=Math.round(n%60);
  return m<=0?`${r}s`:`${m}m ${r}s`;
};

const getStatus = pct =>
  pct>=85?{ label:"Outstanding",  cls:"text-emerald-600" }:
  pct>=70?{ label:"Well Done",    cls:"text-emerald-600" }:
  pct>=50?{ label:"On Track",     cls:"text-amber-600"   }:
  pct>=30?{ label:"Developing",   cls:"text-amber-600"   }:
          { label:"More Practice",cls:"text-red-600"     };

/* ═══════════════════════════════════════════
   DASHBOARD STAT CARD  (matches Dashboard.jsx)
   ═══════════════════════════════════════════ */
function StatCard({ id, iconEl, label, value, valueClass }) {
  return (
    <div id={id} className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center gap-1 h-24">
      <div className="flex items-center gap-1.5 mb-0.5">
        {iconEl}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DASHBOARD CHART CARD HEADER
   ═══════════════════════════════════════════ */
function CardHeader({ iconBg, iconEl, title }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-slate-100">
      <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>{iconEl}</div>
      <span className="text-sm font-semibold text-slate-700">{title}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DASHBOARD TAB  — compact, exact Dashboard.jsx layout
   Fixed: uses childId + apiFetch (no broken user.username)
   ═══════════════════════════════════════════ */
function DashboardTab({ result, quizName, score, topics, violations, childId: childIdProp }) {
  const { childToken, parentToken, childProfile, apiFetch } = useAuth();

  const [fullResult,    setFullResult]    = useState(null);
  const [fetchingFull,  setFetchingFull]  = useState(false);
  const [allAttempts,   setAllAttempts]   = useState([]);
  const [selectedDate,  setSelectedDate]  = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);

  const attemptId = result?.attempt_id || result?.response_id || null;
  // Use childId from prop first, then from childProfile (JWT)
  const childId   = childIdProp || childProfile?.childId || null;

  // Fetch the full result (ai_feedback, duration, proctoring) on mount
  useEffect(() => {
    if (!attemptId) return;
    setFetchingFull(true);
    apiFetch(`/api/results/${encodeURIComponent(attemptId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFullResult(d); })
      .catch(() => {})
      .finally(() => setFetchingFull(false));
  }, [attemptId, apiFetch]);

  // Fetch ALL attempts for this child via proven /api/children/:id/results endpoint
  useEffect(() => {
    if (!childId) return;
    apiFetch(`/api/children/${childId}/results`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!Array.isArray(d)) return;
        // Filter to same quiz only
        const qn = (quizName || "").toLowerCase();
        const filtered = qn
          ? d.filter(a => (a.quiz_name || "").toLowerCase() === qn)
          : d;
        setAllAttempts(filtered);
      })
      .catch(() => {});
  }, [childId, quizName, apiFetch]);

  // When user selects a specific attempt from the calendar, load its full data
  useEffect(() => {
    if (!activeAttempt) return;
    const rid = activeAttempt?.attempt_id || activeAttempt?.response_id;
    if (!rid) return;
    apiFetch(`/api/results/${encodeURIComponent(rid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFullResult(d); })
      .catch(() => {});
  }, [activeAttempt, apiFetch]);

  // Merge fetched > props
  const activeResult = fullResult || result;
  const activeTopics = fullResult?.topicBreakdown || fullResult?.topic_breakdown || topics;
  const activeScore  = fullResult?.score || score;

  const pct       = activeScore.percentage || 0;
  const duration  = fmtDuration(fullResult?.duration_sec || fullResult?.duration || result.duration);
  const status    = getStatus(pct);
  const violCount = fullResult?.proctoring?.violations ?? violations ?? 0;

  const { strongTopics, weakTopics } = useMemo(() => buildTopicStrength(activeTopics), [activeTopics]);
  const suggestions = useMemo(() => buildSuggestions(activeResult?.ai_feedback), [activeResult?.ai_feedback]);

  // Calendar dots — one per attempt date
  const testTakenDates = useMemo(() =>
    allAttempts.map(a => {
      const raw = a?.createdAt || a?.date_submitted || a?.submitted_at;
      if (!raw) return null;
      const d = new Date(typeof raw === "object" && raw.$date ? raw.$date : raw);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0); return d;
    }).filter(Boolean),
    [allAttempts]
  );

  const attemptDate = useMemo(() => {
    const raw = activeResult?.submitted_at || activeResult?.date_submitted || activeResult?.createdAt;
    if (!raw) return null;
    const d = new Date(typeof raw === "object" && raw.$date ? raw.$date : raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-AU", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  }, [activeResult]);

  return (
    <div className="min-h-screen bg-gray-100">

      {/* PAGE TITLE ROW */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 gap-4 flex-wrap">
        <h1 className="text-xl font-bold leading-tight">
          <span className="text-slate-800">{quizName} </span>
          <span className="text-teal-600">– Report</span>
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Attempt count */}
          <div className="flex items-center gap-1 px-2 py-1 bg-teal-50 rounded-lg border border-teal-100 text-xs">
            <svg className="w-3 h-3 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span className="font-semibold text-teal-700">
              {allAttempts.length > 0 ? `${allAttempts.length} attempt${allAttempts.length !== 1 ? "s" : ""}` : "1 attempt"}
            </span>
          </div>
          {/* Subject */}
          {activeResult?.subject && (
            <span className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-600">
              {activeResult.subject}
            </span>
          )}
          {/* Date of current attempt */}
          {attemptDate && (
            <div className="flex items-center gap-1 px-2 py-1 bg-teal-50 rounded-lg border border-teal-100 text-xs">
              <svg className="w-3 h-3 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
              </svg>
              <span className="font-semibold text-teal-700">{attemptDate}</span>
            </div>
          )}
          {/* Calendar filter */}
          <DateRangeFilter
            selectedDate={selectedDate}
            onChange={(date) => { setSelectedDate(date); setActiveAttempt(null); }}
            testTakenDates={testTakenDates}
            quizAttempts={allAttempts}
            onAttemptSelect={(attempt) => { setActiveAttempt(attempt); setSelectedDate(null); }}
          />
        </div>
      </div>

      {/* Loading bar */}
      {fetchingFull && (
        <div className="px-6 pb-1">
          <div className="h-0.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full w-3/5 bg-indigo-400 rounded-full animate-pulse"/>
          </div>
        </div>
      )}

      {/* GRID */}
      <div className="px-6 pb-6 space-y-3">

        {/* ROW 1 — 5 stat cards (compact h-20) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard id="overall-score"  iconEl={<Trophy       className="w-3 h-3 text-indigo-400"/>} label="Overall Score" value={`${pct}%`}                              valueClass="text-indigo-700"/>
          <StatCard id="time-spent"     iconEl={<Clock        className="w-3 h-3 text-sky-400"   />} label="Time Spent"   value={duration}                                 valueClass="text-sky-600"/>
          <StatCard id="result-label"   iconEl={<Target       className="w-3 h-3 text-amber-400" />} label="Result"       value={status.label}                             valueClass={`text-base text-center leading-tight ${status.cls}`}/>
          <StatCard id="points-card"    iconEl={<RefreshCw    className="w-3 h-3 text-violet-400"/>} label="Points"       value={`${activeScore.points||0}/${activeScore.available||0}`} valueClass="text-violet-600"/>
          <StatCard id="violations-card"iconEl={<ShieldAlert  className="w-3 h-3 text-rose-400"  />} label="Violations"  value={violCount}                                 valueClass={violCount > 0 ? "text-rose-600" : "text-emerald-600"}/>
        </div>

        {/* ROW 2 — Donut (2/5) + WeakTopics (3/5) — height 160 */}
        <div className="grid grid-cols-5 gap-3">
          <div id="donut-chart" className="col-span-5 sm:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
            <CardHeader iconBg="bg-indigo-50" iconEl={<PieChart className="w-4 h-4 text-indigo-500"/>} title="Performance Overview"/>
            <div className="flex-1 p-3">
              <DonutScoreChart correctPercent={pct} incorrectPercent={100-pct} height={160} showTitle={false}/>
            </div>
          </div>
          <div id="weak-topics" className="col-span-5 sm:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
            <CardHeader iconBg="bg-rose-50" iconEl={<TrendingUp className="w-4 h-4 text-rose-500"/>} title="Priority Improvement Areas"/>
            <div className="flex-1 p-3">
              <WeakTopicsBarChart topics={weakTopics} height={160} showTitle={false}/>
            </div>
          </div>
        </div>

        {/* ROW 3 — TopTopics (2/5) + Suggestions (3/5) — height 160 */}
        <div className="grid grid-cols-5 gap-3">
          <div id="top-topics" className="col-span-5 sm:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
            <CardHeader iconBg="bg-emerald-50" iconEl={<BarChart2 className="w-4 h-4 text-emerald-500"/>} title="Strong Topics"/>
            <div className="flex-1 p-3">
              <TopTopicsFunnelChart topicBreakdown={activeTopics} topN={5} height={160} showTitle={false}/>
            </div>
          </div>
          <div id="suggestions" className="col-span-5 sm:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
            <CardHeader iconBg="bg-amber-50" iconEl={<Lightbulb className="w-4 h-4 text-amber-500"/>} title="Study Suggestions"/>
            <div className="flex-1 p-3">
              <AISuggestionPanel suggestions={suggestions}
                studyTips={activeResult?.ai_feedback?.study_tips||[]}
                topicWiseTips={activeResult?.ai_feedback?.topic_wise_tips||[]}
                showTitle={false}/>
            </div>
          </div>
        </div>

        {/* ROW 4 — AI Coach full width */}
        <div id="ai-coach" className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <CardHeader iconBg="bg-teal-50" iconEl={<Bot className="w-4 h-4 text-teal-500"/>} title="AI Coach Feedback"/>
          <div className="flex-1 overflow-hidden">
            <AICoachPanel feedback={activeResult?.ai_feedback}
              strongTopics={strongTopics} weakTopics={weakTopics} showTitle={false}/>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════ */
export default function QuizResult({
  result           = {},
  quizName         = "Quiz",
  violations       = 0,
  onClose,
  onRetake,
  onViewAnalytics,
  onViewAIFeedback,
  childStatus:     childStatusProp,
  displayName,        // ← pass from ChildDashboard
  isParentViewing,    // ← pass from ChildDashboard
}) {
  const navigate = useNavigate();
  const { childProfile, apiFetch, childToken, parentToken } = useAuth();
  const authRef = useRef({ childProfile });
  useEffect(() => { authRef.current = { childProfile }; }, [childProfile]);

  const [activeTab,   setActiveTab]   = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const [liveStatus,  setLiveStatus]  = useState(null);

  const score      = result.score           || {};
  const topics     = result.topic_breakdown || {};
  const isWriting  = result.is_writing      || false;
  const aiStatus   = result.ai_status       || null;
  const attemptId  = result.attempt_id || result.response_id || null;
  const percentage = score.percentage || 0;

  const resolvedName = displayName || childProfile?.displayName || "Student";

  /* AI status polling */
  useEffect(() => {
    if (!attemptId || !["queued","generating","pending"].includes(aiStatus)) return;
    const token = childToken || parentToken;
    let timer;
    const poll = async () => {
      try {
        const h = { Accept:"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) };
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL||""}/api/attempts/${attemptId}/ai-status`, { headers:h });
        if (res.ok) {
          const d = await res.json();
          if (d.status==="done"||d.status==="ai_done") setLiveStatus("done");
          else if (d.status==="error") setLiveStatus("error");
          else timer = setTimeout(poll, 5000);
        }
      } catch {}
    };
    timer = setTimeout(poll, 5000);
    return () => clearTimeout(timer);
  }, [attemptId, aiStatus, childToken, parentToken]);

  /* fetch live child subscription status */
  useEffect(() => {
    if (!childToken && !parentToken) return;
    (async () => {
      try {
        const res = await apiFetch("/api/children/me");
        if (res.ok) { const d = await res.json(); setLiveStatus(d.status||null); }
      } catch {}
    })();
  }, [apiFetch, childToken, parentToken]);

  const gradeLabel = useMemo(() => {
    if (percentage>=90) return "Outstanding!";
    if (percentage>=80) return "Great job!";
    if (percentage>=70) return "Good work!";
    if (percentage>=50) return "Keep practicing!";
    return "More practice needed";
  }, [percentage]);

  const topicEntries = useMemo(() =>
    Object.entries(topics).sort((a,b) => {
      const pA = a[1].total>0 ? a[1].scored/a[1].total : 0;
      const pB = b[1].total>0 ? b[1].scored/b[1].total : 0;
      return pA-pB;
    }), [topics]
  );

  const handleViewAnalytics = useCallback(() => {
    if (onViewAnalytics) onViewAnalytics();
    else navigate("/child-dashboard");
  }, [navigate, onViewAnalytics]);

  const handleViewAIFeedback = useCallback(() => {
    if (!attemptId) return;
    if (onViewAIFeedback) { onViewAIFeedback(attemptId, result?.subject, quizName); return; }
    const { childProfile:cp } = authRef.current;
    const s = liveStatus||childStatusProp||cp?.status||"trial";
    const p = new URLSearchParams({ r:attemptId });
    if (cp?.username)    p.set("username",  cp.username);
    if (result?.subject) p.set("subject",   result.subject);
    if (quizName)        p.set("quiz_name", quizName);
    p.set("status", s);
    navigate(isWriting
      ? `/writing-feedback/result?${p}`
      : `/NonWritingLookupQuizResults/results?${p}`
    );
  }, [attemptId, result?.subject, quizName, isWriting, childStatusProp, liveStatus, onViewAIFeedback, navigate]);

  /* ── shared icon SVGs ── */
  const IcAnswers = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  );
  const IcAnalytics = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z"/>
    </svg>
  );
  const IcAI = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
    </svg>
  );
  const IcRetake = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
    </svg>
  );
  const IcChevron = () => (
    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
    </svg>
  );

  const ActionBtn = ({ onClick, icon, label, variant="default", badge }) => (
    <button onClick={onClick} className={`
      group w-full inline-flex items-center justify-between px-5 py-4 rounded-xl transition-all shadow-sm
      ${variant==="indigo"
        ? "border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300"
        : "border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"}
    `}>
      <span className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
          ${variant==="indigo"
            ? "bg-indigo-100 group-hover:bg-indigo-200 text-indigo-600"
            : "bg-slate-100 group-hover:bg-slate-200 text-slate-600"}`}>
          {icon}
        </span>
        <span className={`text-sm font-semibold ${variant==="indigo"?"text-indigo-800":"text-slate-700"}`}>
          {label}
          {badge && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-700 uppercase tracking-wide">{badge}</span>}
        </span>
      </span>
      <IcChevron/>
    </button>
  );

  /* ════════════════════════════════════════
     RENDER
     ════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ONE sticky bar: logo + tabs + avatar */}
      <QuizHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        quizName={quizName}
        displayName={resolvedName}
        isParentViewing={isParentViewing}
        onBack={onClose}
        onBackToParent={() => navigate("/parent-dashboard")}
      />

      {/* ── TAB 1: RESULTS ── */}
      {activeTab === 0 && (
        <div className="px-4 py-8">
          <div className="max-w-xl mx-auto space-y-4">

            <div className="text-center space-y-1 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Quiz Complete</p>
              <h1 className="text-xl font-bold text-slate-800">{quizName}</h1>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
              <div className="flex justify-center"><ScoreRing percentage={percentage}/></div>
              <div>
                <p className="text-base font-bold text-slate-800">{gradeLabel}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {score.points||0} / {score.available||0} points &middot; Grade {score.grade||"—"}
                </p>
              </div>
            </div>

            <TopicBreakdown entries={topicEntries}/>

            {/* Writing AI status banner */}
            {isWriting && (
              <div className={`rounded-2xl p-5 flex items-center gap-4 border ${
                aiStatus==="error"?"bg-red-50 border-red-200":"bg-violet-50 border-violet-200"}`}>
                <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${
                  aiStatus==="error"?"bg-red-100":"bg-violet-100"}`}>
                  {aiStatus==="done"
                    ? <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    : aiStatus==="error"
                    ? <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
                    : <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"/>
                  }
                </div>
                <div>
                  <p className={`text-sm font-semibold ${aiStatus==="error"?"text-red-700":"text-violet-800"}`}>
                    {aiStatus==="done"?"AI Feedback Ready":aiStatus==="error"?"AI Feedback Unavailable":"Generating AI Feedback…"}
                  </p>
                  <p className={`text-xs mt-0.5 ${aiStatus==="error"?"text-red-500":"text-violet-500"}`}>
                    {aiStatus==="done"?"View detailed writing analysis below":aiStatus==="error"?"Something went wrong. Try again later.":"This may take up to 30 seconds"}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              {!isWriting && <ActionBtn onClick={() => setShowAnswers(true)} icon={<IcAnswers/>} label="View My Answers"/>}
              {onViewAnalytics && <ActionBtn onClick={handleViewAnalytics} icon={<IcAnalytics/>} label="View Progress"/>}
              {attemptId && (
                <ActionBtn onClick={handleViewAIFeedback} icon={<IcAI/>} label="View Test Insights"
                  variant="indigo"
                  badge={liveStatus && liveStatus!=="trial" ? liveStatus : null}/>
              )}
              {onRetake && <ActionBtn onClick={onRetake} icon={<IcRetake/>} label="Retake Quiz"/>}
            </div>

          </div>
        </div>
      )}

      {/* ── TAB 2: DASHBOARD ── */}
      {activeTab === 1 && (
        <DashboardTab
          result={result}
          quizName={quizName}
          score={score}
          topics={topics}
          violations={violations}
          childId={childProfile?.childId || null}
        />
      )}

      {showAnswers && !isWriting && (
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