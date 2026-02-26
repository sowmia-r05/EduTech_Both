import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import StatCard from "@/app/components/dashboardComponents/StatCard";
import AICoachPanel from "@/app/components/dashboardComponents/AICoachPanel";
import DonutScoreChart from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import AISuggestionPanel from "@/app/components/dashboardComponents/AISuggestionPanel";
import DashboardAvatarMenu from "@/app/components/dashboardComponents/DashboardAvatarMenu";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";
import DateRangeFilter from "@/app/components/dashboardComponents/DateRangeFilter";
import DashboardTour from "@/app/components/dashboardComponents/DashboardTour";
import DashboardTourModal from "@/app/components/dashboardComponents/DashboardTourModal";

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
  const status = String(doc?.ai?.status || "").toLowerCase();
  return ["queued", "fetching", "generating", "verifying"].includes(status);
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

/* ═══════════════════ DASHBOARD ═══════════════════ */
export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const responseId = String(searchParams.get("r") || "").trim();
  const hasResponseId = Boolean(responseId && responseId !== "[ResponseId]");

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);
  const [selectedAttemptOverride, setSelectedAttemptOverride] = useState(null);
  const [aiPending, setAiPending] = useState(false);

  useEffect(() => { if (!hasResponseId) navigate("/", { replace: true }); }, [hasResponseId, navigate]);

  useEffect(() => {
    if (!hasResponseId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingLatest(true);
        const doc = await fetchResultByResponseId(responseId);
        if (!doc) return;
        if (!cancelled) {
          setLatestResult(doc);
          if (isAiPending(doc)) setAiPending(true);
          const username = searchParams.get("username") || doc.user?.user_name || "";
          const subject = searchParams.get("subject") || "";
          let all;
          if (username) { all = await fetchResultsByUsername(username, { subject: subject || undefined }); }
          else { all = await fetchResultsByEmail(doc.user.email_address, { quiz_name: doc.quiz_name }); }
          setResultsList(all || [doc]);
        }
      } finally { if (!cancelled) setLoadingLatest(false); }
    };
    load();
    return () => (cancelled = true);
  }, [responseId, hasResponseId, searchParams]);

  useEffect(() => {
    if (!aiPending || !responseId) return;
    let cancelled = false; let pollCount = 0; const MAX_POLLS = 30;
    const poll = async () => {
      if (cancelled || pollCount >= MAX_POLLS) { setAiPending(false); return; }
      pollCount++;
      try {
        const freshDoc = await fetchResultByResponseId(responseId);
        if (cancelled) return;
        if (freshDoc && !isAiPending(freshDoc)) {
          setLatestResult(freshDoc); setAiPending(false);
          const username = searchParams.get("username") || freshDoc.user?.user_name || "";
          const subject = searchParams.get("subject") || "";
          let all;
          if (username) { all = await fetchResultsByUsername(username, { subject: subject || undefined }); }
          else { all = await fetchResultsByEmail(freshDoc.user.email_address, { quiz_name: freshDoc.quiz_name }); }
          if (!cancelled) setResultsList(all || [freshDoc]);
          return;
        }
        if (freshDoc && !cancelled) setLatestResult(freshDoc);
      } catch (err) { console.warn("Polling error:", err.message); }
      if (!cancelled) setTimeout(poll, 4000);
    };
    const timer = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [aiPending, responseId, searchParams]);

  useEffect(() => { if (!localStorage.getItem("dashboardTourPrompted")) setShowTourModal(true); }, []);

  const quizAttempts = useMemo(() => {
    if (!latestResult) return [];
    const subject = searchParams.get("subject") || "";
    let attempts;
    if (subject) { attempts = resultsList; }
    else { attempts = resultsList.filter((r) => r.quiz_name === latestResult.quiz_name); }
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
    if (!filteredResults.length) return latestResult;
    return [...filteredResults].sort((a, b) => new Date(unwrapDate(b.createdAt || b.date_submitted)) - new Date(unwrapDate(a.createdAt || a.date_submitted)))[0];
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

  /* --- Attempt position (derived from list, not FlexiQuiz field) --- */
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

  if (loadingLatest) return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><DotLoader label="Loading dashboard" /></div>);
  if (!selectedResult) return null;

  const percentage = Math.round(Number(selectedResult?.score?.percentage || 0));
  const duration = formatDuration(selectedResult?.duration);
  const attemptsUsed = selectedDate ? filteredResults.length || "—" : quizAttempts.length || "—";
  const { strongTopics, weakTopics } = buildTopicStrength(selectedResult?.topicBreakdown || {});
  const suggestions = buildSuggestionsFromFeedback(selectedResult?.ai_feedback);
  const displayName = `${selectedResult?.user?.first_name || ""} ${selectedResult?.user?.last_name || ""}`.trim() || "Student";
  const resultStatus = getResultStatus(percentage);
  const quizName = selectedResult?.quiz_name || "Quiz";
  const totalAttempts = quizAttempts.length;

  return (
    <div className="relative min-h-screen bg-gray-100">
      {aiPending && <AiPendingOverlay aiMessage={latestResult?.ai?.message} />}
      <DashboardTour isTourActive={isTourActive} setIsTourActive={setIsTourActive} />
      <DashboardTourModal isOpen={showTourModal}
        onStart={() => { setShowTourModal(false); setTimeout(() => setIsTourActive(true), 150); localStorage.setItem("dashboardTourPrompted", "true"); }}
        onSkip={() => { setShowTourModal(false); localStorage.setItem("dashboardTourPrompted", "true"); }} />
      <NoDataModal isOpen={showNoDataModal} onClose={() => setShowNoDataModal(false)}
        onClearFilter={() => { setSelectedDate(null); setSelectedAttemptOverride(null); setShowNoDataModal(false); }} />

      {/* ═══════════════ HEADER — upgraded ═══════════════ */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-gray-200/70 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3 gap-2 sm:gap-0">

          {/* Left: breadcrumb + title */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0.5">
              <button onClick={() => navigate(-1)} className="hover:text-blue-600 transition flex items-center gap-1 font-medium">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-gray-500 truncate max-w-[200px]">{quizName}</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight">
              <span className="text-slate-800">{displayName} - </span>
              <span className="text-teal-600">{quizName} Report</span>
            </h1>
          </div>

          {/* Right: attempt badge + filter + avatar */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 rounded-lg border border-teal-100 text-xs">
              <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="font-semibold text-teal-700">Viewing {currentAttemptPosition} of {totalAttempts}</span>
              <span className="text-teal-400">attempt{totalAttempts !== 1 ? "s" : ""}</span>
            </div>
            <DateRangeFilter
              selectedDate={selectedDate}
              onChange={(date) => { setSelectedDate(date); setSelectedAttemptOverride(null); }}
              testTakenDates={testTakenDates}
              quizAttempts={quizAttempts}
              onAttemptSelect={(attempt) => { setSelectedAttemptOverride(attempt); }}
            />
            <DashboardAvatarMenu />
          </div>
        </div>
      </header>

      {/* ═══════════════ DASHBOARD GRID — original layout preserved ═══════════════ */}
      <div className="grid grid-cols-12 gap-4 px-6 py-5 min-h-[80vh]">

        {/* Row 1: 4 Stat Cards (span 7) */}
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div id="overall-score">
            <StatCard title="Overall Score" value={`${percentage}%`} />
          </div>
          <div id="time-spent">
            <StatCard title="Time Spent" value={duration} />
          </div>
          <StatCard title="Result" value={resultStatus.label} status={resultStatus.status} />
          <StatCard title="Attempts Used" value={attemptsUsed} />
        </div>

        {/* AI Coach Panel (span 5, row-span 3) */}
        <div id="ai-coach" className="col-span-12 lg:col-span-5 lg:row-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <AICoachPanel feedback={selectedResult?.ai_feedback} strongTopics={strongTopics} weakTopics={weakTopics} />
        </div>

        {/* Donut Chart (span 3) */}
        <div id="donut-chart" className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <DonutScoreChart correctPercent={percentage} incorrectPercent={100 - percentage} height="100%" />
        </div>

        {/* Weak Topics Bar Chart (span 4) */}
        <div id="weak-topics" className="col-span-12 sm:col-span-6 lg:col-span-4 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <WeakTopicsBarChart topics={weakTopics} height="100%" />
        </div>

        {/* Top Topics Funnel (span 3) */}
        <div id="top-topics" className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <TopTopicsFunnelChart topicBreakdown={selectedResult?.topicBreakdown} topN={5} height={250} title="Top 5 Topics Overview" />
        </div>

        {/* AI Suggestions (span 4) */}
        <div id="suggestions" className="col-span-12 sm:col-span-6 lg:col-span-4 bg-white rounded-xl shadow-md p-4 flex flex-col min-h-0">
          <AISuggestionPanel
            suggestions={suggestions}
            studyTips={selectedResult?.ai_feedback?.study_tips || []}
            topicWiseTips={selectedResult?.ai_feedback?.topic_wise_tips || []}
          />
        </div>
      </div>
    </div>
  );
}
