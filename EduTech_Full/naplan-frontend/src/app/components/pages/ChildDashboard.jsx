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

/* ─── Subject inference from quiz name ─── */
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
  if (s === "maths" || s === "math" || s === "mathematics" || s.includes("numeracy") || s.includes("number"))
    return "Numeracy";
  if (s === "conventions" || s.includes("convention") || s.includes("grammar") || s.includes("punctuation") || s.includes("spelling") || s === "language_convention")
    return "Language";
  if (s === "language") return "Language";
  if (s.includes("reading")) return "Reading";
  if (s.includes("writing")) return "Writing";
  if (["Reading", "Writing", "Numeracy", "Language"].includes(subject)) return subject;
  return "Other";
}

/* ─── NAPLAN Subjects ─── */
const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

/* ─── Time-of-day greeting ─── */
function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ─── Motivational messages — rotates daily ─── */
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
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}

/* ─── Parent-specific encouraging messages ─── */
const PARENT_MESSAGES = [
  "Great job staying involved — your support makes all the difference!",
  "Tracking progress is the first step to helping them succeed.",
  "Children thrive when parents are engaged — you're doing great!",
  "Your involvement is their biggest motivation. Keep it up!",
];

function getDailyParentMessage() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  return PARENT_MESSAGES[dayOfYear % PARENT_MESSAGES.length];
}

