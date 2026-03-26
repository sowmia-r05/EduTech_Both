import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
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

function extractBaseName(name) {
  return (name || "")
    .replace(/\s*set\s*\d+/i, "")
    .trim()
    .toLowerCase();
}


const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];

const SUBJECT_ORDER = { Reading: 0, Writing: 1, Numeracy: 2, Language: 3, Other: 4 };

/* ─── Subject styles (original) ─── */
const SUBJECT_STYLE = {
  Reading:  { bg: "bg-blue-100",    text: "text-blue-700",    icon: BookOpen  },
  Writing:  { bg: "bg-purple-100",  text: "text-purple-700",  icon: PenLine   },
  Numeracy: { bg: "bg-amber-100",   text: "text-amber-700",   icon: Hash      },
  Language: { bg: "bg-emerald-100", text: "text-emerald-700", icon: Languages },
  Other:    { bg: "bg-slate-100",   text: "text-slate-600",   icon: Library   },
};

// ✅ Extracts trailing set number for natural sort: "Writing set 10" → 10
function extractSetNumber(name) {
  const match = (name || "").match(/set\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function sanitizeText(raw) {
  return String(raw || "").replace(/[<>"']/g, "").trim().slice(0, 100);
}

function sanitizeYearLevel(raw){
  const n = parseInt(raw, 10);
  return [3,5,7,9].includes(n) ? n : null;
}


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
  { id: "history",    label: "Quiz History",        icon: Library       },
];

function TabSlider({ activeTab, onChange }) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex overflow-hidden">
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

function assertAllowedParams(searchParams, navigate, isParentViewing) {
  const ALLOWED = new Set(["tab"]);
  for (const key of searchParams.keys()) {
    if (!ALLOWED.has(key)) {
      console.warn(`[ChildDashboard] Blocked unknown URL param: ${key}`);
      // Parent goes back to parent dashboard, child goes to home
      navigate(isParentViewing ? "/parent-dashboard" : "/", { replace: true });
      return false;
    }
  }
  return true;
}



/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation ();
  const { childToken, childProfile, parentToken, logoutChild, logout, isInitializing } = useAuth();
  

  const childId     = location.state?.childId || childProfile?.childId;
  const activeToken = childToken || parentToken;
  const isParentViewing = !childToken && !!parentToken;

  useEffect(() => {
    if (!isInitializing && isParentViewing && !childId){
      navigate("/parent-dashboard", {replace: true});
    }
  }, [isInitializing, isParentViewing, childId, navigate]);

  /* ─── Initial tab from URL ─── */
// ✅ AFTER:
const getInitialTab = () => {
  const t = searchParams.get("tab");
  if (t === "cumulative") return "cumulative";
  if (t === "overall")    return "cumulative";
  if (t === "analytics")  return "cumulative";
  if (t === "history")    return "history";
  return "quizzes";
};

  /* ─── STATE ─── */
  const [tests,                setTests]                = useState([]);
  const [childStatus, setChildStatus] = useState("trial");
  const [loading,              setLoading]              = useState(true);
  const [error,                setError]                = useState(null);
  const [currentPage,          setCurrentPage]          = useState(1);
  const [subjectFilter,        setSubjectFilter]        = useState("All");
  const [search,               setSearch]               = useState("");
  const [sortConfig,           setSortConfig]           = useState({ key: "default", direction: "asc" });
  const [childInfo,            setChildInfo]            = useState(null);
  const [activeTab,            setActiveTab]            = useState(getInitialTab);
  const [activeQuiz,           setActiveQuiz]           = useState(null);
  const [selectedQuizResult, setSelectedQuizResult] = useState(null);

  useEffect(() => {
    try { sessionStorage.removeItem("quizResultState"); } catch {}
  },[]);

  const [resultLoading,        setResultLoading]        = useState(false);
  const [viewMode,             setViewMode]             = useState("all");
  const [childEntitledQuizIds, setChildEntitledQuizIds] = useState(null);
  const [availableQuizzes,     setAvailableQuizzes]     = useState([]);
  const [quizzesLoading,       setQuizzesLoading]       = useState(true);
  const [historySubject, setHistorySubject] = useState("All");
  const [historySearch,  setHistorySearch]  = useState("");
  const [historyScore,   setHistoryScore]   = useState("All");
  const [historyDate,    setHistoryDate]    = useState("All");
  const [historySort,    setHistorySort]    = useState("newest");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  const testsPerPage = 8;

  const handleLogout = useCallback(() => {
    if (childToken) logoutChild(); else logout();
    navigate("/");
  }, [childToken, logoutChild, logout, navigate]);

  useEffect(() => {
    assertAllowedParams(searchParams, navigate, isParentViewing);
  }, []);

  // ADD this new useEffect:
    useEffect(() => {
      if (location.state?.restoreQuizResult) {
        setSelectedQuizResult(location.state.restoreQuizResult);
        // Clear it from history state so refresh doesn't re-trigger
        window.history.replaceState(
          { ...window.history.state, usr: { ...location.state, restoreQuizResult: undefined } },
          ""
        );
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps


  /* ─── Resolve child info (original) ─── */
  // ✅ FIX-2: Sanitize URL params before using them
  const resolveChildInfo = useCallback(async () => {
  

    // Read display context from location.state (never from URL params)
    // ParentDashboard and FreeTrialOnboarding already pass these via state
    const nameFromState     = location.state?.childName  || null;
    const yearFromState     = location.state?.yearLevel   || null;
    const usernameFromState = location.state?.username    || null;

    if (nameFromState) {
      setChildInfo({
        display_name: sanitizeText(nameFromState),
        year_level:   yearFromState ? sanitizeYearLevel(String(yearFromState)) : null,
        username:     usernameFromState ? sanitizeText(usernameFromState) : null,
      });
    } else if (childProfile) {

    setChildInfo({
      display_name: childProfile.displayName || childProfile.username || null,
      year_level:   childProfile.yearLevel || null,
      username:     childProfile.username || null,
    });
  }



    if (isParentViewing && parentToken && childId) {
      try {
        const children = await fetchChildrenSummaries(parentToken);
        const match = children.find(
          (c) => String(c._id) === String(childId) ||
                String(c.id)  === String(childId)
        );
        if (!match) {
          console.warn("[ChildDashboard] childId not found in parent's children — redirecting");
          navigate("/parent-dashboard", { replace: true });
          return;
        } 
      if (!nameFromState) {
        setChildInfo({
          display_name: match.display_name || match.username,
          year_level:   match.year_level,
          username:     match.username || null,
        });
      }
      setChildEntitledQuizIds(match.entitled_quiz_ids || []);
      if (match.status) setChildStatus(match.status);
    } catch {
      setChildEntitledQuizIds([]);
    }
  } else if (childProfile) {
    setChildEntitledQuizIds(childProfile.entitled_quiz_ids || []);
  }
}, [location.state, childProfile, parentToken, childId, navigate]);




  useEffect(() => { resolveChildInfo(); }, [resolveChildInfo]);

  /* ─── Load available quizzes (original) ─── */
useEffect(() => {
  if (!activeToken || !childId) {
    setQuizzesLoading(false);
    return;
  }
  setQuizzesLoading(true);
  fetchAvailableQuizzes(activeToken, childId)
    .then((data) => {
      const q = Array.isArray(data) ? data : data?.quizzes || [];
      setAvailableQuizzes(q.map((x) => ({ ...x, subject: normalizeSubject(x.subject) })));

      // ✅ childStatus comes ONLY from API response — never from URL params
      if (data?.child_status) setChildStatus(data.child_status);
    })
    .catch(() => setAvailableQuizzes([]))
    .finally(() => setQuizzesLoading(false));
}, [activeToken, childId]);



  /* ─── refreshData (original) ─── */
const refreshData = useCallback(async () => {
  if (!activeToken || !childId) return;
  const [results, writingDocs] = await Promise.all([
    fetchChildResults(activeToken, childId).catch(() => []),
    fetchChildWriting(activeToken, childId).catch(() => []),
  ]);
  const nonWriting = results.map((r) => ({
    id: r._id, response_id: r.response_id || r.attempt_id, quiz_id: r.quiz_id,
    subject: normalizeSubject(r.subject || inferSubject(r.quiz_name)),
    name: r.quiz_name || "Untitled Quiz",
    score: r.score?.percentage != null ? Math.round(r.score.percentage) : null,
    date: r.date_submitted || r.createdAt, quiz_name: r.quiz_name,
    grade: r.score?.grade || "", duration: r.duration || 0, source: r.source || "native",
  }));

  const writing = (writingDocs || []).map((w) => {
    const overall = w?.ai?.feedback?.overall;
    const total = overall?.total_score || 0; const max = overall?.max_score || 0;
    return { id: w._id, response_id: w.response_id, quiz_id: w.quiz_id, subject: "Writing", name: w.quiz_name || "Untitled Quiz", score: max > 0 ? Math.round((total / max) * 100) : null, date: w.submitted_at || w.createdAt, quiz_name: w.quiz_name, grade: "", duration: w.duration_sec || 0, source: "writing", ai_status: w?.ai?.status || "pending" };
  });
  // ✅ Deduplicate — a writing attempt may exist in both collections simultaneously
  const seen = new Set();
  const merged = [...nonWriting, ...writing].filter((t) => {
    const key = String(t.response_id || t.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  setTests(merged);
}, [activeToken, childId]);


  /* ─── Initial load (original) ─── */
useEffect(() => {
  if (!activeToken || !childId) { setLoading(false); return; }
  setLoading(true);
  Promise.all([
    fetchChildResults(activeToken, childId).catch(() => []),
    fetchChildWriting(activeToken, childId).catch(() => []),
  ])
    .then(([results, writingDocs]) => {
      const nonWriting = results.map((r) => ({
        id: r._id, response_id: r.response_id || r.attempt_id, quiz_id: r.quiz_id,
        subject: normalizeSubject(r.subject || inferSubject(r.quiz_name)),
        name: r.quiz_name || "Untitled Quiz", score: r.score?.percentage != null ? Math.round(r.score.percentage) : null,
        date: r.date_submitted || r.createdAt, quiz_name: r.quiz_name,
        grade: r.score?.grade || "", duration: r.duration || 0, source: r.source || "native",
      }));
      const writing = (writingDocs || []).map((w) => {
        const overall = w?.ai?.feedback?.overall;
        const total = overall?.total_score || 0; const max = overall?.max_score || 0;
        return { id: w._id, response_id: w.response_id, quiz_id: w.quiz_id, subject: "Writing", name: w.quiz_name || "Untitled Quiz", score: max > 0 ? Math.round((total / max) * 100) : null, date: w.submitted_at || w.createdAt, quiz_name: w.quiz_name, grade: "", duration: w.duration_sec || 0, source: "writing" };
      });
      // ✅ Deduplicate — a writing attempt may exist in both collections simultaneously
      const seen = new Set();
      const merged = [...nonWriting, ...writing].filter((t) => {
        const key = String(t.response_id || t.id || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setTests(merged); setError(null);
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));
}, [activeToken, childId]);


  const catalogQuizIdSet = useMemo(
  () => new Set(availableQuizzes.map((q) => q.quiz_id).filter(Boolean)),
  [availableQuizzes]
);

const entitledTests = useMemo(() =>
  tests.filter((t) =>
    // Keep if quiz_id matches catalog OR if no quiz_id (legacy fallback)
    !t.quiz_id || catalogQuizIdSet.has(t.quiz_id)
  ),
  [tests, catalogQuizIdSet]
);


  /* ─── Entitled tests (original) ─── */
  const entitledCatalog = useMemo(() => availableQuizzes, [availableQuizzes]);



  /* ─── Gamification stats (original) ─── */
  const hasTests       = entitledTests.length > 0;

const overallAverage = useMemo(() => {
  const scored = entitledTests.filter(t => t.score !== null && t.score !== undefined);
  return scored.length
    ? Math.round(scored.reduce((s, t) => s + t.score, 0) / scored.length)
    : 0;
}, [entitledTests]);




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
    const ts = entitledTests.filter((t) => t.subject === s && t.score !== null && t.score !== undefined);
    return { subject: s, avg: ts.length ? Math.round(ts.reduce((a, t) => a + t.score, 0) / ts.length) : -1 };

    }).filter((x) => x.avg >= 0);
    if (!bySubject.length) return null;
    return bySubject.sort((a, b) => b.avg - a.avg)[0];
  }, [entitledTests]);

  /* ─── mergedQuizzes (original — drives the quiz table) ─── */
const mergedQuizzes = useMemo(() => entitledCatalog.map((quiz) => {
  const matches = tests.filter((t) => {
    if ((quiz.subject === "Writing") !== (t.subject === "Writing")) return false;
    if (quiz.quiz_id && t.quiz_id) return quiz.quiz_id === t.quiz_id;
    const catalogName = (quiz.quiz_name || "").toLowerCase().replace(/\s+/g, " ").trim();
    const testName    = (t.name || t.quiz_name || "").toLowerCase().replace(/\s+/g, " ").trim();
    return catalogName === testName;
  });
  const m = matches.length ? matches.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;

  // ✅ Count total completed attempts for this quiz
  const attemptCount = matches.length;

  // ✅ Determine if attempts are exhausted
  const maxAttempts = (() => {
      if (quiz.max_attempts != null && quiz.max_attempts > 1) return quiz.max_attempts; // 
      if (quiz.attempts_enabled) return Infinity;
      return 1;
  })();
  const attemptsExhausted = attemptCount >= maxAttempts;



  return {
    id: quiz.quiz_id, quiz_id: quiz.quiz_id,
    name: quiz.quiz_name, quiz_name: quiz.quiz_name,
    subject: quiz.subject,
    year_level: quiz.year_level, difficulty: quiz.difficulty || "Standard",
    time_limit_minutes: quiz.time_limit_minutes, question_count: quiz.question_count,
    is_trial: quiz.is_trial, is_entitled: quiz.is_entitled,
    set_number: quiz.set_number || 1,
    attempts_enabled: quiz.attempts_enabled || false,  // ✅ ADD
    max_attempts: quiz.max_attempts ?? null,            // ✅ ADD
    attempt_count: attemptCount,                        // ✅ ADD
    attempts_exhausted: attemptsExhausted,              // ✅ ADD
    status: m ? "completed" : "not_started",
    score: m?.score ?? null, grade: m?.grade ?? null,
    date_completed: m?.date ?? null, response_id: m?.response_id ?? null,
    ai_status: m?.ai_status ?? null,
    violations: m?.violations ?? m?.proctoring?.violations ?? null,
  };
}), [tests, entitledCatalog]);


/* ─── Quiz filtering / sorting / paging ─── */
const filteredQuizzes = useMemo(() => {
  let list = [...mergedQuizzes];

  // Tab filter (status)
  if (viewMode === "available") list = list.filter((q) => q.status === "not_started");
  if (viewMode === "completed") list = list.filter((q) => q.status === "completed");

  // Subject filter
  if (subjectFilter !== "All") list = list.filter((q) => q.subject === subjectFilter);

  // Search filter — search name, quiz_name, subject and difficulty
  if (search.trim()) {
    const s = search.toLowerCase();
    list = list.filter((q) =>
      (q.name || "").toLowerCase().includes(s) ||
      (q.quiz_name || "").toLowerCase().includes(s) ||
      (q.subject || "").toLowerCase().includes(s) ||
      (q.difficulty || "").toLowerCase().includes(s)
    );
  }

  return list;
}, [mergedQuizzes, viewMode, subjectFilter, search]);

// ✅ FIX 1: Counts reflect CURRENT subject+search filter, not raw mergedQuizzes
const filteredBySearchAndSubject = useMemo(() => {
  let list = [...mergedQuizzes];
  if (subjectFilter !== "All") list = list.filter((q) => q.subject === subjectFilter);
  if (search.trim()) {
    const s = search.toLowerCase();
    list = list.filter((q) =>
      (q.name || "").toLowerCase().includes(s) ||
      (q.subject || "").toLowerCase().includes(s)
    );
  }
  return list;
}, [mergedQuizzes, subjectFilter, search]);

// ✅ FIX 1: Tab counts now respect active search/subject filters
const completedCount = useMemo(() =>
  filteredBySearchAndSubject.filter((q) => q.status === "completed").length,
  [filteredBySearchAndSubject]
);
const availableCount = useMemo(() =>
  filteredBySearchAndSubject.filter((q) => q.status === "not_started").length,
  [filteredBySearchAndSubject]
);





const sortedQuizzes = useMemo(() => {
  return [...filteredQuizzes].sort((a, b) => {
    if (sortConfig.key === "default") {
      // 1. Subject (NAPLAN order)
      const subjectCmp =
        (SUBJECT_ORDER[a.subject] ?? 99) - (SUBJECT_ORDER[b.subject] ?? 99);
      if (subjectCmp !== 0) return subjectCmp;

      // 2. ✅ Topic/base name alphabetically (groups same topics together)
      const baseA = extractBaseName(a.name);
      const baseB = extractBaseName(b.name);
      const baseCmp = baseA.localeCompare(baseB);
      if (baseCmp !== 0) return baseCmp;

      // 3. Set number numerically within same topic
      const setA = extractSetNumber(a.name) || a.set_number || 1;
      const setB = extractSetNumber(b.name) || b.set_number || 1;
      return setA - setB;
    }

    let cmp = 0;
    if (sortConfig.key === "subject") {
      cmp = (SUBJECT_ORDER[a.subject] ?? 99) - (SUBJECT_ORDER[b.subject] ?? 99);
      if (cmp === 0) {
      const setA = extractSetNumber(a.name) || a.set_number || 1;
      const setB = extractSetNumber(b.name) || b.set_number || 1;
        cmp = setA - setB;
      }
    }
    else if (sortConfig.key === "name") {
      // ✅ Natural sort for name column too
      const setA = extractSetNumber(a.name);
      const setB = extractSetNumber(b.name);
      if (setA && setB && a.subject === b.subject) cmp = setA - setB;
      else cmp = (a.name || "").localeCompare(b.name || "");
    }
    else if (sortConfig.key === "score")  cmp = (a.score || 0) - (b.score || 0);
    else if (sortConfig.key === "status") cmp = (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0);

    return sortConfig.direction === "asc" ? cmp : -cmp;
  });
}, [filteredQuizzes, sortConfig]);



const totalPages       = Math.max(1, Math.ceil(sortedQuizzes.length / testsPerPage));
const paginatedQuizzes = sortedQuizzes.slice((currentPage - 1) * testsPerPage, currentPage * testsPerPage);

const handleSort = (key) => {
  setSortConfig((prev) =>
    prev.key === key
      ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" }
  );
  setCurrentPage(1); // ✅ FIX 2: Reset page when sort changes
};

// ✅ FIX 3: Reset page on ANY filter change including sort
useEffect(() => { setCurrentPage(1); }, [subjectFilter, search, viewMode]);


  /* ─── handleViewResult (original) ─── */
  const handleViewResult = useCallback(async (item) => {
    const rid = item.response_id || item.attempt_id; if (!rid) return;
    setResultLoading(true);
    try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/results/${encodeURIComponent(rid)}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
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


const handleViewAIFeedback = useCallback((attemptId, subject, name) => {
  const username = childInfo?.username || childProfile?.username || null;
  const resolvedName = childInfo?.display_name || childProfile?.displayName || "Student";
  const resolvedYear = childInfo?.year_level || childProfile?.yearLevel || null;
  const state = {
    r: attemptId, username, subject, quiz_name: name,
    fromQuizResult: true,
    childId,
    childName: resolvedName,
    yearLevel: resolvedYear,
  };
  setSelectedQuizResult(null);
  navigate(
    (subject || "").toLowerCase() === "writing"
      ? "/writing-feedback/result"
      : "/NonWritingLookupQuizResults/results",
    { state }
  );
}, [navigate, childInfo, childProfile, childId]);


  /* ─── handleQuizClose (original) ─── */
  const handleQuizClose = useCallback((result) => {
    setActiveQuiz(null);
    refreshData();
    if (result?.attempt_id || result?.response_id) {

      // ✅ Detect writing from multiple sources — never rely on is_writing alone
      const isWritingSubject =
        result.is_writing === true ||
        (result.subject || "").toLowerCase() === "writing" ||
        (result.quiz_name || "").toLowerCase().includes("writing") ||
        (activeQuiz?.subject || "").toLowerCase() === "writing" ||
        (activeQuiz?.name || "").toLowerCase().includes("writing");

      setSelectedQuizResult({
        result: {
          score:           result.score || {},
          topic_breakdown: result.topic_breakdown || {},
          is_writing:      isWritingSubject,             // ✅ reliable
          ai_status:       result.ai_status || "queued",
          attempt_id:      result.attempt_id,
          response_id:     result.attempt_id || result.response_id,
          subject:         result.subject || (isWritingSubject ? "Writing" : ""),
        },
        quizName: result.quiz_name || "Quiz",
      });
    }
  }, [refreshData, activeQuiz]);  // ✅ add activeQuiz to deps


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
          const username = childInfo?.username || childProfile?.username || null;
          const resolvedName = childInfo?.display_name || childProfile?.displayName || "Student";
          const resolvedYear = childInfo?.year_level || childProfile?.yearLevel || null;
          const state = {
            r: attemptId,
            username,
            subject,
            quiz_name: name,
            fromQuizResult: true,
            childId,
            childName: resolvedName,
            yearLevel: resolvedYear,
          };
          navigate(
            (subject || "").toLowerCase() === "writing"
              ? "/writing-feedback/result"
              : "/NonWritingLookupQuizResults/results",
            { state }
          );
        }}




    />
  );

   if (selectedQuizResult) return (
      <QuizResult
        result={selectedQuizResult.result}
        quizName={selectedQuizResult.quizName}
        childStatus={childStatus}
        displayName={displayName}
        isParentViewing={isParentViewing}
        childId={childId}
        onClose={() => setSelectedQuizResult(null)}

        // ✅ FIX: Only pass onRetake if attempts are NOT exhausted
        onRetake={(() => {
          const quiz = mergedQuizzes.find(
            (q) =>
              q.quiz_id === selectedQuizResult.result?.quiz_id ||
              (q.name || "").toLowerCase() === (selectedQuizResult.quizName || "").toLowerCase()
          );
          // ✅ If no quiz found OR attempts exhausted → don't pass onRetake at all
          if (!quiz || quiz.attempts_exhausted) return undefined;
          return () => {
            setSelectedQuizResult(null);
            setActiveQuiz(quiz);
          };
        })()}

        // ✅ Pass attempt info so QuizResult can show a message if exhausted
        attemptsExhausted={(() => {
          const quiz = mergedQuizzes.find(
            (q) =>
              q.quiz_id === selectedQuizResult.result?.quiz_id ||
              (q.name || "").toLowerCase() === (selectedQuizResult.quizName || "").toLowerCase()
          );
          return quiz?.attempts_exhausted ?? false;
        })()}
        attemptCount={(() => {
          const quiz = mergedQuizzes.find(
            (q) =>
              q.quiz_id === selectedQuizResult.result?.quiz_id ||
              (q.name || "").toLowerCase() === (selectedQuizResult.quizName || "").toLowerCase()
          );
          return { used: quiz?.attempt_count ?? 1, max: quiz?.max_attempts ?? 1 };
        })()}

      onViewAnalytics={() => {
        setSelectedQuizResult(null);
        setActiveTab("cumulative");
      }}
      onViewAIFeedback={(attemptId, subject, name) => {
        const username = childInfo?.username || childProfile?.username || null;
        const resolvedName = childInfo?.display_name || childProfile?.displayName || "Student";
        const resolvedYear = childInfo?.year_level || childProfile?.yearLevel || null;
        const state = {
          r: attemptId,
          username,
          subject,
          quiz_name: name,
          fromQuizResult: true,
          childId,
          childName: resolvedName,
          yearLevel: resolvedYear,
          savedQuizResult: selectedQuizResult,
        };
        setSelectedQuizResult(null);
        navigate(
          (subject || "").toLowerCase() === "writing"
            ? "/writing-feedback/result"
            : "/NonWritingLookupQuizResults/results",
          { state }
        );
      }}


    />
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
      {/* ── SHARED PAGE HEADER — always visible on all tabs ── */}
<div className="px-4 pt-6 pb-3 md:px-8">
  <div className="max-w-6xl mx-auto">
    <div className="flex items-center gap-2 flex-wrap">
      <h1 className="text-2xl font-bold text-slate-900">
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
      {activeTab === "quizzes"
        ? (isParentViewing ? getDailyParentMessage() : motivation)
        : activeTab === "cumulative"
          ? (isParentViewing
              ? `Subject-by-subject performance trends and AI coaching for ${displayName}`
              : "Your detailed analytics and AI coaching report")
          : (isParentViewing
              ? `All quiz attempts across every subject`
              : `Every quiz you've attempted, all in one place`)}
    </p>
  </div>
</div>

{/* ── KPI STRIP — quizzes tab only ── */}
{activeTab === "quizzes" && (
  <div className="px-4 pb-4 md:px-8">
    <div className="max-w-6xl mx-auto space-y-4">

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* KPI Cards — context-aware */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white rounded-xl p-5 border shadow-sm">
        {isParentViewing ? (
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
)}

      {/* Tab Slider */}
      <TabSlider activeTab={activeTab} onChange={(t) => {
        setActiveTab(t);
        setCurrentPage(1);
        // Update URL so reload returns to same tab
        const newParams = new URLSearchParams(searchParams);
        newParams.set("tab", t);
        navigate(`?${newParams.toString()}`, { replace: true, state: location.state });
      }} />

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
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "23%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "9%"  }} />
                      <col style={{ width: "9%"  }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "10%" }} />
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
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Violations</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">View Results</th>
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
                          {/* Violations */}
                            <td className="px-4 py-3 text-center">
                              {isCompleted && quiz.violations != null
                                ? (
                                  <span className={`inline-flex items-center justify-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    quiz.violations === 0
                                      ? "bg-emerald-50 text-emerald-600"
                                      : quiz.violations <= 2
                                        ? "bg-amber-50 text-amber-600"
                                        : "bg-rose-50 text-rose-600"
                                  }`}>
                                    {quiz.violations === 0 ? "✓ None" : `⚠ ${quiz.violations}`}
                                  </span>
                                )
                                : <span className="text-slate-300">—</span>}
                            </td>
                            {/* Action */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isCompleted ? (
                                quiz.attempts_exhausted ? (
                                  // ✅ All attempts used — disabled button with tooltip
                                  <span
                                    title={`Max attempts reached (${quiz.attempt_count}/${quiz.max_attempts ?? 1})`}
                                    className="inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 text-slate-400 text-xs font-semibold rounded-lg border border-slate-200 cursor-not-allowed whitespace-nowrap"
                                  >
                                    No Attempts Left
                                  </span>
                                ) : (
                                  // ✅ Retake allowed — show remaining attempts if limited
                                  <button
                                    onClick={() => setActiveQuiz(quiz)}
                                    className="inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition border border-slate-200 whitespace-nowrap"
                                  >
                                    Retake Quiz
                                    {quiz.attempts_enabled && quiz.max_attempts && (
                                      <span className="ml-1.5 text-slate-400">
                                        ({quiz.attempt_count}/{quiz.max_attempts})
                                      </span>
                                    )}
                                  </button>
                                )
                              ) : (
                                <button
                                  onClick={() => setActiveQuiz(quiz)}
                                  className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
                                >
                                  Start Quiz
                                </button>
                              )}
                            </td>

                            {/* View Results — opens specific test dashboard */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isCompleted && quiz.response_id
                                ? <button onClick={() => handleViewResult(quiz)}
                                    className={`inline-flex items-center justify-center px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap ${(quiz.subject || "").toLowerCase() === "writing" ? "bg-purple-600 hover:bg-purple-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                                    View Results
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
                        <tr><td colSpan={8} className="px-5 py-12 text-center">
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
          viewerType={viewerType}
          isParentViewing={isParentViewing}
        />
      </TrialGateOverlay>
    )}
     {/* ══════════════════════════════════════════════
    TAB 3 — QUIZ HISTORY
══════════════════════════════════════════════ */}

{activeTab === "history" && (
  <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

    {/* ── LATEST ATTEMPT BANNER ── */}
    {entitledTests.length > 0 && (() => {
      const latest = [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const style = SUBJECT_STYLE[latest.subject] || SUBJECT_STYLE.Other;
      const Icon = style.icon;
      const scoreInfo =
        latest.score >= 60 ? { label: "Excellent",       color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" } :
        latest.score >= 40 ? { label: "Good Progress",   color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",    dot: "bg-blue-500"    } :
        latest.score >= 20 ? { label: "Improving",       color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-500"   } :
                             { label: "Keep Practicing", color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    dot: "bg-rose-400"    };
      return (
        <div className={`mx-5 mt-5 rounded-xl border ${scoreInfo.border} ${scoreInfo.bg} overflow-hidden`}>
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
              <Icon className={`w-4 h-4 ${style.text}`} />
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">⭐ Latest Attempt</span>
                <span className="text-slate-200 text-xs">·</span>
                <span className="text-xs text-slate-500">{new Date(latest.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
              </div>
              <p className="font-semibold text-slate-800 text-sm truncate mt-0.5">{latest.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-bold ${scoreInfo.color}`}>{latest.score}%</span>
                <span className="text-slate-200">·</span>
                <span className={`text-xs ${scoreInfo.color}`}>{scoreInfo.label}</span>
              </div>
            </div>
            {/* CTA */}
            {latest.response_id && (
              <button
                onClick={() => handleViewResult(latest)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${scoreInfo.border} ${scoreInfo.color} hover:opacity-80 transition bg-white`}
              >
                View Result
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      );
    })()}

    {/* ── HEADER + FILTERS + PAGINATION ── */}
    <div className="px-5 py-4 border-b border-slate-100">

      {/* Title + stats */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">All Attempts</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-600">{completedCount}</span> of {mergedQuizzes.length} quizzes practised
            </span>
            <span className="text-slate-200">|</span>
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-600">{entitledTests.length}</span> attempts across all quizzes
            </span>
          </div>
        </div>
      </div>

      {/* Filters + Pagination on same row */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Search */}
        <input
          type="text"
          placeholder="Search quizzes..."
          value={historySearch}
          onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 outline-none w-40"
        />

        {/* Subject dropdown */}
        <select value={historySubject} onChange={(e) => { setHistorySubject(e.target.value); setHistoryPage(1); }}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-600 focus:ring-2 focus:ring-indigo-400 outline-none">
          <option value="All">All Subjects</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Score dropdown */}
        <select value={historyScore} onChange={(e) => { setHistoryScore(e.target.value); setHistoryPage(1); }}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-600 focus:ring-2 focus:ring-indigo-400 outline-none">
          <option value="All">All Scores</option>
          <option value="excellent">⭐ Excellent (60%+)</option>
          <option value="good">🟢 Good (40–59%)</option>
          <option value="improving">🟡 Improving (20–39%)</option>
          <option value="practice">🔴 Keep Trying (0–19%)</option>
        </select>

        {/* Clear filters */}
        {(historySubject !== "All" || historySearch || historyScore !== "All") && (
          <button
            onClick={() => { setHistorySubject("All"); setHistorySearch(""); setHistoryScore("All"); setHistoryPage(1); }}
            className="text-xs text-indigo-600 hover:underline font-medium px-1"
          >
            Clear
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Pagination controls — top right */}
        <div id="history-pagination-top" />
      </div>
    </div>

    {/* ── TABLE ── */}
    {(() => {
      const attemptCountMap = {};
      [...entitledTests]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach((t) => {
          attemptCountMap[t.name] = (attemptCountMap[t.name] || 0) + 1;
          t._attemptNum = attemptCountMap[t.name];
        });

      const getScoreInfo = (score) => {
        if (score >= 60) return { label: "Excellent",      stars: 3, color: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
        if (score >= 40) return { label: "Good Progress",  stars: 2, color: "bg-blue-100 text-blue-700",       bar: "bg-blue-500"    };
        if (score >= 20) return { label: "Improving",      stars: 1, color: "bg-amber-100 text-amber-700",     bar: "bg-amber-500"   };
        return              { label: "Keep Practicing", stars: 0, color: "bg-rose-100 text-rose-600",       bar: "bg-rose-400"    };
      };

      let filtered = [...entitledTests].sort((a, b) => new Date(b.date) - new Date(a.date));
      if (historySearch)            filtered = filtered.filter((t) => (t.name || "").toLowerCase().includes(historySearch.toLowerCase()));
      if (historySubject !== "All") filtered = filtered.filter((t) => t.subject === historySubject);
      if (historyScore === "excellent") filtered = filtered.filter((t) => t.score >= 60);
      if (historyScore === "good")      filtered = filtered.filter((t) => t.score >= 40 && t.score < 60);
      if (historyScore === "improving") filtered = filtered.filter((t) => t.score >= 20 && t.score < 40);
      if (historyScore === "practice")  filtered = filtered.filter((t) => t.score < 20);

      const totalHistoryPages = Math.ceil(filtered.length / HISTORY_PER_PAGE);
      const paginated = filtered.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE);

      // Pagination component reused top + bottom
      const PaginationBar = ({ className = "" }) => totalHistoryPages <= 1 ? null : (
        <div className={`flex items-center gap-1 ${className}`}>
          <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-600">‹</button>
          {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map((pg) => (
            <button key={pg} onClick={() => setHistoryPage(pg)}
              className={`px-2.5 py-1 text-xs rounded-lg border font-medium ${pg === historyPage ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 hover:bg-slate-100 text-slate-600"}`}>
              {pg}
            </button>
          ))}
          <button onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))} disabled={historyPage === totalHistoryPages}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-600">›</button>
        </div>
      );

      if (filtered.length === 0) return (
        <div className="px-5 py-12 text-center">
          <p className="text-slate-400 text-sm">No attempts match your filters.</p>
          <button onClick={() => { setHistorySubject("All"); setHistorySearch(""); setHistoryScore("All"); setHistoryPage(1); }}
            className="text-indigo-600 text-sm font-medium mt-2 hover:underline">Clear filters</button>
        </div>
      );

      return (
        <>
          {/* Count + pagination top */}
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing <span className="font-semibold text-slate-600">{(historyPage - 1) * HISTORY_PER_PAGE + 1}–{Math.min(historyPage * HISTORY_PER_PAGE, filtered.length)}</span> of <span className="font-semibold text-slate-600">{filtered.length}</span> attempts
            </p>
            <PaginationBar />
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Quiz</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((t) => {
                const style = SUBJECT_STYLE[t.subject] || SUBJECT_STYLE.Other;
                const Icon = style.icon;
                const scoreInfo = getScoreInfo(t.score);
                const mins = t.duration ? Math.floor(t.duration / 60) : 0;
                const secs = t.duration ? t.duration % 60 : 0;
                const durationLabel = t.duration ? (mins > 0 ? `${mins}m ${secs}s` : `${secs}s`) : "—";

                return (
                  <tr key={t.id}
                    onClick={() => t.response_id && handleViewResult(t)}
                    className={`transition group ${t.response_id ? "cursor-pointer hover:bg-indigo-50/40" : "hover:bg-slate-50/60"}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                        <p className="font-medium text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Attempt #{t._attemptNum}</p>
                        
                      </div>
                        {t.response_id && (
                          <span className="text-[10px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 flex-shrink-0">
                            Tap to view results
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${style.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${style.text}`} />
                        </span>
                        <span className={`text-sm font-medium ${style.text}`}>{t.subject}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${scoreInfo.color}`}>{t.score}%</span>
                        <span className="text-[10px] text-slate-400">{scoreInfo.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1.5 items-center">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${scoreInfo.bar}`} style={{ width: `${t.score}%` }} />
                        </div>
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((star) => (
                            <svg key={star} className={`w-3 h-3 ${star <= scoreInfo.stars ? "text-amber-400" : "text-slate-200"}`}
                              fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-slate-400">
                      {new Date(t.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-slate-400">{durationLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination bottom */}
          {totalHistoryPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">Page {historyPage} of {totalHistoryPages}</p>
              <PaginationBar />
            </div>
          )}
        </>
      );
    })()}
  </section>
)}
          </div>
        </div>
    </div>
  );
}