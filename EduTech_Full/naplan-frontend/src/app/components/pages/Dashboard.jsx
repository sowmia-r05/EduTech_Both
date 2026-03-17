import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";

import StatCard from "@/app/components/dashboardComponents/StatCard";
import AICoachPanel from "@/app/components/dashboardComponents/AICoachPanel";
import DonutScoreChart from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import AISuggestionPanel from "@/app/components/dashboardComponents/AISuggestionPanel";
import ChildAvatarMenu from "@/app/components/ui/ChildAvatarMenu";
import {
  BarChart2,
  PieChart,
  TrendingUp,
  Lightbulb,
  Bot,
  Trophy,
  Clock,
  Target,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";
import DateRangeFilter from "@/app/components/dashboardComponents/DateRangeFilter";
import DashboardTour from "@/app/components/dashboardComponents/DashboardTour";
import DashboardTourModal from "@/app/components/dashboardComponents/DashboardTourModal";
import TrialGateOverlay from "@/app/components/common/TrialGateOverlay";

import DashboardHeader from "@/app/components/layout/DashboardHeader";
import AvatarMenu from "@/app/components/dashboardComponents/DashboardAvatarMenu";




import { useAuth } from "@/app/context/AuthContext";

import {
  fetchResultsByEmail,
  fetchResultsByUsername,
  fetchResultByResponseId,
} from "@/app/utils/api";

/* ═══════════════════ Helpers (unchanged) ═══════════════════ */

const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;



const formatDuration = (seconds) => {
  const secs = Number(seconds);
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m <= 0 ? `${s}s` : `${m}m ${s}s`;
};

const buildTopicStrength = (topicBreakdown = {}) => {
  const strong = [];
  const weak = [];
  Object.entries(topicBreakdown).forEach(([topic, v]) => {
    const total = Number(v?.total) || 0;
    const scored = Number(v?.scored) || 0;
    if (!total) return;
    const accuracy = scored / total;
    if (accuracy >= 0.75) strong.push({ topic, accuracy });
    else if (accuracy <= 0.5) weak.push({ topic, lostMarks: total - scored });
  });
  return { strongTopics: strong, weakTopics: weak.sort((a, b) => b.lostMarks - a.lostMarks) };
};



const buildSuggestionsFromFeedback = (feedback) => {
  if (!feedback) return [];
  const list = [];
  if (feedback.overall_feedback) list.push({ title: "Overall Feedback", description: feedback.overall_feedback });
  (feedback.strengths || []).forEach((s) => list.push({ title: "Strength", description: s }));
  (feedback.weaknesses || []).forEach((w) => list.push({ title: "Weak Area", description: w }));
  (feedback.growth_areas || []).forEach((g) => { if (g) list.push({ title: "Improvement", description: g }); });
  (feedback.areas_of_improvement || []).forEach((a) => {
    const desc = [a?.issue, a?.how_to_improve].filter(Boolean).join(" — ");
    if (desc) list.push({ title: "Improvement", description: desc });
  });
  if (feedback.encouragement) list.push({ title: "Encouragement", description: feedback.encouragement });
  return list;
};

const deduplicateAttempts = (attempts) => {
  const seen = new Set();
  return attempts.filter((r) => {
    const respId = r?.response_id || r?.responseId || "";
    const attempt = r?.attempt ?? "";
    const key = `${respId}__${attempt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getResultStatus = (percentage) => {
  const pct = Math.round(Number(percentage || 0));
  if (pct > 90) return { label: "Outstanding", status: "successful" };
  if (pct > 70) return { label: "Well Done", status: "pass" };
  if (pct > 50) return { label: "On Track", status: "medium" };
  if (pct > 30) return { label: "Developing", status: "med" };
  return { label: "Needs Practice", status: "needs attention" };
};

const isAiPending = (doc) => {
  if (!doc) return false;
  const legacyStatus = String(doc?.ai?.status || "").toLowerCase();
  if (["queued", "fetching", "generating", "verifying", "pending"].includes(legacyStatus))
    return true;
  const nativeStatus = String(doc?.ai_feedback_meta?.status || "").toLowerCase();
  if (["pending", "queued", "generating"].includes(nativeStatus)) return true;
  return false;
};

/* ═══════════════════ Inline Components ═══════════════════ */

const DotLoader = ({ label = "Loading" }) => (
  <div className="flex flex-col items-center justify-center">
    <div className="flex items-center gap-2" aria-label={label} role="status">
      <span className="dot-loader dot1">.</span>
      <span className="dot-loader dot2">.</span>
      <span className="dot-loader dot3">.</span>
    </div>
    <style>{`
      .dot-loader { font-size: 64px; font-weight: 700; opacity: 0.25; animation: dotPulse 1s infinite ease-in-out; }
      .dot1 { animation-delay: 0s; } .dot2 { animation-delay: 0.15s; } .dot3 { animation-delay: 0.3s; }
      @keyframes dotPulse { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
    `}</style>
  </div>
);

const NoDataModal = ({ isOpen, onClose, onClearFilter }) => {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handleEsc); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="text-2xl">📅</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">No Results Found</h2>
            <p className="text-sm text-gray-600 mt-1">There are no quiz attempts recorded for the selected date.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-100 transition">Close</button>
          <button onClick={onClearFilter} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">Clear Filter</button>
        </div>
      </div>
    </div>
  );
};

const AiPendingOverlay = ({ aiMessage }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
      <div className="mx-auto mb-6 w-16 h-16 relative">
        <div className="absolute inset-0 rounded-full border-4 border-purple-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">Preparing Your Results</h3>
      <p className="text-sm text-gray-500 mb-4">{aiMessage || "Our AI is analysing your performance — this usually takes 15–30 seconds."}</p>
      <div className="flex justify-center gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">Please wait — your dashboard will update automatically</p>
    </div>
  </div>
);

const isHtmlString = (str) => typeof str === "string" && /<!DOCTYPE|<html|<body|<pre>/i.test(str);

const ResultNotFound = ({ errorMessage, onGoBack }) => {
  const friendlyMessage = errorMessage && !isHtmlString(errorMessage)
    ? errorMessage
    : "We couldn't load this quiz result. It may still be processing or the link may be incorrect.";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 p-8 text-center">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Result Not Found</h2>
        <p className="text-sm text-gray-500 mb-2">{friendlyMessage}</p>
        <p className="text-xs text-gray-400 mb-6">If you just submitted the quiz, wait a few seconds and try again.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">Try Again</button>
          <button onClick={onGoBack} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">Go Back</button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════ DASHBOARD ═══════════════════ */
export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromQuizResult = location.state?.fromQuizResult === true;

  const { activeToken, isInitializing, childToken, childProfile, parentToken } = useAuth();

  const responseId    = String(location.state?.r        || searchParams.get("r")        || "").trim();
  const hasResponseId = !!responseId;
  const usernameParam = String(location.state?.username  || searchParams.get("username") || "").trim();
  const subjectParam  = String(location.state?.subject   || searchParams.get("subject")  || "").trim();
  const quizNameParam = String(location.state?.quiz_name || searchParams.get("quiz_name")|| "").trim();


  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);
  const [selectedAttemptOverride, setSelectedAttemptOverride] = useState(null);
  const [aiPending, setAiPending] = useState(false);


  const isParentViewing = !childToken && !!parentToken;
   const [childStatus, setChildStatus] = useState("trial");
  const yearLevel = childProfile?.yearLevel || null;

  const viewerType = childToken && !isParentViewing
    ? "child"
    : isParentViewing
      ? "parent_viewing_child"
      : "parent";

  useEffect(() => { if (!hasResponseId) navigate("/child-dashboard", { replace: true }); }, [hasResponseId, navigate]);

  useEffect(() => {
    if (!hasResponseId || isInitializing) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingLatest(true);
        setLoadError(null);
        const authOpts = activeToken ? { headers: { Authorization: `Bearer ${activeToken}` } } : {};
        const doc = await fetchResultByResponseId(responseId, authOpts);
        if (!doc) {
          if (!cancelled) setLoadError("Result not found or still being processed.");
          return;
        }
        if (!cancelled) {
          setLatestResult(doc);
          if (isAiPending(doc)) setAiPending(true);
          const username = searchParams.get("username") || doc.username || doc.user?.user_name || "";
          const subject  = searchParams.get("subject") || "";
          const childId  = doc.child_id || doc.childId || null;
          let all;
          if (username) {
            all = await fetchResultsByUsername(username, {
              subject: subject || undefined,
              headers: { Authorization: `Bearer ${activeToken}` },
            });
          } else if (childId) {
            // ✅ Native quiz children have no username/email — fetch by child_id instead
            const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
            const res = await fetch(
              `${API_BASE}/api/children/${childId}/results`,
              { credentials: "include", headers: { Authorization: `Bearer ${activeToken}` } }
            );
            const data = res.ok ? await res.json() : [];
            all = Array.isArray(data) ? data : [doc];
          } else {
            const email = doc.user?.email_address || "";
            if (email) {
              all = await fetchResultsByEmail(email, {
                quiz_name: doc.quiz_name,
                headers: { Authorization: `Bearer ${activeToken}` },
              });
            } else {
              all = [doc];
            }
          }

          if (!cancelled) setResultsList(all || [doc]);
        }
      } catch (err) {
        console.error("Dashboard load error:", err.message);
        if (!cancelled) setLoadError(err.message || "Failed to load result.");
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    };
    load();
    return () => (cancelled = true);
  }, [responseId, hasResponseId, searchParams, activeToken, isInitializing]);

  useEffect(() => {
    if (!aiPending || !responseId) return;
    let cancelled = false;
    let pollCount = 0;
    const MAX_POLLS = 30;
    const poll = async () => {
      if (cancelled || pollCount >= MAX_POLLS) { setAiPending(false); return; }
      pollCount++;
      try {
        const authOpts = activeToken ? { headers: { Authorization: `Bearer ${activeToken}` } } : {};
        const freshDoc = await fetchResultByResponseId(responseId, authOpts);
        if (cancelled) return;
        if (freshDoc && !isAiPending(freshDoc)) {
          setLatestResult(freshDoc);
          setAiPending(false);
          const username = searchParams.get("username") || freshDoc.user?.user_name || "";
          const subject = searchParams.get("subject") || "";
          let all;
          if (username) {
            all = await fetchResultsByUsername(username, { subject: subject || undefined, headers: { Authorization: `Bearer ${activeToken}` } });
          } else {
            const email = freshDoc.user?.email_address || "";
          if (email) {
            all = await fetchResultsByEmail(email, { quiz_name: freshDoc.quiz_name, headers: { Authorization: `Bearer ${activeToken}` } });
          } else {
            all = [freshDoc];
          }
          }
          if (!cancelled) setResultsList(all || [freshDoc]);
          return;
        }
        if (freshDoc && !cancelled) setLatestResult(freshDoc);
      } catch (err) { console.warn("Polling error:", err.message); }
      if (!cancelled) setTimeout(poll, 4000);
    };
    const timer = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [aiPending, responseId, searchParams, activeToken]);

     useEffect(() => {
     if (!latestResult || !activeToken) return;
     const childId = latestResult?.child_id
       || latestResult?.childId
       || null;

     if (!childId) return;

     const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
     fetch(`${API_BASE}/api/children/${childId}/available-quizzes`, {
       headers: { Authorization: `Bearer ${activeToken}` },
       credentials: "include",
     })
       .then((r) => r.ok ? r.json() : null)
       .then((data) => {
         if (data?.child_status) setChildStatus(data.child_status);
       })
       .catch(() => {});
   }, [latestResult, activeToken]);

  useEffect(() => { if (!localStorage.getItem("dashboardTourPrompted")) setShowTourModal(true); }, []);

  const quizAttempts = useMemo(() => {
    if (!latestResult) return [];
    const subject = searchParams.get("subject") || "";
    const quizName = searchParams.get("quiz_name") || "";
    let attempts;
    if (quizName) {
      attempts = resultsList.filter((r) => r.quiz_name === quizName);
    } else if (subject) {
      attempts = resultsList;
    } else {
      attempts = resultsList.filter((r) => r.quiz_name === latestResult.quiz_name);
    }
    return deduplicateAttempts(attempts);
  }, [resultsList, latestResult, searchParams]);

  const filteredResults = useMemo(() => {
    if (!selectedDate) return quizAttempts;
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
    return quizAttempts.filter((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return false;
      const dt = new Date(raw);
      return dt >= start && dt <= end;
    });
  }, [quizAttempts, selectedDate]);

  useEffect(() => { if (selectedDate) setShowNoDataModal(filteredResults.length === 0); }, [selectedDate, filteredResults]);

  const selectedResult = useMemo(() => {
    if (selectedAttemptOverride) return selectedAttemptOverride;
    if (latestResult) return latestResult;
    if (!filteredResults.length) return null;
    return [...filteredResults].sort((a, b) =>
      new Date(unwrapDate(b.createdAt || b.date_submitted)) -
      new Date(unwrapDate(a.createdAt || a.date_submitted))
    )[0];
  }, [filteredResults, latestResult, selectedAttemptOverride]);

  const testTakenDates = useMemo(() => {
    return quizAttempts.map((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return null;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    }).filter(Boolean);
  }, [quizAttempts]);

  const currentAttemptPosition = useMemo(() => {
    if (!selectedResult || !quizAttempts.length) return 1;
    const sorted = [...quizAttempts].sort((a, b) => {
      const da = new Date(unwrapDate(a?.createdAt || a?.date_submitted) || 0);
      const db = new Date(unwrapDate(b?.createdAt || b?.date_submitted) || 0);
      return da - db;
    });
    const selId = selectedResult?._id;
    const idx = sorted.findIndex((r) => r._id === selId);
    return idx >= 0 ? idx + 1 : 1;
  }, [selectedResult, quizAttempts]);

  if (loadingLatest || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <DotLoader label="Loading dashboard" />
      </div>
    );
  }

  if (loadError || !selectedResult) {
    return <ResultNotFound errorMessage={loadError} onGoBack={() => navigate(-1)} />;
  }


  const percentage = Math.round(Number(selectedResult?.score?.percentage || 0));
  const duration = formatDuration(selectedResult?.duration);
  const attemptsUsed = selectedDate ? filteredResults.length || "—" : quizAttempts.length || "—";
  const { strongTopics, weakTopics } = buildTopicStrength(selectedResult?.topicBreakdown || {});
  const violations =
    selectedResult?.proctoring_summary?.total_violations ||
    selectedResult?.proctoring?.violations ||
    selectedResult?.violations ||
    0;
  const suggestions = buildSuggestionsFromFeedback(selectedResult?.ai_feedback);

  const displayName = `${selectedResult?.user?.first_name || ""} ${selectedResult?.user?.last_name || ""}`.trim()
  || location.state?.childName
  || childProfile?.displayName
  || "Student";

  const resultStatus = getResultStatus(percentage);
  const quizName = selectedResult?.quiz_name || "Quiz";
  const totalAttempts = quizAttempts.length;

return (
  <>
    {fromQuizResult ? (
      <nav style={{
        background:"#fff", borderBottom:"1px solid #E5E7EB",
        height:"58px", display:"flex", alignItems:"center",
        justifyContent:"space-between", padding:"0 24px",
        position:"sticky", top:0, zIndex:100, gap:16,
      }}>
        {/* Left: KAI Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:"linear-gradient(135deg,#7C3AED,#6D28D9)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>KAI Solutions</div>
            <div style={{ fontSize:10, color:"#9CA3AF", letterSpacing:"0.08em" }}>NAPLAN PREP</div>
          </div>
        </div>


        {/* Centre: Results | AI Feedback tab pills */}
        <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", background:"#F1F5F9", borderRadius:10, padding:4, gap:4, zIndex:1 }}>
        <button onClick={() => {
          navigate("/child-dashboard", {
            state: {
              ...location.state,              // ← spreads childId, childName, yearLevel etc.
              fromQuizResult: undefined,
              savedQuizResult: undefined,
              restoreQuizResult: location.state?.savedQuizResult,
            }
          });
        }} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", borderRadius:8, border:"1px solid transparent", background:"transparent", color:"#64748B", fontWeight:600, fontSize:14 }}>
          Results
        </button>
          <button style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", borderRadius:8, border:"1px solid #E2E8F0", background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", color:"#1E293B", fontWeight:600, fontSize:14, cursor:"default" }}>
            AI Feedback
            <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"linear-gradient(135deg,#7C3AED,#6D28D9)", color:"#fff", letterSpacing:"0.06em" }}>AI</span>
          </button>
        </div>


        {/* Right: quiz name + avatar */}
        <div style={{ display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:13, color:"#6B7280", fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:220 }}>
            {quizNameParam}
          </span>
          <ChildAvatarMenu
            displayName={displayName}
            isParentViewing={isParentViewing}
            onBackToChildDashboard={() => navigate("/child-dashboard")}
            onBackToParent={() => navigate("/parent-dashboard")}
          />
        </div>
      </nav>
    ) : (
      <DashboardHeader>
        <AvatarMenu />
      </DashboardHeader>
    )}


    <TrialGateOverlay
      isTrialUser={childStatus === "trial"}
      preset="nonwriting"
      viewerType={viewerType}
      yearLevel={yearLevel}
    >
      <div className="relative min-h-screen bg-gray-100">

         {aiPending && <AiPendingOverlay aiMessage={latestResult?.ai?.message} />}
        <DashboardTour isTourActive={isTourActive} setIsTourActive={setIsTourActive} />
        <DashboardTourModal
          isOpen={showTourModal}
          onStart={() => { setShowTourModal(false); setTimeout(() => setIsTourActive(true), 150); localStorage.setItem("dashboardTourPrompted", "true"); }}
          onSkip={() => { setShowTourModal(false); localStorage.setItem("dashboardTourPrompted", "true"); }}
        />
        <NoDataModal
          isOpen={showNoDataModal}
          onClose={() => setShowNoDataModal(false)}
          onClearFilter={() => { setSelectedDate(null); setSelectedAttemptOverride(null); setShowNoDataModal(false); }}
        />



        {/* ══════════════════════════════════════════════
            PAGE TITLE ROW
        ══════════════════════════════════════════════ */}
        <div className="flex items-center justify-between px-6 pt-3 pb-2 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold leading-tight">
            <span className="text-slate-800">{displayName} – </span>
            <span className="text-teal-600">{quizName} Report</span>
          </h1>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Attempt badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 rounded-lg border border-teal-100 text-xs">
              <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="font-semibold text-teal-700">Viewing {currentAttemptPosition} of {totalAttempts}</span>
              <span className="text-teal-400">attempt{totalAttempts !== 1 ? "s" : ""}</span>
            </div>

            {/* Date / attempt filter */}
            <DateRangeFilter
              selectedDate={selectedDate}
              onChange={(date) => { setSelectedDate(date); setSelectedAttemptOverride(null); }}
              testTakenDates={testTakenDates}
              quizAttempts={quizAttempts}
              onAttemptSelect={(attempt) => { setSelectedAttemptOverride(attempt); }}
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            DASHBOARD GRID
        ══════════════════════════════════════════════ */}
        <div className="px-6 py-3 space-y-3">

          {/* ── ROW 1: 4 Stat Cards ── */}
          <div className="grid grid-cols-5 gap-3">
            <div id="overall-score" className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-col items-center justify-center gap-1 h-20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Trophy className="w-3.5 h-3.5 text-indigo-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall Score</p>
              </div>
              <p className="text-2xl font-bold text-indigo-700">{percentage}%</p>
            </div>

              <div id="time-spent" className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-col items-center justify-center gap-1 h-20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time Spent</p>
              </div>
              <p className="text-2xl font-bold text-sky-600">{duration}</p>
            </div>

            
              <div className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-col items-center justify-center gap-1 h-20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</p>
              </div>
              <p className={`text-xl font-bold text-center leading-tight ${
                resultStatus.status === "needs attention" ? "text-red-600" :
                resultStatus.status === "med" || resultStatus.status === "medium" ? "text-amber-600" :
                resultStatus.status === "pass" || resultStatus.status === "successful" ? "text-green-600" :
                "text-indigo-700"
              }`}>{resultStatus.label}</p>
            </div>

              <div className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-col items-center justify-center gap-1 h-20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attempts Used</p>
              </div>
              <p className="text-2xl font-bold text-violet-600">{attemptsUsed}</p>
            </div>
            {/* Violation Card */}
            <div className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-col items-center justify-center gap-1 h-20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Violations</p>
              </div>
              <p className={`text-2xl font-bold ${violations > 0 ? "text-rose-600" : "text-slate-400"}`}>
                {violations}
              </p>
              {violations > 0 && (
                <p className="text-[10px] text-rose-400 font-medium">
                  {(selectedResult?.proctoring_summary?.tab_switches || selectedResult?.proctoring?.tab_switches || 0)} tab ·{" "}
                  {(selectedResult?.proctoring_summary?.fullscreen_exits || selectedResult?.proctoring?.fullscreen_exits || 0)} fs
                </p>
              )}

            </div>
          </div>

          

          {/* ── ROWS 2+3: Left charts | Right AI Coach ── */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">

            {/* Left column: two chart rows */}
            <div className="flex flex-col gap-4 flex-1 min-w-0">

              {/* Row 2: Donut (2/5) + Weak Topics Bar (3/5) */}
              <div className="grid grid-cols-5 gap-4">
                <div id="donut-chart" className="col-span-5 sm:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <PieChart className="w-4 h-4 text-indigo-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Performance Overview</span>
                  </div>
                  <div className="flex-1 p-3">
                    {/* ✅ showTitle={false} removes the duplicate inner title */}
                    <DonutScoreChart
                      correctPercent={percentage}
                      incorrectPercent={100 - percentage}
                      height={180}
                      showTitle={false}
                    />
                  </div>
                </div>

                <div id="weak-topics" className="col-span-5 sm:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-rose-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Priority Improvement Areas</span>
                  </div>
                  <div className="flex-1 p-3">
                    {/* ✅ showTitle={false} removes the duplicate inner title */}
                    <WeakTopicsBarChart
                      topics={weakTopics}
                      height={180}
                      showTitle={false}
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Top Topics Funnel (2/5) + AI Suggestions (3/5) */}
              <div className="grid grid-cols-5 gap-4">
                <div id="top-topics" className="col-span-5 sm:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Top 5 Topics Overview</span>
                  </div>
                  <div className="flex-1 p-3">
                    {/* title="" already suppresses inner title — unchanged */}
                    <TopTopicsFunnelChart
                      topicBreakdown={selectedResult?.topicBreakdown}
                      topN={5}
                      height={180}
                      title=""
                    />
                  </div>
                </div>

                <div id="suggestions" className="col-span-5 sm:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">AI Study Recommendations</span>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto">
                    {/* ✅ showTitle={false} removes the duplicate inner title */}
                    <AISuggestionPanel
                      suggestions={suggestions}
                      studyTips={selectedResult?.ai_feedback?.study_tips || []}
                      topicWiseTips={selectedResult?.ai_feedback?.topic_wise_tips || []}
                      showTitle={false}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: AI Coach — full height */}
            <div
              id="ai-coach"
              className="w-full lg:w-[460px] flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-teal-500" />
                </div>
                <span className="text-sm font-semibold text-slate-700">AI Coach Feedback</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* ✅ showTitle={false} removes the duplicate inner title */}
                <AICoachPanel
                  feedback={selectedResult?.ai_feedback}
                  strongTopics={strongTopics}
                  weakTopics={weakTopics}
                  showTitle={false}
                  isRegenerating={aiPending}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </TrialGateOverlay>
  </>
);
}