/* ─── Subject styling ─── */
const SUBJECT_STYLE = {
  Reading:  { icon: "📖", bg: "bg-blue-50",    text: "text-blue-700",    badge: "bg-blue-100 text-blue-700" },
  Writing:  { icon: "✍️", bg: "bg-purple-50",  text: "text-purple-700",  badge: "bg-purple-100 text-purple-700" },
  Numeracy: { icon: "🔢", bg: "bg-amber-50",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-700" },
  Language: { icon: "📝", bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  Other:    { icon: "📚", bg: "bg-slate-50",   text: "text-slate-700",   badge: "bg-slate-100 text-slate-700" },
};

/* ─── Difficulty Badge ─── */
function DifficultyBadge({ difficulty }) {
  const styles = {
    Standard: "bg-slate-100 text-slate-600",
    Medium:   "bg-amber-100 text-amber-700",
    Hard:     "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[difficulty] || styles.Standard}`}>
      {difficulty || "Standard"}
    </span>
  );
}

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

  /* ─── STATE ─── */
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

  /* ─── Resolve child info + entitled quiz IDs ─── */
  const resolveChildInfo = useCallback(async () => {
    const nameFromUrl = searchParams.get("childName");
    const yearFromUrl = searchParams.get("yearLevel");
    const usernameFromUrl = searchParams.get("username");

    if (nameFromUrl) {
      setChildInfo({
        display_name: decodeURIComponent(nameFromUrl),
        year_level: yearFromUrl ? Number(yearFromUrl) : null,
        username: usernameFromUrl || null,
      });
    } else if (childProfile) {
      setChildInfo({
        display_name: childProfile.displayName || childProfile.username || null,
        year_level: childProfile.yearLevel || null,
        username: childProfile.username || null,
      });
    }

    if (parentToken && childId) {
      try {
        const children = await fetchChildrenSummaries(parentToken);
        const match = children.find((c) => String(c._id) === String(childId));
        if (match) {
          if (!nameFromUrl) {
            setChildInfo({
              display_name: match.display_name || match.username,
              year_level: match.year_level,
              username: match.username || null,
            });
          }
          setChildEntitledQuizIds(match.entitled_quiz_ids || []);
          if (match.status) setChildStatus(match.status);
        } else {
          setChildEntitledQuizIds([]);
        }
      } catch (err) {
        console.error("Failed to fetch child summaries:", err);
        setChildEntitledQuizIds([]);
      }
    } else if (childProfile) {
      setChildEntitledQuizIds(childProfile.entitled_quiz_ids || []);
    }
  }, [searchParams, childProfile, parentToken, childId]);

  useEffect(() => { resolveChildInfo(); }, [resolveChildInfo]);

  /* ─── FETCH AVAILABLE QUIZZES FROM BACKEND ─── */
  useEffect(() => {
    if (!activeToken || !childId) { setQuizzesLoading(false); return; }
    setQuizzesLoading(true);
    fetchAvailableQuizzes(activeToken, childId)
      .then((data) => {
        const quizList = Array.isArray(data) ? data : data?.quizzes || [];
        setAvailableQuizzes(quizList.map((q) => ({ ...q, subject: normalizeSubject(q.subject) })));
        if (data?.child_status) setChildStatus(data.child_status);
      })
      .catch((err) => { console.error("Failed to fetch available quizzes:", err); setAvailableQuizzes([]); })
      .finally(() => setQuizzesLoading(false));
  }, [activeToken, childId]);

  /* ─── FETCH CHILD RESULTS ─── */
useEffect(() => {
  if (!activeToken || !childId) { setLoading(false); return; }
  setLoading(true);

  Promise.all([
    fetchChildResults(activeToken, childId),
    fetchChildWriting(activeToken, childId),   // ✅ also fetch writing
  ])
    .then(([results, writingDocs]) => {

      // Map non-writing results
      const nonWriting = results.map((r) => ({
        id: r._id,
        response_id: r.response_id,
        quiz_id: r.quiz_id,
        subject: normalizeSubject(r.subject || inferSubject(r.quiz_name)),
        name: r.quiz_name || "Untitled Quiz",
        score: Math.round(r.score?.percentage || 0),
        date: r.date_submitted || r.createdAt,
        quiz_name: r.quiz_name,
        grade: r.score?.grade || "",
        duration: r.duration || 0,
        source: r.source || "flexiquiz",
      }));

      // ✅ Map writing docs — response_id is the key that links to Writing collection
      const writing = (writingDocs || []).map((w) => ({
        id: w._id,
        response_id: w.response_id,          // ← this is what was missing
        quiz_id: w.quiz_id,
        subject: "Writing",
        name: w.quiz_name || "Untitled Quiz",
        score: (() => {
          const overall = w?.ai?.feedback?.overall;
          if (!overall) return 0;
          const total = overall.total_score || 0;
          const max = overall.max_score || 0;
          return max > 0 ? Math.round((total / max) * 100) : 0;
        })(),
        date: w.submitted_at || w.createdAt,
        quiz_name: w.quiz_name,
        grade: "",
        duration: w.duration_sec || 0,
        source: "writing",
      }));

      setTests([...nonWriting, ...writing]);
      setError(null);
    })
    .catch((err) => { console.error("Failed to load child results:", err); setError(err.message); })
    .finally(() => setLoading(false));
}, [activeToken, childId]);

  /* ─── Quiz catalog ─── */
  const entitledCatalog = useMemo(() => availableQuizzes, [availableQuizzes]);

  /* ─── Filter tests for trial KPI correctness ─── */
  const entitledTests = useMemo(() => {
    if (childStatus === "active") return tests;
    if (quizzesLoading) return [];
    if (entitledCatalog.length === 0) return [];
    const entitledNames = new Set(entitledCatalog.map((q) => (q.quiz_name || q.name || "").toLowerCase().trim()));
    return tests.filter((t) => {
      const testName = (t.name || t.quiz_name || "").toLowerCase().trim();
      return [...entitledNames].some((qName) => testName === qName || testName.includes(qName) || qName.includes(testName));
    });
  }, [tests, entitledCatalog, quizzesLoading, childStatus]);

  const hasTests = entitledTests.length > 0;

  /* ─── Calculations ─── */
  const overallAverage = useMemo(() => {
    if (!entitledTests.length) return 0;
    return Math.round(entitledTests.reduce((s, t) => s + t.score, 0) / entitledTests.length);
  }, [entitledTests]);

  const totalXP = useMemo(() => entitledTests.reduce((s, t) => s + t.score * 10, 0), [entitledTests]);
  const level = useMemo(() => Math.max(1, Math.floor(totalXP / 500) + 1), [totalXP]);
  const xpProgress = useMemo(() => ((totalXP % 500) / 500) * 100, [totalXP]);

  const streak = useMemo(() => {
    if (!entitledTests.length) return 0;
    const sorted = [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diffDays = Math.floor((new Date(sorted[i - 1].date) - new Date(sorted[i].date)) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) count++;
      else break;
    }
    return count;
  }, [entitledTests]);

  const subjectBreakdown = useMemo(() => {
    return SUBJECTS.map((subj) => {
      const subjectTests = entitledTests.filter((t) => t.subject === subj);
      const subjectQuizTotal = entitledCatalog.filter((q) => q.subject === subj).length;
      const avg = subjectTests.length ? Math.round(subjectTests.reduce((s, t) => s + t.score, 0) / subjectTests.length) : 0;
      return { subject: subj, average: avg, count: subjectTests.length, total: subjectQuizTotal };
    });
  }, [entitledTests, entitledCatalog]);

  /* ─── Merge quizzes with completed results ─── */
  /* ─── Merge quizzes with completed results ─── */
const mergedQuizzes = useMemo(() => {
  return entitledCatalog.map((quiz) => {
    // Find ALL matches, filtering by subject first to prevent cross-subject collisions
    const matches = tests.filter((t) => {
      // Subject guard — Writing must only match Writing, and vice versa
      const quizIsWriting = quiz.subject === "Writing";
      const testIsWriting = t.subject === "Writing";
      if (quizIsWriting !== testIsWriting) return false;

      // Primary: match by quiz_id (most reliable)
      if (quiz.quiz_id && t.quiz_id && quiz.quiz_id === t.quiz_id) return true;

      // Fallback: match by name
      const tName = (t.name || t.quiz_name || "").toLowerCase().trim();
      const qName = (quiz.quiz_name || "").toLowerCase().trim();
      return tName === qName;
    });

    // Pick the MOST RECENT match so retakes always show the latest response_id
    const matched = matches.length
      ? matches.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      : null;

    return {
      id: quiz.quiz_id,
      quiz_id: quiz.quiz_id,
      name: quiz.quiz_name,
      subject: quiz.subject,
      year_level: quiz.year_level,
      difficulty: quiz.difficulty || "Standard",
      time_limit_minutes: quiz.time_limit_minutes,
      question_count: quiz.question_count,
      is_trial: quiz.is_trial,
      is_entitled: quiz.is_entitled,
      status: matched ? "completed" : "not_started",
      score: matched ? matched.score : null,
      grade: matched ? matched.grade : null,
      date_completed: matched ? matched.date : null,
      response_id: matched ? matched.response_id : null,
    };
  });
}, [tests, entitledCatalog]);

  const completedCount = mergedQuizzes.filter((q) => q.status === "completed").length;
  const availableCount = mergedQuizzes.filter((q) => q.status === "not_started").length;

  /* ─── Filter + sort ─── */
  const filteredQuizzes = useMemo(() => {
    let list = [...mergedQuizzes];
    if (viewMode === "available") list = list.filter((q) => q.status === "not_started");
    if (viewMode === "completed") list = list.filter((q) => q.status === "completed");
    if (subjectFilter !== "All") list = list.filter((q) => q.subject === subjectFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((q) => q.name.toLowerCase().includes(s) || q.subject.toLowerCase().includes(s));
    }
    return list;
  }, [mergedQuizzes, viewMode, subjectFilter, search]);

  const sortedQuizzes = useMemo(() => {
    const sorted = [...filteredQuizzes];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortConfig.key === "subject") cmp = a.subject.localeCompare(b.subject);
      else if (sortConfig.key === "name") cmp = a.name.localeCompare(b.name);
      else if (sortConfig.key === "score") cmp = (a.score || 0) - (b.score || 0);
      else if (sortConfig.key === "status") cmp = (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0);
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredQuizzes, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedQuizzes.length / testsPerPage));
  const paginatedQuizzes = sortedQuizzes.slice((currentPage - 1) * testsPerPage, currentPage * testsPerPage);

  const recentActivity = useMemo(
    () => [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4),
    [entitledTests]
  );

  const handleSort = (key) => {
    setSortConfig((prev) => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  };

  useEffect(() => { setCurrentPage(1); }, [subjectFilter, search, viewMode]);

  const handleViewResult = useCallback(async (item) => {
    const rid = item.response_id;
    if (!rid) return;
    setResultLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${API_BASE}/api/results/${encodeURIComponent(rid)}`, {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch result");
      const data = await res.json();
      if (!data) throw new Error("Result not found");
      setSelectedQuizResult({
        result: {
          score: data.score || { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" },
          topic_breakdown: data.topicBreakdown || data.topic_breakdown || {},
          is_writing: (item.subject || "").toLowerCase() === "writing",
          ai_status: data.ai?.status || data.ai_feedback_meta?.status || null,
          attempt_id: data.response_id || data.responseId || data.attempt_id || rid,
          response_id: rid,
          subject: item.subject || data.subject || "",
        },
        quizName: item.name || item.quiz_name || data.quiz_name || "Quiz",
      });
    } catch (err) {
      console.error("Failed to fetch quiz result:", err);
      setSelectedQuizResult({
        result: {
          score: { percentage: item.score || 0, points: 0, available: 0, grade: item.grade || "" },
          topic_breakdown: {},
          is_writing: (item.subject || "").toLowerCase() === "writing",
          attempt_id: rid,
          response_id: rid,
          subject: item.subject || "",
        },
        quizName: item.name || item.quiz_name || "Quiz",
      });
    } finally {
      setResultLoading(false);
    }
  }, [activeToken]);

  const handleAiFeedback = useCallback((item) => {
  const rid = item.response_id;
  if (!rid) return;

  const isWriting = (item.subject || "").toLowerCase() === "writing";
  const params = new URLSearchParams({ r: rid });

  const username =
    childInfo?.username ||
    childProfile?.username ||
    searchParams.get("username") ||
    null;
  if (username) params.set("username", username);
  if (item.subject) params.set("subject", item.subject);
  if (item.quiz_name || item.name) params.set("quiz_name", item.quiz_name || item.name);

  // ✅ FIX: Pass the live childStatus so result pages don't default to "trial"
  params.set("status", childStatus);

  if (isWriting) {
    navigate(`/writing-feedback/result?${params.toString()}`);
  } else {
    navigate(`/NonWritingLookupQuizResults/results?${params.toString()}`);
  }
}, [navigate, childInfo, childProfile, searchParams, childStatus]); // ← add childStatus to deps
  const handleQuizClose = () => {
    setActiveQuiz(null);
    if (activeToken && childId) {
      fetchChildResults(activeToken, childId)
        .then((results) => {
          setTests(results.map((r) => ({
            id: r._id,
            response_id: r.response_id,
            quiz_id: r.quiz_id,
            subject: normalizeSubject(r.subject || inferSubject(r.quiz_name)),
            name: r.quiz_name || "Untitled Quiz",
            score: Math.round(r.score?.percentage || 0),
            date: r.date_submitted || r.createdAt,
            quiz_name: r.quiz_name,
            grade: r.score?.grade || "",
            duration: r.duration || 0,
            source: r.source || "flexiquiz",
          })));
        })
        .catch(() => {});
      fetchAvailableQuizzes(activeToken, childId)
        .then((data) => {
          const quizList = Array.isArray(data) ? data : data?.quizzes || [];
          setAvailableQuizzes(quizList.map((q) => ({ ...q, subject: normalizeSubject(q.subject) })));
          if (data?.child_status) setChildStatus(data.child_status);
        })
        .catch(() => {});
    }
  };

  const displayName = childInfo?.display_name || childProfile?.displayName || "Student";
  const yearLevel = childInfo?.year_level || childProfile?.yearLevel || null;
  const motivation = getDailyMotivation();
  const timeGreeting = getTimeGreeting();

  /* ─── Early returns ─── */
  if (activeQuiz) return <NativeQuizPlayer quiz={activeQuiz} onClose={handleQuizClose} childId={childId} />;

  if (resultLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading quiz results...</p>
        </div>
      </div>
    );
  }

  if (selectedQuizResult) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50">
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setSelectedQuizResult(null)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl
                         text-slate-700 bg-white border border-slate-200 shadow-sm
                         hover:bg-slate-50 hover:border-slate-300 transition-all"
              aria-label="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-slate-500 hidden sm:inline">{selectedQuizResult.quizName}</span>
          </div>
        </div>
        <QuizResult
          result={selectedQuizResult.result}
          quizName={selectedQuizResult.quizName}
          onClose={() => setSelectedQuizResult(null)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (showAnalytics) {
    const viewerType = childToken && !isParentViewing ? "child" : isParentViewing ? "parent_viewing_child" : "parent";
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setShowAnalytics(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                         text-slate-700 bg-white border border-slate-200 shadow-sm
                         hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <span className="text-sm text-slate-500 hidden sm:inline">{displayName}'s Analytics</span>
          </div>
        </div>
        <TrialGateOverlay
          isTrialUser={childStatus === "trial"}
          preset="analytics"
          viewerType={viewerType}
          onUpgrade={() => navigate(yearLevel ? `/bundles?year=${yearLevel}` : "/bundles")}
          onBack={() => setShowAnalytics(false)}
          yearLevel={yearLevel}
        >
          <StudentDashboardAnalytics
            tests={entitledTests}
            displayName={displayName}
            yearLevel={yearLevel}
            embedded={true}
            onLogout={() => {
              if (childToken) logoutChild();
              else logout();
              navigate("/");
            }}
          />
        </TrialGateOverlay>
      </div>
    );
  }

  /* ─── MAIN DASHBOARD ─── */
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── TOP HEADER ── */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-indigo-600">
              {isParentViewing
                ? `Hi ${displayName}! ${motivation.emoji}`
                : `${timeGreeting}, ${displayName}! ${motivation.emoji}`}
            </h1>
            {yearLevel && (
              <p className="text-sm text-indigo-400 font-medium">Year {yearLevel} Explorer</p>
            )}
            <p className="text-slate-500 text-sm mt-2 max-w-lg leading-relaxed">
              {isParentViewing ? getDailyParentMessage() : motivation.text}
            </p>
          </div>

          {/* ── ACTION BUTTONS — single logout guaranteed by ternary ── */}
          <div className="flex gap-2 flex-shrink-0">
            {/* Overall Analytics — always visible */}
            <button
              onClick={() => setShowAnalytics(true)}
              className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                         bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200
                         hover:from-indigo-700 hover:to-violet-700 hover:shadow-lg transition-all duration-200"
              title="Overall Analytics"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Overall Analytics
            </button>

            {/* Ternary: parent view gets Back + Logout, child view gets just Logout */}
            {isParentViewing ? (
              <>
                <button
                  onClick={() => navigate("/parent-dashboard")}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100"
                >
                  Back to Parent Dashboard
                </button>
                <button
                  onClick={() => { logout(); navigate("/"); }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => { logoutChild(); navigate("/"); }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <section className="grid md:grid-cols-4 gap-6 bg-white rounded-2xl p-6 border shadow">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Level</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-indigo-600" : "text-slate-300"}`}>
              {hasTests ? level : 1}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total XP</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-slate-900" : "text-slate-300"}`}>
              {hasTests ? totalXP.toLocaleString() : "0"}
            </p>
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${hasTests ? "bg-indigo-500" : "bg-slate-200"}`}
                style={{ width: `${hasTests ? xpProgress : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">XP Progress</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Streak</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-amber-500" : "text-slate-300"}`}>
              {hasTests ? streak : 0} days
            </p>
          </div>
          <AnimatedProgressRing percent={overallAverage} />
        </section>

         {/* ── MY QUIZZES ── */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold">My Quizzes</h2>
                <p className="text-xs text-slate-500 mt-1">Live quiz data is synced from the backend.</p>
              </div>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[
                  { key: "all",       label: "All",       count: entitledCatalog.length },
                  { key: "available", label: "Available", count: availableCount },
                  { key: "completed", label: "Completed", count: completedCount },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setViewMode(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                      viewMode === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label} <span className="text-slate-400">({tab.count})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search quizzes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              >
                <option value="All">All Subjects</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { key: "subject", label: "Subject" },
                    { key: "name",    label: "Quiz Name" },
                    { key: "status",  label: "Status" },
                    { key: "score",   label: "Score" },
                    { key: null,      label: "Action" },
                    { key: null,      label: "AI Feedback" },
                    { key: null,      label: "" },
                  ].map((col, idx) => (
                    <th
                      key={`${col.label}-${idx}`}
                      onClick={() => col.key && handleSort(col.key)}
                      className={`px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                        col.key ? "cursor-pointer hover:text-indigo-600 select-none" : ""
                      }`}
                    >
                      {col.label ? (
                        <span className="flex items-center gap-1">
                          {col.label}
                          {col.key && sortConfig.key === col.key && (
                            <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedQuizzes.length > 0 ? (
                  paginatedQuizzes.map((quiz) => {
                    const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
                    const isCompleted = quiz.status === "completed";
                    const canOpenResult = Boolean(quiz.response_id);
                    return (
                      <tr
                        key={quiz.id}
                        onClick={() => canOpenResult && handleViewResult(quiz)}
                        className={`hover:bg-indigo-50/30 transition ${canOpenResult ? "cursor-pointer" : ""}`}
                      >
                        {/* Subject */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${style.bg}`}>
                              {style.icon}
                            </span>
                            <span className={`font-medium text-sm ${style.text}`}>{quiz.subject}</span>
                          </div>
                        </td>

                        {/* Quiz Name */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800">{quiz.name}</p>
                            <DifficultyBadge difficulty={quiz.difficulty} />
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Not started
                            </span>
                          )}
                        </td>

                        {/* Score */}
                        <td className="px-5 py-4">
                          {isCompleted ? (
                            <span className={`font-bold ${quiz.score >= 85 ? "text-emerald-600" : quiz.score >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                              {quiz.score}%
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-5 py-4">
                          {isCompleted ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveQuiz(quiz); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition"
                              title="Retake Exam"
                              aria-label={`Retake ${quiz.name}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 005.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Retake Quiz
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveQuiz(quiz); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Start Quiz
                            </button>
                          )}
                        </td>

        
                        {/* AI Feedback */}
                        <td className="px-5 py-4">
                          {quiz.response_id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAiFeedback(quiz); }}
                              className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg transition
                                ${(quiz.subject || "").toLowerCase() === "writing"
                                  ? "bg-purple-600 hover:bg-purple-700"
                                  : "bg-indigo-600 hover:bg-indigo-700"
                                }`}
                            >
                              {(quiz.subject || "").toLowerCase() === "writing" ? "AI Feedback" : "AI Feedback"}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="text-slate-400 text-sm">No quizzes match your filters.</p>
                      <button
                        onClick={() => { setSearch(""); setSubjectFilter("All"); setViewMode("all"); }}
                        className="text-indigo-600 text-sm font-medium mt-2 hover:underline"
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * testsPerPage + 1}–{Math.min(currentPage * testsPerPage, sortedQuizzes.length)} of {sortedQuizzes.length}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setCurrentPage(pg)}
                      className={`px-3 py-1 text-xs rounded border ${
                        pg === currentPage ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── RECENT ACTIVITY ── */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          {hasTests ? (
            <div className="grid md:grid-cols-4 gap-4">
              {recentActivity.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleViewResult(t)}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <SubjectIcon subject={t.subject} />
                    <span className="text-xs text-slate-500">{t.subject}</span>
                  </div>
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
                <div
                  key={subj}
                  className="bg-white border border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center text-center py-8"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <span className="text-slate-400 text-lg">{["📖", "✍️", "🔢", "📝"][i]}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">{subj}</p>
                  <p className="text-xs text-slate-300 mt-1">No results yet</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── SUBJECT BREAKDOWN ── */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Subject Breakdown</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {subjectBreakdown.map((s) => {
              const barColor =
                s.average >= 85 ? "bg-emerald-500" :
                s.average >= 70 ? "bg-amber-500" :
                s.average > 0   ? "bg-rose-500" : "bg-slate-200";
              return (
                <div key={s.subject} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <SubjectIcon subject={s.subject} />
                    <span className="text-sm font-medium text-slate-700">{s.subject}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.count > 0 ? "text-slate-900" : "text-slate-300"}`}>
                    {s.count > 0 ? `${s.average}%` : "—"}
                  </p>
                  <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${s.average}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {s.count} of {s.total} quiz{s.total !== 1 ? "zes" : ""} completed
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Small components ─── */
function SubjectIcon({ subject, size = "md" }) {
  const icons = { Reading: "📖", Writing: "✍️", Numeracy: "🔢", Language: "📝", Other: "📚" };
  const sizes = { sm: "w-6 h-6 text-sm", md: "w-8 h-8 text-base" };
  return (
    <div className={`${sizes[size]} rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0`}>
      {icons[subject] || icons.Other}
    </div>
  );
}

function AnimatedProgressRing({ percent }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const hasData = percent > 0;
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="45" cy="45" r={radius}
          fill="none"
          stroke={hasData ? "#6366f1" : "#e2e8f0"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={hasData ? offset : circumference}
          transform="rotate(-90 45 45)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text
          x="45" y="45"
          textAnchor="middle"
          dominantBaseline="central"
          className={`text-lg font-bold ${hasData ? "fill-indigo-600" : "fill-slate-300"}`}
        >
          {hasData ? `${percent}%` : "—"}
        </text>
      </svg>
      <p className="text-xs text-slate-500 mt-1">Average</p>
    </div>
  );
}