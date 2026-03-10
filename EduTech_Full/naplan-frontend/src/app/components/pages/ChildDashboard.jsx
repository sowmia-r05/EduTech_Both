// ChildDashboard.jsx — FULL REPLACEMENT
//
// Quiz table ACTION column:
//   Completed  → "Retake Quiz" button  (clicking the ROW opens the result)
//   Not started → "Start Quiz" button
//   Row click   → handleViewResult  (view the result page)
//   No separate "View Result" button — row click does it

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchChildResults,
  fetchChildrenSummaries,
  fetchAvailableQuizzes,
  fetchChildWriting,
} from "@/app/utils/api-children";

import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import NativeQuizPlayer from "@/app/components/quiz/NativeQuizPlayer";
import TrialGateOverlay from "@/app/components/common/TrialGateOverlay";
import QuizResult from "@/app/components/quiz/QuizResult";
import DashboardHeader from "@/app/components/layout/DashboardHeader";
import ChildAvatarMenu from "@/app/components/ui/ChildAvatarMenu";
import { BookOpen, PenLine, Hash, Languages, Library } from "lucide-react";

/* ─── Subject helpers ─── */
function inferSubject(quizName) {
  const q = (quizName || "").toLowerCase();
  if (q.includes("numeracy") && q.includes("calculator")) return "Numeracy";
  if (q.includes("numeracy") || q.includes("number and algebra")) return "Numeracy";
  if (q.includes("language") || q.includes("convention") || q.includes("grammar")) return "Language";
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";
  return "Other";
}

function normalizeSubject(subject) {
  if (!subject) return "Other";
  const s = subject.toLowerCase().trim();
  if (["maths","math","mathematics"].includes(s) || s.includes("numeracy") || s.includes("number")) return "Numeracy";
  if (s === "conventions" || s.includes("convention") || s.includes("grammar") || s.includes("punctuation") || s.includes("spelling") || s === "language_convention") return "Language";
  if (s === "language") return "Language";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (["Reading","Writing","Numeracy","Language"].includes(subject)) return subject;
  return "Other";
}

const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const MOTIVATIONAL_MESSAGES = [
  { emoji: "🌟", text: "Every expert was once a beginner. Keep going — you're building something amazing!" },
  { emoji: "🚀", text: "Your brain gets stronger every time you try. Let's make today count!" },
  { emoji: "💪", text: "Mistakes are proof you're trying. Each quiz makes you smarter!" },
  { emoji: "🎯", text: "Small steps every day lead to big results. You've got this!" },
  { emoji: "⭐", text: "Champions aren't made in a day — they're made one quiz at a time!" },
  { emoji: "🧠", text: "The more you practise, the easier it gets. Your future self will thank you!" },
  { emoji: "🏆", text: "You don't have to be perfect, you just have to be better than yesterday!" },
  { emoji: "🔥", text: "Hard work beats talent when talent doesn't work hard. Keep pushing!" },
  { emoji: "🌈", text: "Every quiz you finish is a step closer to your goals. Let's do this!" },
  { emoji: "💡", text: "Curious minds go far. Keep asking questions and exploring!" },
];

function getDailyMotivation() {
  const d = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return MOTIVATIONAL_MESSAGES[d % MOTIVATIONAL_MESSAGES.length];
}

const PARENT_MESSAGES = [
  "Great job staying involved — your support makes all the difference!",
  "Tracking progress is the first step to helping them succeed.",
  "Children thrive when parents are engaged — you're doing great!",
  "Your involvement is their biggest motivation. Keep it up!",
];

function getDailyParentMessage() {
  const d = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return PARENT_MESSAGES[d % PARENT_MESSAGES.length];
}

const SUBJECT_STYLE = {
  Reading:  { icon: BookOpen,  bg: "bg-blue-50",    text: "text-blue-700" },
  Writing:  { icon: PenLine,   bg: "bg-purple-50",  text: "text-purple-700" },
  Numeracy: { icon: Hash,      bg: "bg-amber-50",   text: "text-amber-700" },
  Language: { icon: Languages, bg: "bg-emerald-50", text: "text-emerald-700" },
  Other:    { icon: Library,   bg: "bg-slate-50",   text: "text-slate-700" },
};

