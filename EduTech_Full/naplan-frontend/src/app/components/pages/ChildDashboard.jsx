// ChildDashboard.jsx — TAB SLIDER (v3)
//
// STRUCTURE:
//   Tab 1: "My Quizzes"         — ORIGINAL quiz board, zero changes
//   Tab 2: "Overall Subject"    — StudentDashboardAnalytics (All subjects, cumulative)
//   Tab 3: "Individual Subject" — StudentDashboardAnalytics (pre-filtered to a subject, cumulative)
//
// Non-writing & Writing dashboards are for SPECIFIC TEST results only.
// They are accessed via "Test Insights" button → navigate() as before.
// They are NOT part of the slider.

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
import { BookOpen, PenLine, Hash, Languages, Library, ClipboardList, BarChart2 } from "lucide-react";

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
  if (["maths", "math", "mathematics"].includes(s) || s.includes("numeracy") || s.includes("number")) return "Numeracy";
  if (s === "conventions" || s.includes("convention") || s.includes("grammar") || s.includes("punctuation") || s.includes("spelling") || s === "language_convention") return "Language";
  if (s === "language") return "Language";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (["Reading", "Writing", "Numeracy", "Language"].includes(subject)) return subject;
  return "Other";
}

const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

/* ─── Subject styles (original) ─── */
const SUBJECT_STYLE = {
  Reading:  { bg: "bg-blue-100",    text: "text-blue-700",    icon: BookOpen  },
  Writing:  { bg: "bg-purple-100",  text: "text-purple-700",  icon: PenLine   },
  Numeracy: { bg: "bg-amber-100",   text: "text-amber-700",   icon: Hash      },
  Language: { bg: "bg-emerald-100", text: "text-emerald-700", icon: Languages },
  Other:    { bg: "bg-slate-100",   text: "text-slate-600",   icon: Library   },
};

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const MOTIVATIONAL_MESSAGES = [
  "Every quiz you do makes you smarter — keep going, you're doing brilliantly!",
  "Your brain loves a challenge! Let's tackle today's quizzes together.",
  "You're building super skills one quiz at a time — keep it up!",
  "Small practice every day = big results. You've totally got this!",
  "Every question you answer makes you a stronger learner. Let's go!",
  "Learning is your superpower — and you're getting better every single day!",
  "You showed up today and that already makes you a winner. Let's crush it!",
];

function getDailyMotivation() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}


const PARENT_MESSAGES = [
  "Here's a full view of quiz results, subject scores and practice streaks — all in one place.",
  "Track completed quizzes, subject averages and consistency to see where to focus next.",
  "Use the Cumulative Analysis tab to dive deeper into subject-by-subject performance trends.",
  "Track your child's NAPLAN progress across all subjects.",
];

function getDailyParentMessage() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  return PARENT_MESSAGES[dayOfYear % PARENT_MESSAGES.length];
}

/* ─── DifficultyBadge (original) ─── */
function DifficultyBadge({ difficulty }) {
  if (!difficulty || difficulty === "Standard") return null;
  const color =
    difficulty === "Easy" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
    difficulty === "Hard" ? "bg-rose-50 text-rose-600 border-rose-200" :
    "bg-amber-50 text-amber-600 border-amber-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      {difficulty}
    </span>
  );
}

/* ══════════════════════════════════════════════
   TAB SLIDER
══════════════════════════════════════════════ */
const TABS = [
  { id: "quizzes",    label: "My Quizzes",         icon: ClipboardList },
  { id: "cumulative", label: "Cumulative Analysis", icon: BarChart2     },
];

