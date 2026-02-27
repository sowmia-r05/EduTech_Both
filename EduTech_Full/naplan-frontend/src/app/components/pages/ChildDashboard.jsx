import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchChildResults, fetchChildrenSummaries } from "@/app/utils/api-children";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import NativeQuizPlayer from "@/app/components/quiz/NativeQuizPlayer";



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
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
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
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  return PARENT_MESSAGES[dayOfYear % PARENT_MESSAGES.length];
}

/* ═══════════════════════════════════════════════════════
   AUTO QUIZ TIMING
   ═══════════════════════════════════════════════════════ */
function getEstMinutes(quiz) {
  if (quiz.est_minutes) return quiz.est_minutes;
  const name = (quiz.name || "").toLowerCase().trim();
  const difficulty = (quiz.difficulty || "Standard").toLowerCase();
  const isFullTest = (
    name.includes("full") ||
    /year\s*\d+\s+writing\b/.test(name) ||
    /year\s*\d+\s+reading(\s+set\s*\d+)?$/.test(name) ||
    /year\s*\d+\s+numeracy(\s+set\s*\d+)?$/.test(name) ||
    /year\s*\d+\s+language\s+full/.test(name)
  );
  if (isFullTest) return 45;
  if (difficulty === "hard") return 24;
  if (difficulty === "medium") return 18;
  return 15;
}

/* ═══════════════════════════════════════════════════════
   QUIZ CATALOG — All Year 3 FlexiQuiz embeds
   Each maps to a real FlexiQuiz quiz via embed_id
   ═══════════════════════════════════════════════════════ */
const QUIZ_CATALOG = [
  { id: "y3_writing_1",         name: "Year 3 Writing",                              subject: "Writing",  year_level: 3, embed_id: "87c82fac-2a4e-486d-b566-8200514fa7fc", difficulty: "Standard" },
  { id: "y3_reading_set2",      name: "Year 3 Reading Set 2",                        subject: "Reading",  year_level: 3, embed_id: "2782fc4e-548e-4782-81dc-321c81101742", difficulty: "Standard" },
  { id: "y3_reading_1",         name: "Year 3 Reading",                              subject: "Reading",  year_level: 3, embed_id: "6db1c3ab-db7c-402d-b08d-45f5fc8a48b3", difficulty: "Standard" },
  { id: "y3_numeracy_set2",     name: "Year 3 Numeracy Set 2",                       subject: "Numeracy", year_level: 3, embed_id: "7474b871-b2f4-44c3-ac4a-788aca433ae8", difficulty: "Standard" },
  { id: "y3_numeracy_1",        name: "Year 3 Numeracy",                             subject: "Numeracy", year_level: 3, embed_id: "7a5a06c3-7bdb-47ba-bcf4-182d105710cf", difficulty: "Standard" },
  { id: "y3_number_algebra",    name: "Year 3 Number and Algebra",                   subject: "Numeracy", year_level: 3, embed_id: "ca3c6d7f-5370-41a4-87f7-8e098d762461", difficulty: "Medium" },
  { id: "y3_grammar_set2",      name: "Year 3 Grammar & Punctuation Set 2",          subject: "Language", year_level: 3, embed_id: "6cb798a7-a5cb-44c2-a587-1c92b899b3d5", difficulty: "Medium" },
  { id: "y3_language_set2",     name: "Year 3 Language Full Set 2",                  subject: "Language", year_level: 3, embed_id: "f1a0e888-e486-4049-826c-ce39f631ec5d", difficulty: "Standard" },
  { id: "y3_grammar_hard_set2", name: "Year 3 Grammar & Punctuation (Hard) Set 2",  subject: "Language", year_level: 3, embed_id: "79b9e678-59b0-4db3-a59f-99398c036015", difficulty: "Hard" },
];