function DifficultyBadge({ difficulty }) {
  const s = { Standard: "bg-slate-100 text-slate-600", Medium: "bg-amber-100 text-amber-700", Hard: "bg-rose-100 text-rose-700" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s[difficulty] || s.Standard}`}>{difficulty || "Standard"}</span>;
}

/* ── Nav pill buttons ── */
function NavBtn({ onClick, children, variant = "default" }) {
  const [hov, setHov] = useState(false);
  const styles = {
    default: { background: hov ? "#F3F4F6" : "#F9FAFB", border: "1.5px solid #E5E7EB", color: "#374151", boxShadow: "none" },
    primary: { background: hov ? "linear-gradient(135deg,#4F46E5,#6D28D9)" : "linear-gradient(135deg,#6366F1,#7C3AED)", border: "none", color: "#fff", boxShadow: hov ? "0 4px 14px rgba(99,102,241,0.45)" : "0 2px 8px rgba(99,102,241,0.30)" },
    danger:  { background: hov ? "#FEE2E2" : "#FEF2F2", border: "1.5px solid #FECACA", color: "#DC2626", boxShadow: "none" },
  };
  const s = styles[variant] || styles.default;
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"7px 14px", borderRadius:"22px", fontSize:"13px", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", outline:"none", transition:"all 0.15s ease", transform: hov ? "translateY(-1px)" : "translateY(0)", ...s }}>
      {children}
    </button>
  );
}

const IconChart = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

/* ── Retake icon ── */
const IconRetake = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 .49-3.51" />
  </svg>
);

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { childToken, childProfile, parentToken, logoutChild, logout } = useAuth();

  const childId = searchParams.get("childId") || childProfile?.childId;
  const activeToken = childToken || parentToken;
  const isParentViewing = !childToken && !!parentToken;

  const [tests, setTests] = useState([]);
  const [childStatus, setChildStatus] = useState(() => childProfile?.status || "trial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "subject", direction: "asc" });
  const [childInfo, setChildInfo] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedQuizResult, setSelectedQuizResult] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [viewMode, setViewMode] = useState("all");
  const [childEntitledQuizIds, setChildEntitledQuizIds] = useState(null);
  const [availableQuizzes, setAvailableQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);

  const testsPerPage = 8;

  const handleLogout = useCallback(() => {
    if (childToken) logoutChild(); else logout();
    navigate("/");
  }, [childToken, logoutChild, logout, navigate]);

  const resolveChildInfo = useCallback(async () => {
    const nameFromUrl = searchParams.get("childName");
    const yearFromUrl = searchParams.get("yearLevel");
    const usernameFromUrl = searchParams.get("username");
    if (nameFromUrl) {
      setChildInfo({ display_name: decodeURIComponent(nameFromUrl), year_level: yearFromUrl ? Number(yearFromUrl) : null, username: usernameFromUrl || null });
    } else if (childProfile) {
      setChildInfo({ display_name: childProfile.displayName || childProfile.username || null, year_level: childProfile.yearLevel || null, username: childProfile.username || null });
    }
    if (parentToken && childId) {
      try {
        const children = await fetchChildrenSummaries(parentToken);
        const match = children.find((c) => String(c._id) === String(childId));
        if (match) {
          if (!nameFromUrl) setChildInfo({ display_name: match.display_name || match.username, year_level: match.year_level, username: match.username || null });
          setChildEntitledQuizIds(match.entitled_quiz_ids || []);
          if (match.status) setChildStatus(match.status);
        } else setChildEntitledQuizIds([]);
      } catch { setChildEntitledQuizIds([]); }
    } else if (childProfile) {
      setChildEntitledQuizIds(childProfile.entitled_quiz_ids || []);
    }
  }, [searchParams, childProfile, parentToken, childId]);

  useEffect(() => { resolveChildInfo(); }, [resolveChildInfo]);

  useEffect(() => {
    if (!activeToken || !childId) { setQuizzesLoading(false); return; }
    setQuizzesLoading(true);
    fetchAvailableQuizzes(activeToken, childId)
      .then((data) => {
        const q = Array.isArray(data) ? data : data?.quizzes || [];
        setAvailableQuizzes(q.map((x) => ({ ...x, subject: normalizeSubject(x.subject) })));
        if (data?.child_status) setChildStatus(data.child_status);
      })
      .catch(() => setAvailableQuizzes([]))
      .finally(() => setQuizzesLoading(false));
  }, [activeToken, childId]);

  useEffect(() => {
    if (!activeToken || !childId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([fetchChildResults(activeToken, childId), fetchChildWriting(activeToken, childId)])
      .then(([results, writingDocs]) => {
        const nonWriting = results.map((r) => ({
          id: r._id, response_id: r.response_id, quiz_id: r.quiz_id,
          subject: normalizeSubject(r.subject || inferSubject(r.quiz_name)),
          name: r.quiz_name || "Untitled Quiz", score: Math.round(r.score?.percentage || 0),
          date: r.date_submitted || r.createdAt, quiz_name: r.quiz_name,
          grade: r.score?.grade || "", duration: r.duration || 0, source: r.source || "native",
        }));
        const writing = (writingDocs || []).map((w) => {
          const overall = w?.ai?.feedback?.overall;
          const total = overall?.total_score || 0; const max = overall?.max_score || 0;
          return { id: w._id, response_id: w.response_id, quiz_id: w.quiz_id, subject: "Writing", name: w.quiz_name || "Untitled Quiz", score: max > 0 ? Math.round((total / max) * 100) : 0, date: w.submitted_at || w.createdAt, quiz_name: w.quiz_name, grade: "", duration: w.duration_sec || 0, source: "writing" };
        });
        setTests([...nonWriting, ...writing]); setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeToken, childId]);

  const entitledCatalog = useMemo(() => availableQuizzes, [availableQuizzes]);
  const entitledTests = useMemo(() => {
    if (childStatus === "active") return tests;
    if (quizzesLoading || entitledCatalog.length === 0) return [];
    const names = new Set(entitledCatalog.map((q) => (q.quiz_name || q.name || "").toLowerCase().trim()));
    return tests.filter((t) => { const n = (t.name || t.quiz_name || "").toLowerCase().trim(); return [...names].some((q) => n === q || n.includes(q) || q.includes(n)); });
  }, [tests, entitledCatalog, quizzesLoading, childStatus]);

  const hasTests = entitledTests.length > 0;
  const overallAverage = useMemo(() => !entitledTests.length ? 0 : Math.round(entitledTests.reduce((s, t) => s + t.score, 0) / entitledTests.length), [entitledTests]);
  const totalXP = useMemo(() => entitledTests.reduce((s, t) => s + t.score * 10, 0), [entitledTests]);
  const level = useMemo(() => Math.max(1, Math.floor(totalXP / 500) + 1), [totalXP]);
  const xpProgress = useMemo(() => ((totalXP % 500) / 500) * 100, [totalXP]);
  const streak = useMemo(() => {
    if (!entitledTests.length) return 0;
    const sorted = [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) { if (Math.floor((new Date(sorted[i-1].date) - new Date(sorted[i].date)) / 86400000) <= 1) count++; else break; }
    return count;
  }, [entitledTests]);

  const subjectBreakdown = useMemo(() => SUBJECTS.map((subj) => {
    const st = entitledTests.filter((t) => t.subject === subj);
    const total = entitledCatalog.filter((q) => q.subject === subj).length;
    return { subject: subj, average: st.length ? Math.round(st.reduce((s, t) => s + t.score, 0) / st.length) : 0, count: st.length, total };
  }), [entitledTests, entitledCatalog]);

  const mergedQuizzes = useMemo(() => entitledCatalog.map((quiz) => {
    const matches = tests.filter((t) => {
      if ((quiz.subject === "Writing") !== (t.subject === "Writing")) return false;
      if (quiz.quiz_id && t.quiz_id && quiz.quiz_id === t.quiz_id) return true;
      return (t.name || t.quiz_name || "").toLowerCase().trim() === (quiz.quiz_name || "").toLowerCase().trim();
    });
    const m = matches.length ? matches.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;
    return {
      id: quiz.quiz_id, quiz_id: quiz.quiz_id, name: quiz.quiz_name, subject: quiz.subject,
      year_level: quiz.year_level, difficulty: quiz.difficulty || "Standard",
      time_limit_minutes: quiz.time_limit_minutes, question_count: quiz.question_count,
      is_trial: quiz.is_trial, is_entitled: quiz.is_entitled,
      status: m ? "completed" : "not_started",
      score: m?.score ?? null, grade: m?.grade ?? null,
      date_completed: m?.date ?? null, response_id: m?.response_id ?? null,
    };
  }), [tests, entitledCatalog]);

  const completedCount = mergedQuizzes.filter((q) => q.status === "completed").length;
  const availableCount = mergedQuizzes.filter((q) => q.status === "not_started").length;

  const filteredQuizzes = useMemo(() => {
    let list = [...mergedQuizzes];
    if (viewMode === "available") list = list.filter((q) => q.status === "not_started");
    if (viewMode === "completed") list = list.filter((q) => q.status === "completed");
    if (subjectFilter !== "All") list = list.filter((q) => q.subject === subjectFilter);
    if (search.trim()) { const s = search.toLowerCase(); list = list.filter((q) => q.name.toLowerCase().includes(s) || q.subject.toLowerCase().includes(s)); }
    return list;
  }, [mergedQuizzes, viewMode, subjectFilter, search]);

  const sortedQuizzes = useMemo(() => {
    return [...filteredQuizzes].sort((a, b) => {
      let cmp = 0;
      if (sortConfig.key === "subject") cmp = a.subject.localeCompare(b.subject);
      else if (sortConfig.key === "name") cmp = a.name.localeCompare(b.name);
      else if (sortConfig.key === "score") cmp = (a.score || 0) - (b.score || 0);
      else if (sortConfig.key === "status") cmp = (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0);
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }, [filteredQuizzes, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedQuizzes.length / testsPerPage));
  const paginatedQuizzes = sortedQuizzes.slice((currentPage - 1) * testsPerPage, currentPage * testsPerPage);
  const recentActivity = useMemo(() => [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4), [entitledTests]);

  const handleSort = (key) => setSortConfig((prev) => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  useEffect(() => { setCurrentPage(1); }, [subjectFilter, search, viewMode]);

  const handleViewResult = useCallback(async (item) => {
    const rid = item.response_id; if (!rid) return;
    setResultLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/results/${encodeURIComponent(rid)}`, {
        headers: { Accept: "application/json", "Cache-Control": "no-cache", ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}) },
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelectedQuizResult({
        result: { score: data.score || { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" }, topic_breakdown: data.topicBreakdown || data.topic_breakdown || {}, is_writing: (item.subject || "").toLowerCase() === "writing", ai_status: data.ai?.status || data.ai_feedback_meta?.status || null, attempt_id: data.response_id || rid, response_id: rid, subject: item.subject || data.subject || "" },
        quizName: item.name || data.quiz_name || "Quiz",
      });
    } catch {
      setSelectedQuizResult({
        result: { score: { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" }, topic_breakdown: {}, is_writing: (item.subject || "").toLowerCase() === "writing", attempt_id: rid, response_id: rid, subject: item.subject || "" },
        quizName: item.name || "Quiz",
      });
    } finally { setResultLoading(false); }
  }, [activeToken]);

  const handleAiFeedback = useCallback((item) => {
    const rid = item.response_id; if (!rid) return;
    const params = new URLSearchParams({ r: rid });
    const username = childInfo?.username || childProfile?.username || searchParams.get("username") || null;
    if (username) params.set("username", username);
    if (item.subject) params.set("subject", item.subject);
    if (item.quiz_name || item.name) params.set("quiz_name", item.quiz_name || item.name);
    params.set("status", childStatus);
    navigate((item.subject || "").toLowerCase() === "writing" ? `/writing-feedback/result?${params}` : `/NonWritingLookupQuizResults/results?${params}`);
  }, [navigate, childInfo, childProfile, searchParams, childStatus]);

  const refreshData = useCallback(() => {
    if (!activeToken || !childId) return;
    fetchChildResults(activeToken, childId)
      .then((r) => setTests(r.map((x) => ({ id: x._id, response_id: x.response_id, quiz_id: x.quiz_id, subject: normalizeSubject(x.subject || inferSubject(x.quiz_name)), name: x.quiz_name || "Untitled Quiz", score: Math.round(x.score?.percentage || 0), date: x.date_submitted || x.createdAt, quiz_name: x.quiz_name, grade: x.score?.grade || "", duration: x.duration || 0, source: x.source || "flexiquiz" }))))
      .catch(() => {});
    fetchAvailableQuizzes(activeToken, childId)
      .then((data) => { const q = Array.isArray(data) ? data : data?.quizzes || []; setAvailableQuizzes(q.map((x) => ({ ...x, subject: normalizeSubject(x.subject) }))); if (data?.child_status) setChildStatus(data.child_status); })
      .catch(() => {});
  }, [activeToken, childId]);

  const handleQuizClose = () => { setActiveQuiz(null); refreshData(); };

  const displayName = childInfo?.display_name || childProfile?.displayName || "Student";
  const yearLevel = childInfo?.year_level || childProfile?.yearLevel || null;
  const motivation = getDailyMotivation();
  const timeGreeting = getTimeGreeting();

  /* ── Shared nav ── */
  const sharedNav = (onAnalyticsClick = () => setShowAnalytics(true), isOnAnalyticsPage = false) => (
    <>
      <ChildAvatarMenu
        displayName={displayName}
        isParentViewing={isParentViewing}
        isOnAnalyticsPage={isOnAnalyticsPage}
        onViewAnalytics={onAnalyticsClick}
        onBackToParent={() => navigate("/parent-dashboard")}
        onBackToChildDashboard={() => navigate("/child-dashboard")}
      />
    </>
  );

  /* ─── Early returns ─── */
  if (activeQuiz) return <NativeQuizPlayer quiz={activeQuiz} onClose={handleQuizClose} childId={childId} />;

  if (resultLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
      <div className="text-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" /><p className="mt-4 text-slate-500">Loading quiz results...</p></div>
    </div>
  );

  if (selectedQuizResult) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50">
        <DashboardHeader>
          <span className="text-sm text-slate-500 hidden sm:inline">{selectedQuizResult.quizName}</span>
          {sharedNav(() => { setSelectedQuizResult(null); setTimeout(() => setShowAnalytics(true), 50); }, true)}
        </DashboardHeader>
        <QuizResult result={selectedQuizResult.result} quizName={selectedQuizResult.quizName} onClose={() => setSelectedQuizResult(null)} />
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
      <div className="text-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" /><p className="mt-4 text-slate-500">Loading dashboard...</p></div>
    </div>
  );

  if (showAnalytics) {
    const viewerType = childToken && !isParentViewing ? "child" : isParentViewing ? "parent_viewing_child" : "parent";
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
        <DashboardHeader>
          <span className="text-sm font-medium text-slate-500 hidden md:inline">{displayName}'s Learning Progress</span>
          <ChildAvatarMenu
            displayName={displayName}
            isParentViewing={isParentViewing}
            isOnAnalyticsPage={true}
            onViewAnalytics={() => {}}
            onBackToParent={() => navigate("/parent-dashboard")}
            onBackToChildDashboard={() => setShowAnalytics(false)}
          />
        </DashboardHeader>
        <TrialGateOverlay isTrialUser={childStatus === "trial"} preset="analytics" viewerType={viewerType} onUpgrade={() => navigate(yearLevel ? `/bundles?year=${yearLevel}` : "/bundles")} onBack={() => setShowAnalytics(false)} yearLevel={yearLevel}>
          <StudentDashboardAnalytics tests={entitledTests} displayName={displayName} yearLevel={yearLevel} embedded={true} onLogout={handleLogout} />
        </TrialGateOverlay>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     MAIN DASHBOARD
  ═══════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <DashboardHeader>{sharedNav()}</DashboardHeader>

      <div className="px-4 py-8 md:px-8">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Greeting */}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-indigo-600">
              {isParentViewing ? `Hi ${displayName}!` : `${timeGreeting}, ${displayName}! ${motivation.emoji}`}
            </h1>
            {yearLevel && <p className="text-sm text-indigo-400 font-medium">Year {yearLevel} Explorer</p>}
            <p className="text-slate-500 text-sm mt-2 max-w-lg leading-relaxed">
              {isParentViewing ? getDailyParentMessage() : motivation.text}
            </p>
          </div>

          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          {/* KPI Cards */}
          <section className="grid md:grid-cols-4 gap-6 bg-white rounded-2xl p-6 border shadow">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Level</p>
              <p className={`text-3xl font-bold ${hasTests ? "text-indigo-600" : "text-slate-300"}`}>{hasTests ? level : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total XP</p>
              <p className={`text-3xl font-bold ${hasTests ? "text-slate-900" : "text-slate-300"}`}>{hasTests ? totalXP.toLocaleString() : "—"}</p>
              {hasTests && (<><div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${xpProgress}%` }} /></div><p className="text-xs text-slate-500 mt-1">XP Progress</p></>)}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Streak</p>
              <p className={`text-3xl font-bold ${hasTests ? "text-amber-500" : "text-slate-300"}`}>{hasTests ? `${streak} days` : "—"}</p>
            </div>
            <AnimatedProgressRing percent={overallAverage} />
          </section>

          {/* ══════════════════════════════════════════════
              MY QUIZZES
             ══════════════════════════════════════════════ */}
          <section>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-semibold">My Quizzes</h2>
                  <p className="text-xs text-slate-500 mt-1">Click any completed row to view results.</p>
                </div>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  {[{ key:"all", label:"All", count:entitledCatalog.length }, { key:"available", label:"Available", count:availableCount }, { key:"completed", label:"Completed", count:completedCount }].map((tab) => (
                    <button key={tab.key} onClick={() => setViewMode(tab.key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                      {tab.label} <span className="text-slate-400">({tab.count})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <input type="text" placeholder="Search quizzes..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none" />
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none">
                  <option value="All">All Subjects</option>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm table-fixed">
                {/*
                  Column widths — must add up to 100%:
                  Subject 15 | Quiz Name 26 | Status 14 | Score 10 | Action 13 | Test Insights 14 | Date 8
                */}
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "8%"  }} />
                </colgroup>

                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {/* Subject — left */}
                    <th onClick={() => handleSort("subject")}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                      <span className="flex items-center gap-1">
                        Subject {sortConfig.key === "subject" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                    {/* Quiz Name — left */}
                    <th onClick={() => handleSort("name")}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                      <span className="flex items-center gap-1">
                        Quiz Name {sortConfig.key === "name" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                    {/* Status — center */}
                    <th onClick={() => handleSort("status")}
                      className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                      <span className="flex items-center justify-center gap-1">
                        Status {sortConfig.key === "status" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                    {/* Score — center */}
                    <th onClick={() => handleSort("score")}
                      className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                      <span className="flex items-center justify-center gap-1">
                        Score {sortConfig.key === "score" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                    {/* Action — center */}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Action
                    </th>
                    {/* Test Insights — center */}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Test Insights
                    </th>
                    {/* Date — center */}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {paginatedQuizzes.length > 0 ? paginatedQuizzes.map((quiz) => {
                    const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
                    const isCompleted = quiz.status === "completed";
                    const canViewResult = isCompleted && Boolean(quiz.response_id);
                    const Icon = style.icon;

                    return (
                      <tr
                        key={quiz.id}
                        onClick={() => canViewResult && handleViewResult(quiz)}
                        className={`transition ${canViewResult ? "cursor-pointer hover:bg-indigo-50/40" : "hover:bg-slate-50/60"}`}
                        title={canViewResult ? "Click row to view result" : undefined}
                      >
                        {/* Subject — left */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                              <Icon className={`w-4 h-4 ${style.text}`} />
                            </span>
                            <span className={`font-medium text-sm ${style.text}`}>{quiz.subject}</span>
                          </div>
                        </td>

                        {/* Quiz Name — left */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-800 leading-snug">{quiz.name}</p>
                            <DifficultyBadge difficulty={quiz.difficulty} />
                          </div>
                        </td>

                        {/* Status — center */}
                        <td className="px-4 py-3 text-center">
                          {isCompleted
                            ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />Completed
                              </span>
                            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />Not Started
                              </span>}
                        </td>

                        {/* Score — center */}
                        <td className="px-4 py-3 text-center">
                          {isCompleted && quiz.score !== null
                            ? <span>
                                <span className={`text-sm font-bold ${quiz.score >= 85 ? "text-emerald-600" : quiz.score >= 70 ? "text-amber-600" : "text-rose-600"}`}>{quiz.score}%</span>
                                {quiz.grade && <span className="text-xs text-slate-400 ml-1">({quiz.grade})</span>}
                              </span>
                            : <span className="text-slate-300">—</span>}
                        </td>

                        {/* Action — center */}
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {isCompleted ? (
                            <button
                              onClick={() => setActiveQuiz(quiz)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition border border-slate-200 whitespace-nowrap"
                            >
                              <IconRetake />
                              Retake Quiz
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveQuiz(quiz)}
                              className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
                            >
                              Start Quiz
                            </button>
                          )}
                        </td>

                        {/* Test Insights — center */}
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {isCompleted && quiz.response_id
                            ? <button
                                onClick={() => handleAiFeedback(quiz)}
                                className={`inline-flex items-center justify-center px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap ${(quiz.subject||"").toLowerCase()==="writing" ? "bg-purple-600 hover:bg-purple-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                              >
                                Test Insights
                              </button>
                            : <span className="text-slate-300">—</span>}
                        </td>

                        {/* Date — center */}
                        <td className="px-4 py-3 text-center">
                          {quiz.date_completed
                            ? <span className="text-xs text-slate-400 whitespace-nowrap">
                                {new Date(quiz.date_completed).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}
                              </span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={7} className="px-5 py-12 text-center">
                      <p className="text-slate-400 text-sm">
                        {entitledCatalog.length === 0
                          ? (isParentViewing ? `Quiz results will appear here once ${displayName} completes a quiz.` : "Your quiz results will show up here after you take a quiz!")
                          : "No quizzes match your filters."}
                      </p>
                      {entitledCatalog.length > 0 && <button onClick={() => { setSearch(""); setSubjectFilter("All"); setViewMode("all"); }} className="text-indigo-600 text-sm font-medium mt-2 hover:underline">Clear filters</button>}
                    </td></tr>
                  )}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
                  <p className="text-xs text-slate-500">Showing {(currentPage-1)*testsPerPage+1}–{Math.min(currentPage*testsPerPage,sortedQuizzes.length)} of {sortedQuizzes.length}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage((p) => Math.max(1,p-1))} disabled={currentPage===1} className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Prev</button>
                    {Array.from({length:totalPages},(_,i)=>i+1).map((pg) => <button key={pg} onClick={() => setCurrentPage(pg)} className={`px-3 py-1 text-xs rounded border ${pg===currentPage ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 hover:bg-slate-100"}`}>{pg}</button>)}
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages,p+1))} disabled={currentPage===totalPages} className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Recent Activity */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            {hasTests ? (
              <div className="grid md:grid-cols-4 gap-4">
                {recentActivity.map((t) => (
                  <div key={t.id} onClick={() => handleViewResult(t)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer">
                    <div className="flex items-center gap-2 mb-2"><SubjectIcon subject={t.subject} /><span className="text-xs text-slate-500">{t.subject}</span></div>
                    <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-lg font-bold text-indigo-600">{t.score}%</span>
                      <span className="text-xs text-slate-400">{new Date(t.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-4 gap-4">
                {SUBJECTS.map((subj, i) => (
                  <div key={subj} className="bg-white border border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center text-center py-8">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3"><span className="text-slate-400 text-lg">{["📖","✍️","🔢","📝"][i]}</span></div>
                    <p className="text-xs text-slate-400 font-medium">{subj}</p>
                    <p className="text-xs text-slate-300 mt-1">No results yet</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Subject Breakdown */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Subject Breakdown</h2>
            <div className="grid md:grid-cols-4 gap-4">
              {subjectBreakdown.map((s) => {
                const bar = s.average >= 85 ? "bg-emerald-500" : s.average >= 70 ? "bg-amber-500" : s.average > 0 ? "bg-rose-500" : "bg-slate-200";
                return (
                  <div key={s.subject} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3"><SubjectIcon subject={s.subject} /><span className="text-sm font-medium text-slate-700">{s.subject}</span></div>
                    <p className={`text-2xl font-bold ${s.count > 0 ? "text-slate-900" : "text-slate-300"}`}>{s.count > 0 ? `${s.average}%` : "—"}</p>
                    <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${bar} transition-all duration-700`} style={{width:`${s.average}%`}} /></div>
                    <p className="text-xs text-slate-400 mt-2">{s.count} of {s.total} quiz{s.total !== 1 ? "zes" : ""} completed</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Getting Started */}
          {!hasTests && !error && (
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">{isParentViewing ? `How to Get ${displayName} Started` : "What's Next?"}</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {isParentViewing ? (
                  <><StepCard step={1} icon="🎯" title="Try a Free Sample" description={`Let ${displayName} attempt a free sample test to experience the platform.`} /><StepCard step={2} icon="🛒" title="Purchase a Quiz Bundle" description={`Choose a bundle for ${displayName}'s year level. Payment unlocks all quizzes instantly.`} /><StepCard step={3} icon="📊" title="Track Progress Here" description={`Once ${displayName} completes quizzes, scores and AI feedback will appear here.`} /></>
                ) : (
                  <><StepCard step={1} icon="🎮" title="Take a Quiz" description="Start with a free sample test or any quiz. Each quiz earns you XP!" /><StepCard step={2} icon="⚡" title="Earn XP & Level Up" description="Every quiz earns XP points. Keep a daily streak going to level up faster!" /><StepCard step={3} icon="🏆" title="See Your Progress" description="Your scores, streaks, and subject performance will all be tracked here." /></>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function SubjectIcon({ subject, size = "md" }) {
  const style = SUBJECT_STYLE[subject] || SUBJECT_STYLE.Other;
  const Icon = style.icon;
  return (
    <div className={`${size === "sm" ? "w-6 h-6" : "w-8 h-8"} rounded-full ${style.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`${size === "sm" ? "w-3 h-3" : "w-4 h-4"} ${style.text}`} />
    </div>
  );
}

function StepCard({ step, icon, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">{step}</div>
      <div><h3 className="font-medium text-slate-800 mb-1"><span className="mr-1.5">{icon}</span>{title}</h3><p className="text-sm text-slate-500 leading-relaxed">{description}</p></div>
    </div>
  );
}

function AnimatedProgressRing({ percent }) {
  const r = 36, c = 2 * Math.PI * r, hasData = percent > 0;
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={hasData ? "#6366f1" : "#e2e8f0"} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={hasData ? c-(percent/100)*c : c} transform="rotate(-90 45 45)" style={{transition:"stroke-dashoffset 1s ease"}} />
        <text x="45" y="45" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="bold" fill={hasData ? "#6366f1" : "#cbd5e1"}>{hasData ? `${percent}%` : "—"}</text>
      </svg>
      <p className="text-xs text-slate-500 mt-1">Average</p>
    </div>
  );
}