function TabSlider({ activeTab, onChange }) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex overflow-x-hidden">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`
                  relative flex items-center gap-2 px-6 py-4 text-sm font-semibold
                  whitespace-nowrap transition-all duration-200 border-b-2 -mb-px
                  ${isActive
                    ? "text-indigo-600 border-indigo-600 bg-indigo-50/40"
                    : "text-slate-500 border-transparent hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-indigo-500" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { childToken, childProfile, parentToken, logoutChild, logout } = useAuth();

  const childId     = searchParams.get("childId") || childProfile?.childId;
  const activeToken = childToken || parentToken;
  const isParentViewing = !childToken && !!parentToken;

  /* ─── Initial tab from URL ─── */
  const getInitialTab = () => {
    const t = searchParams.get("tab");
    if (t === "cumulative") return "cumulative";
    if (t === "overall")    return "cumulative"; // backwards-compat
    if (t === "analytics")  return "cumulative"; // backwards-compat
    return "quizzes";
  };

  /* ─── STATE ─── */
  const [tests,                setTests]                = useState([]);
  const [childStatus,          setChildStatus]          = useState(() => childProfile?.status || "trial");
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState(null);
  const [currentPage,          setCurrentPage]          = useState(1);
  const [subjectFilter,        setSubjectFilter]        = useState("All");
  const [search,               setSearch]               = useState("");
  const [sortConfig,           setSortConfig]           = useState({ key: "subject", direction: "asc" });
  const [childInfo,            setChildInfo]            = useState(null);
  const [activeTab,            setActiveTab]            = useState(getInitialTab);
  const [activeQuiz,           setActiveQuiz]           = useState(null);
  const [selectedQuizResult,   setSelectedQuizResult]   = useState(null);
  const [resultLoading,        setResultLoading]        = useState(false);
  const [viewMode,             setViewMode]             = useState("all");
  const [childEntitledQuizIds, setChildEntitledQuizIds] = useState(null);
  const [availableQuizzes,     setAvailableQuizzes]     = useState([]);
  const [quizzesLoading,       setQuizzesLoading]       = useState(true);

  const testsPerPage = 8;

  const handleLogout = useCallback(() => {
    if (childToken) logoutChild(); else logout();
    navigate("/");
  }, [childToken, logoutChild, logout, navigate]);

  /* ─── Resolve child info (original) ─── */
  const resolveChildInfo = useCallback(async () => {
    const nameFromUrl     = searchParams.get("childName");
    const yearFromUrl     = searchParams.get("yearLevel");
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

  /* ─── Load available quizzes (original) ─── */
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

  /* ─── refreshData (original) ─── */
  const refreshData = useCallback(() => {
    if (!activeToken || !childId) return;
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
          return { id: w._id, response_id: w.response_id, quiz_id: w.quiz_id, subject: "Writing", name: w.quiz_name || "Untitled Quiz", score: max > 0 ? Math.round((total / max) * 100) : 0, date: w.submitted_at || w.createdAt, quiz_name: w.quiz_name, grade: "", duration: w.duration_sec || 0, source: "writing", ai_status: w?.ai?.status || "pending" };
        });
        setTests([...nonWriting, ...writing]);
      })
      .catch(() => {});
  }, [activeToken, childId]);

  /* ─── Initial load (original) ─── */
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

  /* ─── Entitled tests (original) ─── */
  const entitledCatalog = useMemo(() => availableQuizzes, [availableQuizzes]);

  const entitledTests = useMemo(() => {
    if (childStatus === "active") return tests;
    if (quizzesLoading || entitledCatalog.length === 0) return [];
    const names = new Set(entitledCatalog.map((q) => (q.quiz_name || q.name || "").toLowerCase().trim()));
    return tests.filter((t) => {
      const n = (t.name || t.quiz_name || "").toLowerCase().trim();
      return [...names].some((q) => n === q || n.includes(q) || q.includes(n));
    });
  }, [tests, entitledCatalog, quizzesLoading, childStatus]);

  /* ─── Gamification stats (original) ─── */
  const hasTests       = entitledTests.length > 0;
  const overallAverage = useMemo(() => !entitledTests.length ? 0 : Math.round(entitledTests.reduce((s, t) => s + t.score, 0) / entitledTests.length), [entitledTests]);
  const totalXP        = useMemo(() => entitledTests.reduce((s, t) => s + t.score * 10, 0), [entitledTests]);
  const level          = useMemo(() => Math.max(1, Math.floor(totalXP / 500) + 1), [totalXP]);
  const xpProgress     = useMemo(() => ((totalXP % 500) / 500) * 100, [totalXP]);
  const streak         = useMemo(() => {
    if (!entitledTests.length) return 0;
    const sorted = [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.floor((new Date(sorted[i - 1].date) - new Date(sorted[i].date)) / 86400000) <= 1) count++;
      else break;
    }
    return count;
  }, [entitledTests]);

  /* Best subject — highest average among subjects with at least 1 test */
  const topSubject = useMemo(() => {
    const bySubject = SUBJECTS.map((s) => {
      const ts = entitledTests.filter((t) => t.subject === s);
      return { subject: s, avg: ts.length ? Math.round(ts.reduce((a, t) => a + t.score, 0) / ts.length) : -1 };
    }).filter((x) => x.avg >= 0);
    if (!bySubject.length) return null;
    return bySubject.sort((a, b) => b.avg - a.avg)[0];
  }, [entitledTests]);

  /* ─── mergedQuizzes (original — drives the quiz table) ─── */
  const mergedQuizzes = useMemo(() => entitledCatalog.map((quiz) => {
    const matches = tests.filter((t) => {
      if ((quiz.subject === "Writing") !== (t.subject === "Writing")) return false;
      if (quiz.quiz_id && t.quiz_id && quiz.quiz_id === t.quiz_id) return true;
      return (t.name || t.quiz_name || "").toLowerCase().trim() === (quiz.quiz_name || "").toLowerCase().trim();
    });
    const m = matches.length ? matches.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;
    return {
      id: quiz.quiz_id, quiz_id: quiz.quiz_id,
      name: quiz.quiz_name, quiz_name: quiz.quiz_name,
      subject: quiz.subject,
      year_level: quiz.year_level, difficulty: quiz.difficulty || "Standard",
      time_limit_minutes: quiz.time_limit_minutes, question_count: quiz.question_count,
      is_trial: quiz.is_trial, is_entitled: quiz.is_entitled,
      status: m ? "completed" : "not_started",
      score: m?.score ?? null, grade: m?.grade ?? null,
      date_completed: m?.date ?? null, response_id: m?.response_id ?? null, ai_status: m?.ai_status ?? null,
    };
  }), [tests, entitledCatalog]);

  const completedCount = mergedQuizzes.filter((q) => q.status === "completed").length;
  const availableCount = mergedQuizzes.filter((q) => q.status === "not_started").length;

  /* ─── Quiz filtering / sorting / paging (original) ─── */
  const filteredQuizzes = useMemo(() => {
    let list = [...mergedQuizzes];
    if (viewMode === "available") list = list.filter((q) => q.status === "not_started");
    if (viewMode === "completed") list = list.filter((q) => q.status === "completed");
    if (subjectFilter !== "All")  list = list.filter((q) => q.subject === subjectFilter);
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

  const totalPages       = Math.max(1, Math.ceil(sortedQuizzes.length / testsPerPage));
  const paginatedQuizzes = sortedQuizzes.slice((currentPage - 1) * testsPerPage, currentPage * testsPerPage);

  const handleSort = (key) => setSortConfig((prev) => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  useEffect(() => { setCurrentPage(1); }, [subjectFilter, search, viewMode]);

  /* ─── handleViewResult (original) ─── */
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
        result: {
          score: data.score || { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" },
          topic_breakdown: data.topicBreakdown || data.topic_breakdown || {},
          is_writing: (item.subject || "").toLowerCase() === "writing",
          ai_status: data.ai?.status || data.ai_feedback_meta?.status || null,
          attempt_id: data.response_id || rid,
          response_id: rid,
          subject: item.subject || data.subject || "",
        },
        quizName: item.name || data.quiz_name || "Quiz",
      });
    } catch {
      setSelectedQuizResult({
        result: {
          score: { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" },
          topic_breakdown: {}, is_writing: (item.subject || "").toLowerCase() === "writing",
          attempt_id: rid, response_id: rid, subject: item.subject || "",
        },
        quizName: item.name || "Quiz",
      });
    } finally { setResultLoading(false); }
  }, [activeToken]);

  /* ─── handleAiFeedback (original — navigates to specific test dashboard) ─── */
  const handleAiFeedback = useCallback((item) => {
    const rid = item.response_id; if (!rid) return;
    const params = new URLSearchParams({ r: rid });
    const username = childInfo?.username || childProfile?.username || searchParams.get("username") || null;
    if (username) params.set("username", username);
    if (item.subject) params.set("subject", item.subject);
    if (item.quiz_name || item.name) params.set("quiz_name", item.quiz_name || item.name);
    params.set("status", childStatus);
    navigate((item.subject || "").toLowerCase() === "writing"
      ? `/writing-feedback/result?${params}`
      : `/NonWritingLookupQuizResults/results?${params}`
    );
  }, [navigate, childInfo, childProfile, searchParams, childStatus]);

  /* ─── handleQuizClose (original) ─── */
  const handleQuizClose = useCallback((result) => {
    setActiveQuiz(null);
    refreshData();
    if (result?.attempt_id || result?.response_id) {
      setSelectedQuizResult({
        result: {
          score:           result.score || {},
          topic_breakdown: result.topic_breakdown || {},
          is_writing:      result.is_writing || false,
          ai_status:       result.ai_status || "queued",
          attempt_id:      result.attempt_id,
          response_id:     result.attempt_id || result.response_id,
          subject:         result.subject || "",
        },
        quizName: result.quiz_name || "Quiz",
      });
    }
  }, [refreshData]);

  /* ─── Derived display values ─── */
  const displayName  = childInfo?.display_name || childProfile?.displayName || "Student";
  const yearLevel    = childInfo?.year_level   || childProfile?.yearLevel    || null;
  const motivation   = getDailyMotivation();
  const timeGreeting = getTimeGreeting();
  const viewerType   = childToken && !isParentViewing ? "child" : isParentViewing ? "parent_viewing_child" : "parent";

  /* ─── Shared nav ─── */
  const sharedNav = (isOnAnalyticsPage = false, onBackOverride = null) => (
    <ChildAvatarMenu
      displayName={displayName}
      isParentViewing={isParentViewing}
      isOnAnalyticsPage={isOnAnalyticsPage}
      hideBackToChild={!onBackOverride}
      onViewAnalytics={() => setActiveTab("cumulative")}
      onBackToParent={() => navigate("/parent-dashboard")}
      onBackToChildDashboard={onBackOverride ?? (() => setActiveTab("quizzes"))}
    />
  );

  /* ════════════════════════════════
     EARLY RETURNS (original)
  ════════════════════════════════ */

  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-slate-500">Loading dashboard...</p>
      </div>
    </div>
  );

  if (resultLoading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-slate-500">Loading quiz results...</p>
      </div>
    </div>
  );

  if (activeQuiz) return (
    <NativeQuizPlayer
      quiz={activeQuiz}
      onClose={handleQuizClose}
      childId={childId}
      childStatus={childStatus}
      onViewAnalytics={() => setActiveTab("cumulative")}
      onViewAIFeedback={(attemptId, subject, name) => {
        const params = new URLSearchParams({ r: attemptId });
        const username = childInfo?.username || childProfile?.username || searchParams.get("username") || null;
        if (username) params.set("username", username);
        if (subject) params.set("subject", subject);
        if (name) params.set("quiz_name", name);
        params.set("status", childStatus);
        navigate((subject || "").toLowerCase() === "writing"
          ? `/writing-feedback/result?${params}`
          : `/NonWritingLookupQuizResults/results?${params}`
        );
      }}
    />
  );

  if (selectedQuizResult) return (
    <div className="min-h-screen bg-slate-100">
      <DashboardHeader>
        <span className="text-sm text-slate-500 hidden sm:inline">{selectedQuizResult.quizName}</span>
        {sharedNav(true, () => setSelectedQuizResult(null))}
      </DashboardHeader>
      <QuizResult
        result={selectedQuizResult.result}
        quizName={selectedQuizResult.quizName}
        childStatus={childStatus}
        onClose={() => setSelectedQuizResult(null)}
        onRetake={() => {
          const quiz = mergedQuizzes.find(
            (q) => q.quiz_id === selectedQuizResult.result?.quiz_id ||
                   (q.name || "").toLowerCase() === (selectedQuizResult.quizName || "").toLowerCase()
          );
          if (quiz) { setSelectedQuizResult(null); setActiveQuiz(quiz); }
        }}
        onViewAnalytics={() => {
          setSelectedQuizResult(null);
          setActiveTab("cumulative");
        }}
        onViewAIFeedback={(attemptId, subject, name) => {
          setSelectedQuizResult(null);
          const params = new URLSearchParams({ r: attemptId });
          const username = childInfo?.username || childProfile?.username || searchParams.get("username") || null;
          if (username) params.set("username", username);
          if (subject) params.set("subject", subject);
          if (name) params.set("quiz_name", name);
          params.set("status", childStatus);
          navigate((subject || "").toLowerCase() === "writing"
            ? `/writing-feedback/result?${params}`
            : `/NonWritingLookupQuizResults/results?${params}`
          );
        }}
      />
    </div>
  );

  /* ════════════════════════════════
     MAIN DASHBOARD — TAB LAYOUT
  ════════════════════════════════ */
  return (
    // ── CHANGED: bg-gradient-to-b from-indigo-50 to-white → bg-slate-100
    <div className="min-h-screen bg-slate-100">

      {/* Sticky Header */}
      <DashboardHeader>{sharedNav(activeTab !== "quizzes")}</DashboardHeader>

      {/* Greeting + KPI strip — always visible above tabs */}
      <div className="px-4 pt-6 pb-4 md:px-8">
        <div className="max-w-6xl mx-auto space-y-4">

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-slate-900">
                {isParentViewing
                  ? `${displayName}'s Progress`
                  : `Welcome back, ${displayName}!`}
              </h1>
              {yearLevel && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                  {isParentViewing ? `Year ${yearLevel} · Parent View` : `Year ${yearLevel}`}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm font-medium mt-1 max-w-xl">
              {isParentViewing ? getDailyParentMessage() : motivation}
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          {/* KPI Cards — context-aware */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white rounded-xl p-5 border shadow-sm">
            {isParentViewing ? (
              /* ── PARENT VIEW ── */
              <>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Completed</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-indigo-600" : "text-slate-300"}`}>
                    {hasTests ? `${completedCount} / ${mergedQuizzes.length}` : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">quizzes done</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Avg Score</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-slate-800" : "text-slate-300"}`}>
                    {hasTests ? `${overallAverage}%` : "—"}
                  </p>
                  {hasTests && (
                    <>
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden w-full max-w-[120px]">
                        <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${overallAverage}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">across all subjects</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Streak</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-amber-500" : "text-slate-300"}`}>
                    {hasTests ? `${streak} days` : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">consecutive days</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Top Subject</p>
                  <p className={`text-2xl font-bold mt-0.5 ${topSubject ? "text-emerald-600" : "text-slate-300"}`}>
                    {topSubject ? topSubject.subject : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {topSubject ? `${topSubject.avg}% avg` : "no data yet"}
                  </p>
                </div>
              </>
            ) : (
              /* ── CHILD VIEW — clean labels, no emoji icons ── */
              <>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">My Level</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-indigo-600" : "text-slate-300"}`}>
                    {hasTests ? level : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{hasTests ? "keep going to level up!" : "take a quiz to start!"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Stars Earned</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-slate-800" : "text-slate-300"}`}>
                    {hasTests ? totalXP.toLocaleString() : "—"}
                  </p>
                  {hasTests && (
                    <>
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden w-full max-w-[120px]">
                        <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${xpProgress}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{500 - (totalXP % 500)} more to next level!</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Day Streak</p>
                  <p className={`text-2xl font-bold mt-0.5 ${hasTests ? "text-amber-500" : "text-slate-300"}`}>
                    {hasTests ? `${streak} days` : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{hasTests && streak > 0 ? "don't break the chain!" : "start your streak today!"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Best Subject</p>
                  <p className={`text-2xl font-bold mt-0.5 ${topSubject ? "text-emerald-600" : "text-slate-300"}`}>
                    {topSubject ? topSubject.subject : "—"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {topSubject ? `${topSubject.avg}% avg score` : "take more quizzes!"}
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Tab Slider */}
      <TabSlider activeTab={activeTab} onChange={(t) => { setActiveTab(t); setCurrentPage(1); }} />

      {/* Tab Content */}
      <div className="px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto">

          {/* ══════════════════════════════════════════════
              TAB 1 — MY QUIZZES (ORIGINAL, UNCHANGED)
          ══════════════════════════════════════════════ */}
          {activeTab === "quizzes" && (
            <section>
              {!hasTests && !quizzesLoading && entitledCatalog.length === 0 && (
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white mb-6">
                  <p className="text-2xl font-bold mb-2">Welcome, {displayName}!</p>
                  <p className="text-indigo-100 text-sm leading-relaxed max-w-xl mb-6">
                    {isParentViewing
                      ? `${displayName} hasn't completed any quizzes yet. Encourage them to get started — results will appear here once they do!`
                      : "Once you finish your first quiz, you'll earn Stars, level up, build streaks and see how you're improving! Ready to go?"}
                  </p>
                  {!isParentViewing && (
                    <button onClick={() => navigate("/free-trial")}
                      className="px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-lg text-sm hover:bg-indigo-50 transition">
                      Take a Free Sample Test
                    </button>
                  )}
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-semibold">My Quizzes</h2>
                    <p className="text-xs text-slate-500 mt-1">Click any completed row to view results.</p>
                  </div>
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {[
                      { key: "all",       label: "All",       count: mergedQuizzes.length },
                      { key: "available", label: "Available", count: availableCount       },
                      { key: "completed", label: "Completed", count: completedCount       },
                    ].map((tab) => (
                      <button key={tab.key} onClick={() => setViewMode(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                        {tab.label} <span className="text-slate-400">({tab.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <input type="text" placeholder="Search quizzes..." value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none" />
                  <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none">
                    <option value="All">All Subjects</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Table */}
              {quizzesLoading ? (
                <div className="flex justify-center py-16">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="mt-4 text-slate-500">Loading quizzes...</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm table-fixed">
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
                        <th onClick={() => handleSort("subject")} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                          <span className="flex items-center gap-1">Subject {sortConfig.key === "subject" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}</span>
                        </th>
                        <th onClick={() => handleSort("name")} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                          <span className="flex items-center gap-1">Quiz Name {sortConfig.key === "name" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}</span>
                        </th>
                        <th onClick={() => handleSort("status")} className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                          <span className="flex items-center justify-center gap-1">Status {sortConfig.key === "status" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}</span>
                        </th>
                        <th onClick={() => handleSort("score")} className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 select-none">
                          <span className="flex items-center justify-center gap-1">Score {sortConfig.key === "score" && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}</span>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Test Insights</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedQuizzes.length > 0 ? paginatedQuizzes.map((quiz) => {
                        const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
                        const isCompleted = quiz.status === "completed";
                        const canViewResult = isCompleted && Boolean(quiz.response_id);
                        const Icon = style.icon;
                        return (
                          <tr key={quiz.id}
                            onClick={() => canViewResult && handleViewResult(quiz)}
                            className={`transition ${canViewResult ? "cursor-pointer hover:bg-indigo-50/40" : "hover:bg-slate-50/60"}`}
                            title={canViewResult ? "Click row to view result" : undefined}>
                            {/* Subject */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                                  <Icon className={`w-4 h-4 ${style.text}`} />
                                </span>
                                <span className={`font-medium text-sm ${style.text}`}>{quiz.subject}</span>
                              </div>
                            </td>
                            {/* Quiz Name */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-slate-800 leading-snug">{quiz.name}</p>
                                <DifficultyBadge difficulty={quiz.difficulty} />
                              </div>
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              {isCompleted
                                ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />Completed</span>
                                : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />Not Started</span>}
                            </td>
                            {/* Score */}
                            <td className="px-4 py-3 text-center">
                              {isCompleted && quiz.score !== null
                                ? <span><span className={`text-sm font-bold ${quiz.score >= 85 ? "text-emerald-600" : quiz.score >= 70 ? "text-amber-600" : "text-rose-600"}`}>{quiz.score}%</span>{quiz.grade && <span className="text-xs text-slate-400 ml-1">({quiz.grade})</span>}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            {/* Action */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isCompleted
                                ? <button onClick={() => setActiveQuiz(quiz)} className="inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition border border-slate-200 whitespace-nowrap">Retake Quiz</button>
                                : <button onClick={() => setActiveQuiz(quiz)} className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap">Start Quiz</button>}
                            </td>
                            {/* Test Insights — opens specific test dashboard */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isCompleted && quiz.response_id
                                ? <button onClick={() => handleAiFeedback(quiz)}
                                    className={`inline-flex items-center justify-center px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap ${(quiz.subject || "").toLowerCase() === "writing" ? "bg-purple-600 hover:bg-purple-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                                    Test Insights
                                  </button>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            {/* Date */}
                            <td className="px-4 py-3 text-center">
                              {quiz.date_completed
                                ? <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(quiz.date_completed).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={7} className="px-5 py-12 text-center">
                          <p className="text-slate-400 text-sm">
                            {entitledCatalog.length === 0
                              ? (isParentViewing ? `${displayName} hasn't completed any quizzes yet. Results will appear here once they do.` : "No quizzes here yet — pick one and give it a go!")
                              : "No quizzes match your filters."}
                          </p>
                          {entitledCatalog.length > 0 && <button onClick={() => { setSearch(""); setSubjectFilter("All"); setViewMode("all"); }} className="text-indigo-600 text-sm font-medium mt-2 hover:underline">Clear filters</button>}
                        </td></tr>
                      )}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
                      <p className="text-xs text-slate-500">Showing {(currentPage - 1) * testsPerPage + 1}–{Math.min(currentPage * testsPerPage, sortedQuizzes.length)} of {sortedQuizzes.length}</p>
                      <div className="flex gap-1">
                        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Prev</button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                          <button key={pg} onClick={() => setCurrentPage(pg)} className={`px-3 py-1 text-xs rounded border ${pg === currentPage ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 hover:bg-slate-100"}`}>{pg}</button>
                        ))}
                        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB 2 — CUMULATIVE ANALYSIS (all subjects, per-subject drill-down)
          ══════════════════════════════════════════════ */}
          {activeTab === "cumulative" && (
            <TrialGateOverlay
              isTrialUser={childStatus === "trial"}
              preset="analytics"
              viewerType={viewerType}
              onUpgrade={() => navigate(yearLevel ? `/bundles?year=${yearLevel}` : "/bundles")}
              onBack={() => setActiveTab("quizzes")}
              yearLevel={yearLevel}
            >
              <StudentDashboardAnalytics
                tests={entitledTests}
                displayName={displayName}
                yearLevel={yearLevel}
                embedded={true}
                childId={childId}
                onLogout={handleLogout}
              />
            </TrialGateOverlay>
          )}

        </div>
      </div>
    </div>
  );
}