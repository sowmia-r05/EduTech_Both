/**
 * AdminDashboard.jsx
 *
 * Main admin panel — lists all quizzes, provides upload UI,
 * and links to per-quiz detail/edit pages.
 *
 * Place in: src/app/components/admin/AdminDashboard.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QuizUploader from "./QuizUploader";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/* ── Tier / Subject badge helpers ── */
function TierBadge({ tier }) {
  const map = {
    A: { label: "Full Tests", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    B: { label: "Topic Std", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    C: { label: "Topic Hard", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  };
  const { label, cls } = map[tier] || { label: tier, cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function SubjectBadge({ subject }) {
  const map = {
    Maths: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Reading: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Writing: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    Conventions: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls = map[subject] || "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {subject}
    </span>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("quizzes"); // quizzes | upload
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [deletingId, setDeletingId] = useState(null);

  // Admin info from localStorage
  const adminInfo = (() => {
    try {
      return JSON.parse(localStorage.getItem("admin_info") || "{}");
    } catch {
      return {};
    }
  })();

  /* ── Fetch quizzes ── */
  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await adminFetch("/api/admin/quizzes");

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_info");
        navigate("/admin");
        return;
      }

      if (!res.ok) throw new Error("Failed to load quizzes");

      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  /* ── Delete quiz ── */
  const handleDelete = async (quizId, quizName) => {
    if (!confirm(`Delete "${quizName}"? This will remove the quiz and unlink all its questions. This cannot be undone.`)) return;

    try {
      setDeletingId(quizId);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }

      setQuizzes((prev) => prev.filter((q) => q.quiz_id !== quizId));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Toggle active status ── */
  const handleToggleActive = async (quiz) => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quiz.quiz_id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !quiz.is_active }),
      });

      if (!res.ok) throw new Error("Update failed");

      setQuizzes((prev) =>
        prev.map((q) =>
          q.quiz_id === quiz.quiz_id ? { ...q, is_active: !q.is_active } : q
        )
      );
    } catch (err) {
      alert(err.message);
    }
  };

  /* ── Logout ── */
  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    navigate("/admin");
  };

  /* ── Filter quizzes ── */
  const filtered = quizzes.filter((q) => {
    if (filterYear !== "all" && q.year_level !== Number(filterYear)) return false;
    if (filterSubject !== "all" && q.subject !== filterSubject) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (q.quiz_name || "").toLowerCase().includes(s) ||
        (q.quiz_id || "").toLowerCase().includes(s) ||
        (q.subject || "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  /* ── Stats ── */
  const totalQuizzes = quizzes.length;
  const activeQuizzes = quizzes.filter((q) => q.is_active !== false).length;
  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.question_count || 0), 0);
  const trialQuizzes = quizzes.filter((q) => q.is_trial).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-white leading-tight">EduTech Admin</h1>
              <p className="text-[11px] text-slate-500">Quiz Management</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {adminInfo.name && (
              <span className="text-xs text-slate-400">
                {adminInfo.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Quizzes", value: totalQuizzes, color: "text-indigo-400" },
            { label: "Active", value: activeQuizzes, color: "text-emerald-400" },
            { label: "Questions", value: totalQuestions, color: "text-blue-400" },
            { label: "Trial / Free", value: trialQuizzes, color: "text-amber-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex items-center gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {[
            { id: "quizzes", label: "All Quizzes" },
            { id: "upload", label: "Upload Quiz" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════
            TAB: UPLOAD
            ═══════════════════════════════════════ */}
        {tab === "upload" && (
          <QuizUploader
            onUploadSuccess={() => {
              setTab("quizzes");
              fetchQuizzes();
            }}
          />
        )}

        {/* ═══════════════════════════════════════
            TAB: QUIZZES LIST
            ═══════════════════════════════════════ */}
        {tab === "quizzes" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <input
                type="text"
                placeholder="Search quizzes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
              />
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Years</option>
                <option value="3">Year 3</option>
                <option value="5">Year 5</option>
                <option value="7">Year 7</option>
                <option value="9">Year 9</option>
              </select>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Subjects</option>
                <option value="Maths">Maths</option>
                <option value="Reading">Reading</option>
                <option value="Writing">Writing</option>
                <option value="Conventions">Conventions</option>
              </select>
              <span className="text-xs text-slate-500 ml-auto">
                {filtered.length} quiz{filtered.length !== 1 ? "zes" : ""}
              </span>
            </div>

            {/* Error State */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  onClick={fetchQuizzes}
                  className="text-xs text-red-300 underline mt-1"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-sm text-slate-400">Loading quizzes...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && filtered.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-medium">
                  {quizzes.length === 0 ? "No quizzes yet" : "No quizzes match your filters"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {quizzes.length === 0
                    ? "Upload your first quiz to get started."
                    : "Try adjusting your search or filters."}
                </p>
                {quizzes.length === 0 && (
                  <button
                    onClick={() => setTab("upload")}
                    className="mt-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Upload Quiz
                  </button>
                )}
              </div>
            )}

            {/* Quiz Table */}
            {!loading && filtered.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Quiz Name
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">
                          Year
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-28">
                          Subject
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-24">
                          Tier
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">
                          Qs
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">
                          Status
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-36">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filtered.map((quiz) => (
                        <tr
                          key={quiz.quiz_id}
                          className="hover:bg-slate-800/30 transition-colors group"
                        >
                          {/* Name */}
                          <td className="px-5 py-3">
                            <button
                              onClick={() => navigate(`/admin/quiz/${quiz.quiz_id}`)}
                              className="text-white font-medium hover:text-indigo-400 transition-colors text-left"
                            >
                              {quiz.quiz_name || "Untitled"}
                            </button>
                            {quiz.is_trial && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                                Trial
                              </span>
                            )}
                          </td>

                          {/* Year */}
                          <td className="px-4 py-3 text-slate-300">
                            Yr {quiz.year_level}
                          </td>

                          {/* Subject */}
                          <td className="px-4 py-3">
                            <SubjectBadge subject={quiz.subject} />
                          </td>

                          {/* Tier */}
                          <td className="px-4 py-3">
                            <TierBadge tier={quiz.tier} />
                          </td>

                          {/* Question Count */}
                          <td className="px-4 py-3 text-center text-slate-400 font-mono text-xs">
                            {quiz.question_count || 0}
                          </td>

                          {/* Active Status */}
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleActive(quiz)}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                                quiz.is_active !== false
                                  ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-slate-700/50 text-slate-500 hover:bg-slate-700"
                              }`}
                            >
                              {quiz.is_active !== false ? "Active" : "Inactive"}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigate(`/admin/quiz/${quiz.quiz_id}`)}
                                className="px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-lg transition-colors"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleDelete(quiz.quiz_id, quiz.quiz_name)}
                                disabled={deletingId === quiz.quiz_id}
                                className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {deletingId === quiz.quiz_id ? "..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
