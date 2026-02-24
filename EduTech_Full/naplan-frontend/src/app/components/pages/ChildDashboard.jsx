import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";

/* ---------------- MOCK DATA ---------------- */
const tests = Array.from({ length: 42 }).map((_, i) => ({
  id: i + 1,
  subject: ["Language", "Numeracy", "Reading", "Writing"][i % 4],
  name: `Test ${i + 1}`,
  score: Math.floor(Math.random() * 40) + 60,
  difficulty: ["Easy", "Medium", "Hard"][i % 3],
  date: new Date(2024, 4, (i % 28) + 1).toISOString(),
}));

export default function ChildDashboard() {
  const navigate = useNavigate();

  /* ---------------- STATE ---------------- */
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "date",
    direction: "desc",
  });

  const testsPerPage = 8;

  /* ---------------- CALCULATIONS ---------------- */

  const overallAverage = useMemo(() => {
    return Math.round(
      tests.reduce((sum, t) => sum + t.score, 0) / tests.length
    );
  }, []);

  const totalXP = useMemo(() => {
    return tests.reduce((sum, t) => sum + t.score * 10, 0);
  }, []);

  const level = Math.floor(totalXP / 2000) + 1;
  const xpProgress = (totalXP % 2000) / 20;

  const streak = useMemo(() => {
    const sorted = [...tests].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date);
      const curr = new Date(sorted[i].date);
      const diff =
        (prev - curr) / (1000 * 60 * 60 * 24);

      if (diff === 1) count++;
      else break;
    }
    return count;
  }, []);

  /* ---------------- CONFETTI ---------------- */
  useEffect(() => {
    if (tests.some((t) => t.score >= 90)) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
    }
  }, []);

  /* ---------------- TABLE FILTER ---------------- */

  const filteredData = useMemo(() => {
    let data = [...tests];

    if (subjectFilter !== "All")
      data = data.filter((t) => t.subject === subjectFilter);

    if (difficultyFilter !== "All")
      data = data.filter((t) => t.difficulty === difficultyFilter);

    if (search.trim())
      data = data.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
      );

    return data;
  }, [subjectFilter, difficultyFilter, search]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];

    sorted.sort((a, b) => {
      if (sortConfig.key === "date") {
        return sortConfig.direction === "asc"
          ? new Date(a.date) - new Date(b.date)
          : new Date(b.date) - new Date(a.date);
      }

      if (sortConfig.key === "score") {
        return sortConfig.direction === "asc"
          ? a.score - b.score
          : b.score - a.score;
      }

      if (sortConfig.key === "subject") {
        return sortConfig.direction === "asc"
          ? a.subject.localeCompare(b.subject)
          : b.subject.localeCompare(a.subject);
      }

      return 0;
    });

    return sorted;
  }, [filteredData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / testsPerPage);

  const paginatedTests = useMemo(() => {
    const start = (currentPage - 1) * testsPerPage;
    return sortedData.slice(start, start + testsPerPage);
  }, [sortedData, currentPage]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  /* ---------------- RECENT ---------------- */
  const recentActivity = useMemo(() => {
    return [...tests]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4);
  }, []);

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-screen-2xl mx-auto px-8 py-8 space-y-10">

        {/* NAVBAR */}
        <header className="flex justify-between items-center">
          <button
            onClick={() => navigate("/main")}
            className="text-indigo-600 font-medium hover:underline"
          >
            ← Back to Main Menu
          </button>

          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
              P
            </div>
            <button
              onClick={() => navigate("/logout")}
              className="text-sm text-rose-600 hover:underline"
            >
              Logout
            </button>
          </div>
        </header>

        {/* HERO */}
        <section className="bg-white rounded-3xl p-8 shadow-lg border flex flex-col lg:flex-row justify-between items-center gap-8">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome Back, Prath 👋
            </h1>
            <p className="text-slate-500 mt-1">
              Level {level} Learner ⭐
            </p>
            <p className="text-indigo-600 mt-2 font-medium">
              🔥 {streak} Day Streak
            </p>

            <div className="mt-4 w-64 h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              XP Progress
            </p>
          </div>

          <AnimatedProgressRing percent={overallAverage} />
        </section>

        {/* RECENT */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Recent Activity
          </h2>
          <div className="grid md:grid-cols-4 gap-4">
            {recentActivity.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl p-4 border shadow hover:shadow-xl transition">
                <p className="text-sm text-slate-500">{t.subject}</p>
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-slate-400">
                  {new Date(t.date).toLocaleDateString()}
                </p>
                <div className="mt-2 flex justify-between items-center">
                  <DifficultyBadge level={t.difficulty} />
                  <span className="font-bold">{t.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TABLE */}
        <section className="bg-white rounded-2xl p-6 border shadow space-y-6">
          <h2 className="font-semibold text-lg">Full History</h2>

          {/* Filters */}
          <div className="grid md:grid-cols-4 gap-4">
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="All">All Subjects</option>
              <option value="Language">Language</option>
              <option value="Numeracy">Numeracy</option>
              <option value="Reading">Reading</option>
              <option value="Writing">Writing</option>
            </select>

            <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="All">All Difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
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
                setDifficultyFilter("All");
                setSearch("");
              }}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
            >
              Reset Filters
            </button>
          </div>

          {/* Table */}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th onClick={() => handleSort("subject")} className="px-4 py-3 text-left cursor-pointer">Subject ⬍</th>
                <th className="px-4 text-left">Test</th>
                <th onClick={() => handleSort("score")} className="px-4 text-left cursor-pointer">Score ⬍</th>
                <th className="px-4 text-left">Difficulty</th>
                <th onClick={() => handleSort("date")} className="px-4 text-left cursor-pointer">Date ⬍</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedTests.map((t) => (
                <tr key={t.id} className="hover:bg-indigo-50 transition">
                  <td className="px-4 py-3">{t.subject}</td>
                  <td className="px-4">{t.name}</td>
                  <td className="px-4 font-semibold">{t.score}%</td>
                  <td className="px-4"><DifficultyBadge level={t.difficulty} /></td>
                  <td className="px-4 text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex justify-between text-sm">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </section>

      </div>
    </div>
  );
}

/* BADGE */
function DifficultyBadge({ level }) {
  const colors = {
    Easy: "bg-emerald-100 text-emerald-700",
    Medium: "bg-amber-100 text-amber-700",
    Hard: "bg-rose-100 text-rose-700",
  };
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[level]}`}>{level}</span>;
}

/* ANIMATED PROGRESS RING */
function AnimatedProgressRing({ percent }) {
  const radius = 60;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setTimeout(() => setProgress(percent), 300);
  }, [percent]);

  const strokeDashoffset =
    circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg height={radius * 2} width={radius * 2}>
        <circle stroke="#e2e8f0" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
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
    </div>
  );
}