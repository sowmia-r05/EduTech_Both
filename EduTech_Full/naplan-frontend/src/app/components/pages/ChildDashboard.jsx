import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchChildResults } from "@/app/utils/api-children";

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

export default function ChildDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { childToken, childProfile, parentToken, logoutChild } = useAuth();

  // Support both: child logged in directly, or parent viewing a child
  const childId = searchParams.get("childId") || childProfile?.childId;
  const activeToken = childToken || parentToken;

  /* ─── STATE ─── */
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });

  const testsPerPage = 8;

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

  const level = Math.floor(totalXP / 2000) + 1;
  const xpProgress = (totalXP % 2000) / 20;

  const streak = useMemo(() => {
    if (!tests.length) return 0;
    const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date);
      const curr = new Date(sorted[i].date);
      const diff = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diff >= 0.5 && diff <= 1.5) count++;
      else break;
    }
    return count;
  }, [tests]);

  /* ─── CONFETTI ─── */
  useEffect(() => {
    if (tests.some((t) => t.score >= 90)) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }, [tests]);

  /* ─── FILTERING & SORTING ─── */
  const filteredData = useMemo(() => {
    let data = [...tests];
    if (subjectFilter !== "All") data = data.filter((t) => t.subject === subjectFilter);
    if (search.trim())
      data = data.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
    return data;
  }, [tests, subjectFilter, search]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      if (sortConfig.key === "date") {
        return sortConfig.direction === "asc"
          ? new Date(a.date) - new Date(b.date)
          : new Date(b.date) - new Date(a.date);
      }
      if (sortConfig.key === "score") {
        return sortConfig.direction === "asc" ? a.score - b.score : b.score - a.score;
      }
      if (sortConfig.key === "subject") {
        const cmp = a.subject.localeCompare(b.subject);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      }
      return 0;
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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [subjectFilter, search]);

  /* ─── Navigate to detailed result view ─── */
  const handleViewResult = (test) => {
    if (test.response_id) {
      navigate(`/NonWritingLookupQuizResults/results?r=${test.response_id}`);
    }
  };

  const displayName = childProfile?.displayName || "Student";

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-indigo-600">Hey {displayName}!</h1>
            <p className="text-slate-500 text-sm mt-1">Here's how you're doing</p>
          </div>
          <div className="flex gap-2">
            {childToken && (
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
            {!childToken && parentToken && (
              <button
                onClick={() => navigate("/parent-dashboard")}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100"
              >
                Back to Dashboard
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

        {/* EMPTY STATE */}
        {tests.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No quiz results yet.</p>
            <p className="text-slate-400 text-sm mt-2">
              Take a quiz to see your results and progress here!
            </p>
          </div>
        )}

        {tests.length > 0 && (
          <>
            {/* GAMIFICATION STATS */}
            <section className="grid md:grid-cols-4 gap-6 bg-white rounded-2xl p-6 border shadow">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Level</p>
                <p className="text-3xl font-bold text-indigo-600">{level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total XP</p>
                <p className="text-3xl font-bold">{totalXP.toLocaleString()}</p>
                <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-700"
                    style={{ width: `${xpProgress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">XP Progress</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Streak</p>
                <p className="text-3xl font-bold text-amber-500">{streak} days</p>
              </div>

              <AnimatedProgressRing percent={overallAverage} />
            </section>

            {/* RECENT ACTIVITY */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
              <div className="grid md:grid-cols-4 gap-4">
                {recentActivity.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl p-4 border shadow hover:shadow-xl transition cursor-pointer"
                    onClick={() => handleViewResult(t)}
                  >
                    <p className="text-sm text-slate-500">{t.subject}</p>
                    <p className="font-semibold truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(t.date).toLocaleDateString()}
                    </p>
                    <div className="mt-2 flex justify-between items-center">
                      <SubjectBadge subject={t.subject} />
                      <span className="font-bold">{t.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FULL HISTORY TABLE */}
            <section className="bg-white rounded-2xl p-6 border shadow space-y-6">
              <h2 className="font-semibold text-lg">Full History</h2>

              {/* Filters */}
              <div className="grid md:grid-cols-3 gap-4">
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="All">All Subjects</option>
                  <option value="Language">Language</option>
                  <option value="Numeracy">Numeracy</option>
                  <option value="Reading">Reading</option>
                  <option value="Writing">Writing</option>
                </select>

                <input
                  type="text"
                  placeholder="Search test..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                />

                <button
                  onClick={() => {
                    setSubjectFilter("All");
                    setSearch("");
                  }}
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
                >
                  Reset Filters
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th
                        onClick={() => handleSort("subject")}
                        className="px-4 py-3 text-left cursor-pointer"
                      >
                        Subject &udarr;
                      </th>
                      <th className="px-4 text-left">Test</th>
                      <th
                        onClick={() => handleSort("score")}
                        className="px-4 text-left cursor-pointer"
                      >
                        Score &udarr;
                      </th>
                      <th
                        onClick={() => handleSort("date")}
                        className="px-4 text-left cursor-pointer"
                      >
                        Date &udarr;
                      </th>
                      <th className="px-4 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedTests.map((t) => (
                      <tr key={t.id} className="hover:bg-indigo-50 transition">
                        <td className="px-4 py-3">{t.subject}</td>
                        <td className="px-4 truncate max-w-[200px]">{t.name}</td>
                        <td className="px-4 font-semibold">{t.score}%</td>
                        <td className="px-4 text-slate-500">
                          {new Date(t.date).toLocaleDateString()}
                        </td>
                        <td className="px-4">
                          <button
                            onClick={() => handleViewResult(t)}
                            className="text-indigo-600 text-xs hover:underline"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                    {paginatedTests.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          No results match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between text-sm">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-slate-500">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── SUBJECT BADGE ─── */
function SubjectBadge({ subject }) {
  const colors = {
    Language: "bg-blue-100 text-blue-700",
    Numeracy: "bg-emerald-100 text-emerald-700",
    Reading: "bg-purple-100 text-purple-700",
    Writing: "bg-amber-100 text-amber-700",
    Other: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[subject] || colors.Other}`}>
      {subject}
    </span>
  );
}

/* ─── ANIMATED PROGRESS RING ─── */
function AnimatedProgressRing({ percent }) {
  const radius = 60;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(percent), 300);
    return () => clearTimeout(timer);
  }, [percent]);

  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg height={radius * 2} width={radius * 2}>
        <circle
          stroke="#e2e8f0"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="#6366F1"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <p className="text-xl font-bold mt-2">{percent}%</p>
      <p className="text-xs text-slate-500">Overall Average</p>
    </div>
  );
}