/* ─── Subject styling ─── */
const SUBJECT_STYLE = {
  Reading:  { icon: "📖", bg: "bg-blue-50",    text: "text-blue-700",    badge: "bg-blue-100 text-blue-700" },
  Writing:  { icon: "✍️", bg: "bg-purple-50",  text: "text-purple-700",  badge: "bg-purple-100 text-purple-700" },
  Numeracy: { icon: "🔢", bg: "bg-amber-50",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-700" },
  Language: { icon: "📝", bg: "bg-emerald-50",  text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  Other:    { icon: "📚", bg: "bg-slate-50",    text: "text-slate-700",   badge: "bg-slate-100 text-slate-700" },
};

/* ─── Difficulty Badge ─── */
function DifficultyBadge({ difficulty }) {
  const styles = { Standard: "bg-slate-100 text-slate-600", Medium: "bg-amber-100 text-amber-700", Hard: "bg-rose-100 text-rose-700" };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[difficulty] || styles.Standard}`}>
      {difficulty}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { childToken, childProfile, parentToken, logoutChild, logout, isParent } = useAuth();

  const childId = searchParams.get("childId") || childProfile?.childId;
  const activeToken = childToken || parentToken;
  const isParentViewing = !childToken && !!parentToken;

  /* ─── STATE ─── */
  const [tests, setTests] = useState([]);
  const [childStatus, setChildStatus] = useState("trial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "subject", direction: "asc" });
  const [childInfo, setChildInfo] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [viewMode, setViewMode] = useState("all");

  // ✅ NEW: Track child's entitled quiz IDs (null = not yet loaded)
  const [childEntitledQuizIds, setChildEntitledQuizIds] = useState(null);

  const testsPerPage = 8;
  const hasTests = tests.length > 0;

  /* ─── Resolve child info + entitled quiz IDs ─── */
  const resolveChildInfo = useCallback(async () => {
    const nameFromUrl = searchParams.get("childName");
    const yearFromUrl = searchParams.get("yearLevel");
    const usernameFromUrl = searchParams.get("username");

    // Set display info from URL params
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

    // ✅ CRITICAL: Fetch entitled_quiz_ids via summaries API
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
          console.log("✅ entitled_quiz_ids from API:", match.entitled_quiz_ids);
          setChildEntitledQuizIds(match.entitled_quiz_ids || []);
        } else {
          console.warn("⚠️ Child not found in summaries");
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

  /* ─── FETCH REAL DATA ─── */
  useEffect(() => {
    if (!activeToken || !childId) { setLoading(false); return; }
    setLoading(true);
    fetchChildResults(activeToken, childId)
      .then((results) => {
        setTests(results.map((r) => ({
          id: r._id, response_id: r.response_id, subject: inferSubject(r.quiz_name),
          name: r.quiz_name || "Untitled Quiz", score: Math.round(r.score?.percentage || 0),
          date: r.date_submitted || r.createdAt, quiz_name: r.quiz_name, grade: r.score?.grade || "", duration: r.duration || 0,
        })));
        setError(null);
      })
      .catch((err) => { console.error("Failed to load child results:", err); setError(err.message); })
      .finally(() => setLoading(false));
  }, [activeToken, childId]);

  /* ─── CALCULATIONS ─── */
  const overallAverage = useMemo(() => { if (!tests.length) return 0; return Math.round(tests.reduce((s, t) => s + t.score, 0) / tests.length); }, [tests]);
  const totalXP = useMemo(() => tests.reduce((s, t) => s + t.score * 10, 0), [tests]);
  const level = useMemo(() => Math.max(1, Math.floor(totalXP / 500) + 1), [totalXP]);
  const xpProgress = useMemo(() => ((totalXP % 500) / 500) * 100, [totalXP]);
  const streak = useMemo(() => {
    if (!tests.length) return 0;
    const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diffDays = Math.floor((new Date(sorted[i - 1].date) - new Date(sorted[i].date)) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) count++; else break;
    }
    return count;
  }, [tests]);

  /* ═══════════════════════════════════════════════════════
     ✅ FILTERED QUIZ CATALOG — only entitled quizzes
     Matches QUIZ_CATALOG.embed_id against child's entitled_quiz_ids
     ═══════════════════════════════════════════════════════ */
  const entitledCatalog = useMemo(() => {
    if (childEntitledQuizIds !== null && childEntitledQuizIds.length > 0) {
      const filtered = QUIZ_CATALOG.filter((quiz) =>
        childEntitledQuizIds.includes(quiz.embed_id)
      );
      console.log(`✅ Filtered: ${filtered.length} of ${QUIZ_CATALOG.length} quizzes`);
      return filtered;
    }
    // Fallback: show all (for trial users or while loading)
    return QUIZ_CATALOG;
  }, [childEntitledQuizIds]);

  /* ─── Subject breakdown ─── */
  const subjectBreakdown = useMemo(() => {
    return SUBJECTS.map((subj) => {
      const subjectTests = tests.filter((t) => t.subject === subj);
      const subjectQuizTotal = entitledCatalog.filter((q) => q.subject === subj).length;
      const avg = subjectTests.length ? Math.round(subjectTests.reduce((s, t) => s + t.score, 0) / subjectTests.length) : 0;
      return { subject: subj, average: avg, count: subjectTests.length, total: subjectQuizTotal };
    });
  }, [tests, entitledCatalog]);

  /* ─── Merge entitled catalog with completed results ─── */
  const mergedQuizzes = useMemo(() => {
    return entitledCatalog.map((quiz) => {
      const matched = tests.find((t) => {
        const tName = (t.name || "").toLowerCase().trim();
        const qName = quiz.name.toLowerCase().trim();
        return tName === qName || tName.includes(qName) || qName.includes(tName);
      });
      return {
        ...quiz,
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

  /* ─── Filtered & sorted quiz list ─── */
  const filteredQuizzes = useMemo(() => {
    let list = [...mergedQuizzes];
    if (viewMode === "available") list = list.filter((q) => q.status === "not_started");
    if (viewMode === "completed") list = list.filter((q) => q.status === "completed");
    if (subjectFilter !== "All") list = list.filter((q) => q.subject === subjectFilter);
    if (search.trim()) { const s = search.toLowerCase(); list = list.filter((q) => q.name.toLowerCase().includes(s) || q.subject.toLowerCase().includes(s)); }
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

  const recentActivity = useMemo(() => [...tests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4), [tests]);

  const handleSort = (key) => {
    setSortConfig((prev) => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  };

  useEffect(() => { setCurrentPage(1); }, [subjectFilter, search, viewMode]);

  const handleViewResult = (item) => {
    const rid = item.response_id;
    if (!rid) return;
    const isWriting = item.subject === "Writing";
    const params = new URLSearchParams({ r: rid });
    const username = childProfile?.username || childInfo?.username || null;
    if (username) params.set("username", username);
    if (item.subject) params.set("subject", item.subject);
    navigate(isWriting ? `/writing-feedback/result?${params}` : `/NonWritingLookupQuizResults/results?${params}`);
  };

  const handleQuizClose = (result) => {
    const closedQuiz = activeQuiz;
    setActiveQuiz(null);
    if (activeToken && childId) {
      fetchChildResults(activeToken, childId).then((results) => {
        setTests(results.map((r) => ({
          id: r._id, response_id: r.response_id, subject: inferSubject(r.quiz_name),
          name: r.quiz_name || "Untitled Quiz", score: Math.round(r.score?.percentage || 0),
          date: r.date_submitted || r.createdAt, quiz_name: r.quiz_name, grade: r.score?.grade || "", duration: r.duration || 0,
        })));
      }).catch(() => {});
    }
  };

  const displayName = childInfo?.display_name || childProfile?.displayName || "Student";
  const yearLevel = childInfo?.year_level || childProfile?.yearLevel || null;
  const motivation = getDailyMotivation();
  const timeGreeting = getTimeGreeting();

  if (activeQuiz) return <NativeQuizPlayer quiz={activeQuiz} onClose={handleQuizClose} />;

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <button onClick={() => setShowAnalytics(false)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back to Dashboard
            </button>
            <span className="text-sm text-slate-500 hidden sm:inline">{displayName}'s Analytics</span>
          </div>
        </div>
        <StudentDashboardAnalytics tests={tests} displayName={displayName} yearLevel={yearLevel} embedded={true} onLogout={() => { if (childToken) logoutChild(); else logout(); navigate("/"); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-indigo-600">
              {isParentViewing ? `Hi ${displayName}! ${motivation.emoji}` : `${timeGreeting}, ${displayName}! ${motivation.emoji}`}
            </h1>
            {yearLevel && <p className="text-sm text-indigo-400 font-medium">Year {yearLevel} Explorer</p>}
            <p className="text-slate-500 text-sm mt-2 max-w-lg leading-relaxed">{isParentViewing ? getDailyParentMessage() : motivation.text}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setShowAnalytics(true)} className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-violet-700 hover:shadow-lg transition-all duration-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
              View Analytics
            </button>
            {isParentViewing && (
              <>
                <button onClick={() => navigate("/parent-dashboard")} className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100">Back to Dashboard</button>
                <button onClick={() => { logout(); navigate("/"); }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Logout</button>
              </>
            )}
            {childToken && !isParentViewing && (
              <button onClick={() => { logoutChild(); navigate("/"); }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Logout</button>
            )}
          </div>
        </div>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

        {!hasTests && !error && (
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-8 text-white shadow-lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/10 rounded-full" />
            <div className="relative z-10">
              <div className="text-3xl mb-3">{isParentViewing ? "📋" : "🚀"}</div>
              <h2 className="text-xl font-bold mb-2">
                {isParentViewing ? `${displayName} Hasn't Taken Any Quizzes Yet` : `Your Adventure Starts Here, ${displayName}!`}
              </h2>
              <p className="text-indigo-100 text-sm leading-relaxed max-w-xl mb-6">
                {isParentViewing
                  ? `Pick any quiz from the table below to get ${displayName} started!`
                  : "Pick any quiz below and click Start Quiz — you'll earn XP, level up, and build streaks!"}
              </p>
            </div>
          </div>
        )}

        <section className="grid md:grid-cols-4 gap-6 bg-white rounded-2xl p-6 border shadow">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Level</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-indigo-600" : "text-slate-300"}`}>{hasTests ? level : 1}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total XP</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-slate-900" : "text-slate-300"}`}>{hasTests ? totalXP.toLocaleString() : "0"}</p>
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-700 ${hasTests ? "bg-indigo-500" : "bg-slate-200"}`} style={{ width: `${hasTests ? xpProgress : 0}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1">XP Progress</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Streak</p>
            <p className={`text-3xl font-bold ${hasTests ? "text-amber-500" : "text-slate-300"}`}>{hasTests ? streak : 0} days</p>
          </div>
          <AnimatedProgressRing percent={overallAverage} />
        </section>

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
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3"><span className="text-slate-400 text-lg">{["📖", "✍️", "🔢", "📝"][i]}</span></div>
                  <p className="text-xs text-slate-400 font-medium">{subj}</p>
                  <p className="text-xs text-slate-300 mt-1">No results yet</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Subject Breakdown</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {subjectBreakdown.map((s) => {
              const barColor = s.average >= 85 ? "bg-emerald-500" : s.average >= 70 ? "bg-amber-500" : s.average > 0 ? "bg-rose-500" : "bg-slate-200";
              return (
                <div key={s.subject} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3"><SubjectIcon subject={s.subject} /><span className="text-sm font-medium text-slate-700">{s.subject}</span></div>
                  <p className={`text-2xl font-bold ${s.count > 0 ? "text-slate-900" : "text-slate-300"}`}>{s.count > 0 ? `${s.average}%` : "—"}</p>
                  <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${s.average}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{s.count} of {s.total} quiz{s.total !== 1 ? "zes" : ""} completed</p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">My Quizzes</h2>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[
                  { key: "all", label: "All", count: entitledCatalog.length },
                  { key: "available", label: "Available", count: availableCount },
                  { key: "completed", label: "Completed", count: completedCount },
                ].map((tab) => (
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
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { key: "subject", label: "Subject" },
                    { key: "name", label: "Quiz Name" },
                    { key: "status", label: "Status" },
                    { key: "score", label: "Score" },
                    { key: null, label: "Action" },
                  ].map((col) => (
                    <th key={col.label} onClick={() => col.key && handleSort(col.key)}
                      className={`px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.key ? "cursor-pointer hover:text-indigo-600 select-none" : ""}`}>
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.key && sortConfig.key === col.key && <span className="text-indigo-500">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedQuizzes.length > 0 ? (
                  paginatedQuizzes.map((quiz) => {
                    const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
                    return (
                      <tr key={quiz.id} className="hover:bg-indigo-50/30 transition">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${style.bg}`}>{style.icon}</span>
                            <span className={`font-medium text-sm ${style.text}`}>{quiz.subject}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800">{quiz.name}</p>
                            <DifficultyBadge difficulty={quiz.difficulty} />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {quiz.status === "completed" ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Not started
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {quiz.status === "completed" ? (
                            <span className={`font-bold ${quiz.score >= 85 ? "text-emerald-600" : quiz.score >= 70 ? "text-amber-600" : "text-rose-600"}`}>{quiz.score}%</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {quiz.status === "completed" && quiz.response_id ? (
                            <button onClick={() => handleViewResult(quiz)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition">View Details</button>
                          ) : (
                            <button onClick={() => setActiveQuiz(quiz)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Start Quiz
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <p className="text-slate-400 text-sm">No quizzes match your filters.</p>
                      <button onClick={() => { setSearch(""); setSubjectFilter("All"); setViewMode("all"); }} className="text-indigo-600 text-sm font-medium mt-2 hover:underline">Clear filters</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

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
        </section>

        {!hasTests && !error && (
          <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">{isParentViewing ? `How to Get ${displayName} Started` : "What's Next?"}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {isParentViewing ? (
                <>
                  <StepCard step={1} icon="🎯" title="Pick a Quiz" description={`Choose any quiz from the table above for ${displayName} to attempt.`} />
                  <StepCard step={2} icon="🛒" title="Purchase More Bundles" description={`Unlock more year levels and subjects by purchasing a quiz bundle.`} />
                  <StepCard step={3} icon="📊" title="Track Progress" description={`Once ${displayName} completes quizzes, scores and AI feedback will appear here.`} />
                </>
              ) : (
                <>
                  <StepCard step={1} icon="🎮" title="Pick a Quiz Above" description="Click Start Quiz on any quiz in the table. Each quiz earns you XP!" />
                  <StepCard step={2} icon="⚡" title="Earn XP & Level Up" description="Every quiz you complete earns XP points. Keep going to level up!" />
                  <StepCard step={3} icon="🏆" title="See Your Progress" description="Your scores, streaks, and subject performance are tracked right here." />
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SubjectIcon({ subject, size = "md" }) {
  const icons = { Reading: "📖", Writing: "✍️", Numeracy: "🔢", Language: "📝", Other: "📚" };
  const sizes = { sm: "w-6 h-6 text-sm", md: "w-8 h-8 text-base" };
  return <div className={`${sizes[size]} rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0`}>{icons[subject] || icons.Other}</div>;
}

function StepCard({ step, icon, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">{step}</div>
      <div>
        <h3 className="font-medium text-slate-800 mb-1"><span className="mr-1.5">{icon}</span>{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
      </div>
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
        <circle cx="45" cy="45" r={radius} fill="none" stroke={hasData ? "#6366f1" : "#e2e8f0"} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={hasData ? offset : circumference} transform="rotate(-90 45 45)" style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x="45" y="45" textAnchor="middle" dominantBaseline="central" className={`text-lg font-bold ${hasData ? "fill-indigo-600" : "fill-slate-300"}`}>{hasData ? `${percent}%` : "—"}</text>
      </svg>
      <p className="text-xs text-slate-500 mt-1">Average</p>
    </div>
  );
}