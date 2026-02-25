import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchChildResults, fetchChildren } from "@/app/utils/api-children";

/* ─── Subject inference from quiz name ─── */
function inferSubject(quizName) {
  const q = (quizName || "").toLowerCase();
  if (q.includes("numeracy") && q.includes("calculator")) return "Numeracy";
  if (q.includes("numeracy")) return "Numeracy";
  if (q.includes("language") || q.includes("convention")) return "Language";
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

export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { childToken, childProfile, parentToken, logoutChild, logout, isParent } = useAuth();

  // Support both: child logged in directly, or parent viewing a child
  const childId = searchParams.get("childId") || childProfile?.childId;
  const activeToken = childToken || parentToken;
  const isParentViewing = !childToken && !!parentToken;

  /* ─── STATE ─── */
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [childInfo, setChildInfo] = useState(null);

  const testsPerPage = 8;
  const hasTests = tests.length > 0;

  /* ─── Resolve child name from multiple sources ─── */
  const resolveChildInfo = useCallback(async () => {
    // Source 1: URL query params (passed from ParentDashboard)
    const nameFromUrl = searchParams.get("childName");
    const yearFromUrl = searchParams.get("yearLevel");
    if (nameFromUrl) {
      setChildInfo({
        display_name: decodeURIComponent(nameFromUrl),
        year_level: yearFromUrl ? Number(yearFromUrl) : null,
      });
      return;
    }

    // Source 2: childProfile from AuthContext (child logged in directly)
    if (childProfile) {
      setChildInfo({
        display_name: childProfile.displayName || childProfile.username || null,
        year_level: childProfile.yearLevel || null,
      });
      return;
    }

    // Source 3: Fetch from API (parent viewing, no name in URL — fallback)
    if (parentToken && childId) {
      try {
        const children = await fetchChildren(parentToken);
        const match = children.find((c) => String(c._id) === String(childId));
        if (match) {
          setChildInfo({
            display_name: match.display_name || match.username,
            year_level: match.year_level,
          });
        }
      } catch (err) {
        console.error("Failed to fetch child info:", err);
      }
    }
  }, [searchParams, childProfile, parentToken, childId]);

  useEffect(() => {
    resolveChildInfo();
  }, [resolveChildInfo]);

  /* ─── FETCH REAL DATA ─── */
  useEffect(() => {
    if (!activeToken || !childId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchChildResults(activeToken, childId)
      .then((results) => {
        const mapped = results.map((r) => ({
          id: r._id,
          response_id: r.response_id,
          subject: inferSubject(r.quiz_name),
          name: r.quiz_name || "Untitled Quiz",
          score: Math.round(r.score?.percentage || 0),
          date: r.date_submitted || r.createdAt,
          quiz_name: r.quiz_name,
          grade: r.score?.grade || "",
          duration: r.duration || 0,
        }));
        setTests(mapped);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load child results:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [activeToken, childId]);

  /* ─── CALCULATIONS ─── */
  const overallAverage = useMemo(() => {
    if (!tests.length) return 0;
    return Math.round(tests.reduce((sum, t) => sum + t.score, 0) / tests.length);
  }, [tests]);

  const totalXP = useMemo(() => {
    return tests.reduce((sum, t) => sum + t.score * 10, 0);
  }, [tests]);

  const level = useMemo(() => Math.max(1, Math.floor(totalXP / 500) + 1), [totalXP]);
  const xpProgress = useMemo(() => ((totalXP % 500) / 500) * 100, [totalXP]);

  const streak = useMemo(() => {
    if (!tests.length) return 0;
    const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date);
      const curr = new Date(sorted[i].date);
      const diffDays = Math.floor((prev - curr) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) count++;
      else break;
    }
    return count;
  }, [tests]);

  /* ─── Subject breakdown ─── */
  const subjectBreakdown = useMemo(() => {
    return SUBJECTS.map((subj) => {
      const subjectTests = tests.filter((t) => t.subject === subj);
      const avg = subjectTests.length
        ? Math.round(subjectTests.reduce((s, t) => s + t.score, 0) / subjectTests.length)
        : 0;
      return { subject: subj, average: avg, count: subjectTests.length };
    });
  }, [tests]);

  /* ─── Filtered & Sorted data ─── */
  const filteredData = useMemo(() => {
    return tests.filter((t) => {
      if (subjectFilter !== "All" && t.subject !== subjectFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tests, subjectFilter, search]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => {
      let cmp = 0;
      if (sortConfig.key === "date") {
        cmp = new Date(a.date) - new Date(b.date);
      } else if (sortConfig.key === "score") {
        cmp = a.score - b.score;
      } else if (sortConfig.key === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortConfig.key === "subject") {
        cmp = a.subject.localeCompare(b.subject);
      }
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / testsPerPage));
  const paginatedTests = sortedData.slice(
    (currentPage - 1) * testsPerPage,
    currentPage * testsPerPage
  );

  const recentActivity = useMemo(() => {
    return [...tests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  }, [tests]);

  const handleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" }
    );
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [subjectFilter, search]);

  const handleViewResult = (test) => {
    if (test.response_id) {
      navigate(`/NonWritingLookupQuizResults/results?r=${test.response_id}`);
    }
  };

  /* ─── Resolved display name ─── */
  const displayName = childInfo?.display_name || childProfile?.displayName || "Student";
  const yearLevel = childInfo?.year_level || childProfile?.yearLevel || null;
  const motivation = getDailyMotivation();
  const timeGreeting = getTimeGreeting();

  /* ─── LOADING ─── */
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ══════════════════════════════════════════════
            HEADER — personalised greeting with child name
           ══════════════════════════════════════════════ */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-indigo-600">
              {isParentViewing
                ? `Hi ${displayName}! ${motivation.emoji}`
                : `${timeGreeting}, ${displayName}! ${motivation.emoji}`}
            </h1>
            {yearLevel && (
              <p className="text-sm text-indigo-400 font-medium">
                Year {yearLevel} Explorer
              </p>
            )}
            <p className="text-slate-500 text-sm mt-2 max-w-lg leading-relaxed">
              {isParentViewing
                ? getDailyParentMessage()
                : motivation.text}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isParentViewing && (
              <>
                <button
                  onClick={() => navigate("/parent-dashboard")}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  Logout
                </button>
              </>
            )}
            {childToken && !isParentViewing && (
              <button
                onClick={() => {
                  logoutChild();
                  navigate("/");
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            EMPTY STATE BANNER (shown when no quizzes)
           ══════════════════════════════════════════════ */}
        {!hasTests && !error && (
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-8 text-white shadow-lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/10 rounded-full" />

            <div className="relative z-10">
              {isParentViewing ? (
                <>
                  <div className="text-3xl mb-3">📋</div>
                  <h2 className="text-xl font-bold mb-2">
                    {displayName} Hasn't Taken Any Quizzes Yet
                  </h2>
                  <p className="text-indigo-100 text-sm leading-relaxed max-w-xl mb-6">
                    Once {displayName} completes their first quiz, you'll see their scores,
                    subject breakdowns, progress trends, and AI-powered coaching feedback
                    right here. Get them started with a free sample test, or purchase a
                    quiz bundle to unlock the full experience!
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => navigate("/parent-dashboard")}
                      className="px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-lg text-sm hover:bg-indigo-50 transition"
                    >
                      Back to Parent Dashboard
                    </button>
                    <button
                      onClick={() => navigate("/free-trial")}
                      className="px-5 py-2.5 bg-white/20 text-white font-medium rounded-lg text-sm hover:bg-white/30 transition border border-white/30"
                    >
                      Try Free Sample Test
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl mb-3">🚀</div>
                  <h2 className="text-xl font-bold mb-2">
                    Your Adventure Starts Here, {displayName}!
                  </h2>
                  <p className="text-indigo-100 text-sm leading-relaxed max-w-xl mb-6">
                    This is your personal dashboard — once you take your first quiz,
                    you'll unlock XP, level up, build streaks, and see exactly how
                    you're improving across every subject. Ready to show what you can do?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => navigate("/free-trial")}
                      className="px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-lg text-sm hover:bg-indigo-50 transition"
                    >
                      Take a Free Sample Test
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            GAMIFICATION STATS — always visible
           ══════════════════════════════════════════════ */}
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

        {/* ══════════════════════════════════════════════
            RECENT ACTIVITY
           ══════════════════════════════════════════════ */}
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
                    <span className="text-xs text-slate-400">
                      {new Date(t.date).toLocaleDateString()}
                    </span>
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
                    <span className="text-slate-400 text-lg">
                      {["📖", "✍️", "🔢", "📝"][i]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">{subj}</p>
                  <p className="text-xs text-slate-300 mt-1">No results yet</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════
            SUBJECT BREAKDOWN — always visible
           ══════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Subject Breakdown</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {subjectBreakdown.map((s) => {
              const barColor =
                s.average >= 85
                  ? "bg-emerald-500"
                  : s.average >= 70
                    ? "bg-amber-500"
                    : s.average > 0
                      ? "bg-rose-500"
                      : "bg-slate-200";

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
                    <div
                      className={`h-full ${barColor} transition-all duration-700`}
                      style={{ width: `${s.average}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {s.count > 0
                      ? `${s.count} quiz${s.count !== 1 ? "zes" : ""} completed`
                      : "No quizzes taken"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            RESULTS TABLE — always show structure
           ══════════════════════════════════════════════ */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">All Results</h2>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search quizzes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!hasTests}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                disabled={!hasTests}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-400 outline-none"
              >
                <option value="All">All Subjects</option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
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
                    { key: "score", label: "Score" },
                    { key: "date", label: "Date" },
                    { key: null, label: "Action" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      onClick={() => col.key && hasTests && handleSort(col.key)}
                      className={`px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                        col.key && hasTests ? "cursor-pointer hover:text-slate-700" : ""
                      }`}
                    >
                      {col.label}
                      {col.key && sortConfig.key === col.key && hasTests && (
                        <span className="ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hasTests ? (
                  paginatedTests.map((t) => (
                    <tr key={t.id} className="hover:bg-indigo-50/40 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <SubjectIcon subject={t.subject} size="sm" />
                          <span className="font-medium text-slate-700">{t.subject}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{t.name}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`font-semibold ${
                            t.score >= 85
                              ? "text-emerald-600"
                              : t.score >= 70
                                ? "text-amber-600"
                                : "text-rose-600"
                          }`}
                        >
                          {t.score}%
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleViewResult(t)}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    {[1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100" />
                            <div className="h-3 w-16 bg-slate-100 rounded" />
                          </div>
                        </td>
                        <td className="px-5 py-4"><div className="h-3 w-32 bg-slate-100 rounded" /></td>
                        <td className="px-5 py-4"><div className="h-3 w-10 bg-slate-100 rounded" /></td>
                        <td className="px-5 py-4"><div className="h-3 w-20 bg-slate-100 rounded" /></td>
                        <td className="px-5 py-4"><div className="h-6 w-20 bg-slate-100 rounded-lg" /></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center">
                        <p className="text-slate-400 text-sm">
                          {isParentViewing
                            ? `Quiz results will appear here once ${displayName} completes a quiz.`
                            : "Your quiz results will show up here after you take a quiz!"}
                        </p>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {hasTests && totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * testsPerPage + 1}–
                  {Math.min(currentPage * testsPerPage, sortedData.length)} of {sortedData.length}
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
                        pg === currentPage
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "border-slate-200 hover:bg-slate-100"
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

        {/* ══════════════════════════════════════════════
            GETTING STARTED STEPS (only when no tests)
           ══════════════════════════════════════════════ */}
        {!hasTests && !error && (
          <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">
              {isParentViewing ? `How to Get ${displayName} Started` : "What's Next?"}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {isParentViewing ? (
                <>
                  <StepCard
                    step={1}
                    icon="🎯"
                    title="Try a Free Sample"
                    description={`Let ${displayName} attempt a free sample test to experience the platform before purchasing.`}
                  />
                  <StepCard
                    step={2}
                    icon="🛒"
                    title="Purchase a Quiz Bundle"
                    description={`Choose a quiz bundle for ${displayName}'s year level. Payment unlocks all quizzes in the bundle instantly.`}
                  />
                  <StepCard
                    step={3}
                    icon="📊"
                    title="Track Progress Here"
                    description={`Once ${displayName} completes quizzes, scores, subject breakdowns, and AI coaching feedback will appear on this dashboard.`}
                  />
                </>
              ) : (
                <>
                  <StepCard
                    step={1}
                    icon="🎮"
                    title="Take a Quiz"
                    description="Start with a free sample test or any quiz assigned to you. Each quiz earns you XP!"
                  />
                  <StepCard
                    step={2}
                    icon="⚡"
                    title="Earn XP & Level Up"
                    description="Every quiz you complete earns XP points. Keep a daily streak going to level up faster!"
                  />
                  <StepCard
                    step={3}
                    icon="🏆"
                    title="See Your Progress"
                    description="Your scores, streaks, and subject performance will all be tracked right here. Aim for the top!"
                  />
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HELPER COMPONENTS
═══════════════════════════════════════════ */

function SubjectIcon({ subject, size = "md" }) {
  const icons = { Reading: "📖", Writing: "✍️", Numeracy: "🔢", Language: "📝", Other: "📚" };
  const sizes = { sm: "w-6 h-6 text-sm", md: "w-8 h-8 text-base" };
  return (
    <div className={`${sizes[size]} rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0`}>
      {icons[subject] || icons.Other}
    </div>
  );
}

function StepCard({ step, icon, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
        {step}
      </div>
      <div>
        <h3 className="font-medium text-slate-800 mb-1">
          <span className="mr-1.5">{icon}</span>{title}
        </h3>
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
        <circle
          cx="45" cy="45" r={radius} fill="none"
          stroke={hasData ? "#6366f1" : "#e2e8f0"}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={hasData ? offset : circumference}
          transform="rotate(-90 45 45)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text
          x="45" y="45" textAnchor="middle" dominantBaseline="central"
          className={`text-lg font-bold ${hasData ? "fill-indigo-600" : "fill-slate-300"}`}
        >
          {hasData ? `${percent}%` : "—"}
        </text>
      </svg>
      <p className="text-xs text-slate-500 mt-1">Average</p>
    </div>
  );
}
