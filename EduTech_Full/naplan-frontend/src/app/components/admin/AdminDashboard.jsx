/**
 * AdminDashboard.jsx
 * 
 * Main admin panel with:
 *   - Download Excel template
 *   - Upload quiz from Excel
 *   - View/manage existing quizzes
 * 
 * Place in: src/app/components/admin/AdminDashboard.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QuizUploader from "./QuizUploader";

const API = import.meta.env.VITE_API_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

// ─── Stat Card ───
function StatCard({ label, value, icon, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-2xl opacity-60">{icon}</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("quizzes"); // quizzes | upload
  const [error, setError] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch("/api/admin/quizzes");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        navigate("/admin");
        return;
      }
      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : data.quizzes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin");
  };

  const handleDelete = async (quizId) => {
    if (!confirm("Delete this quiz and all its questions? This cannot be undone.")) return;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });
      if (res.ok) fetchQuizzes();
      else {
        const d = await res.json();
        alert(d.error || "Delete failed");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Stats
  const totalQuizzes = quizzes.length;
  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.question_count || 0), 0);
  const yearLevels = [...new Set(quizzes.map((q) => q.year_level))].sort();
  const subjects = [...new Set(quizzes.map((q) => q.subject).filter(Boolean))].sort();

  // Filtered quizzes
  const filtered = quizzes.filter((q) => {
    if (filterYear !== "all" && q.year_level !== Number(filterYear)) return false;
    if (filterSubject !== "all" && q.subject !== filterSubject) return false;
    if (searchQuery && !q.quiz_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">EduTech Admin</span>
          </div>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ─── Stats ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Quizzes" value={totalQuizzes} icon="📝" color="indigo" />
          <StatCard label="Total Questions" value={totalQuestions} icon="❓" color="emerald" />
          <StatCard label="Year Levels" value={yearLevels.length} icon="🎓" color="amber" />
          <StatCard label="Subjects" value={subjects.length} icon="📚" color="rose" />
        </div>

        {/* ─── Tab Bar ─── */}
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 w-fit">
          {[
            { id: "quizzes", label: "Manage Quizzes", icon: "📋" },
            { id: "upload", label: "Upload Quiz", icon: "📤" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* ─── Tab Content ─── */}
        {tab === "upload" ? (
          <QuizUploader onUploadSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Search quizzes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white
                           placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Years</option>
                {[3, 5, 7, 9].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Subjects</option>
                {["Maths", "Reading", "Writing", "Conventions"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Quiz Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-lg">No quizzes found</p>
                <p className="text-sm mt-1">Upload your first quiz using the Upload tab above.</p>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Quiz Name</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Year</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Subject</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Tier</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Questions</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Points</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.map((quiz) => (
                      <tr key={quiz.quiz_id || quiz._id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-white">{quiz.quiz_name}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Yr {quiz.year_level}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-300">{quiz.subject || "—"}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400">
                            {quiz.tier || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-300">{quiz.question_count || 0}</td>
                        <td className="px-5 py-3.5 text-slate-300">{quiz.total_points || 0}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            quiz.is_active !== false
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                          }`}>
                            {quiz.is_active !== false ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => handleDelete(quiz.quiz_id || quiz._id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
