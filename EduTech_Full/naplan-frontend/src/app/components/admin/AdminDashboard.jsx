/**
 * AdminDashboard.jsx
 *
 * Full admin panel:
 *   - Quiz list with search/filter
 *   - FlexiQuiz-style quiz settings (time limit, difficulty, passing score, etc.)
 *   - Bundle mapping (assign quizzes → bundles so purchases unlock them)
 *   - Upload tab (QuizUploader)
 *   - Bundle management tab
 *   ✅ Randomize questions/options + Voice & Video settings
 *
 * Place in: src/app/components/admin/AdminDashboard.jsx
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import QuizUploader from "./QuizUploader";
import BundlesTab from "./BundlesTab";
import QuizSettingsExtras from "./QuizSettingsExtras";
import ManualQuizCreator from "./ManualQuizCreator";


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

/* ════════════════════════════════════════════════════════
   HELPER BADGES
   ════════════════════════════════════════════════════════ */
function TierBadge({ tier }) {
  const map = {
    A: { label: "A — Full Tests", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    B: { label: "B — Topic Std", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    C: { label: "C — Topic Hard", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    Trial: { label: "Trial — Free", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  };
  const { label, cls } = map[tier] || { label: tier, cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{label}</span>;
}

function SubjectBadge({ subject }) {
  const map = {
    Maths: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Reading: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Writing: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    Conventions: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls = map[subject] || "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{subject}</span>;
}

function DifficultyBadge({ difficulty }) {
  if (!difficulty) return <span className="text-[10px] text-slate-500">—</span>;
  const map = {
    easy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    hard: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const cls = map[difficulty] || "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border capitalize ${cls}`}>{difficulty}</span>;
}


/* ════════════════════════════════════════════════════════
   QUIZ SETTINGS MODAL (FlexiQuiz-style)
   ════════════════════════════════════════════════════════ */
function QuizSettingsModal({ quiz, onSave, onClose }) {
  const [form, setForm] = useState({
    quiz_name: quiz.quiz_name || "",
    year_level: quiz.year_level || 3,
    subject: quiz.subject || "",
    tier: quiz.tier || "A",
    difficulty: quiz.difficulty || "",
    time_limit_minutes: quiz.time_limit_minutes ?? "",
    set_number: quiz.set_number || 1,
    is_active: quiz.is_active !== false,
    is_trial: quiz.is_trial || false,
    randomize_questions: quiz.randomize_questions || false,
    randomize_options: quiz.randomize_options || false,
    voice_url: quiz.voice_url || null,
    video_url: quiz.video_url || null,
    max_attempts: quiz.max_attempts ?? null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quiz.quiz_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          time_limit_minutes: form.time_limit_minutes === "" ? null : Number(form.time_limit_minutes),
          year_level: Number(form.year_level),
          set_number: Number(form.set_number) || 1,
          difficulty: form.difficulty || null,
          voice_url: form.voice_url || null,
          video_url: form.video_url || null,
          max_attempts: form.max_attempts,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      onSave();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  };

  const u = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const uCheck = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.checked }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">Quiz Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Quiz Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Quiz Name</label>
            <input type="text" value={form.quiz_name} onChange={u("quiz_name")}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Time Limit + Difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Time Limit (minutes)</label>
              <input type="number" min="0" placeholder="No limit" value={form.time_limit_minutes} onChange={u("time_limit_minutes")}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-[10px] text-slate-500 mt-1">Leave empty = unlimited time</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Difficulty</label>
              <select value={form.difficulty} onChange={u("difficulty")}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Auto / Not set</option>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={uCheck("is_active")}
                className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_trial} onChange={uCheck("is_trial")}
                className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500" />
              <span className="text-sm text-slate-300">Free Trial Quiz</span>
            </label>
          </div>

          {/* ✅ Retakes + Randomization + Voice & Video */}
          <QuizSettingsExtras form={form} onChange={setForm} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════
   BUNDLE MAPPING MODAL
   ════════════════════════════════════════════════════════ */
function BundleMappingModal({ quiz, bundles, onClose, onRefresh }) {
  const [saving, setSaving] = useState(null);

  const matchingBundles = bundles.filter((b) => b.year_level === quiz.year_level && b.tier === quiz.tier);
  const otherBundles = bundles.filter((b) => !(b.year_level === quiz.year_level && b.tier === quiz.tier));

  const isQuizInBundle = (bundle) => {
    const ids = bundle.quiz_ids || [];
    return ids.includes(quiz.quiz_id);
  };

  const handleToggle = async (bundle) => {
    const inBundle = isQuizInBundle(bundle);
    setSaving(bundle.bundle_id);
    try {
      const res = await adminFetch(`/api/admin/bundles/${bundle.bundle_id}/quizzes`, {
        method: inBundle ? "DELETE" : "POST",
        body: JSON.stringify({ quiz_id: quiz.quiz_id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
    setSaving(null);
  };

  const renderRow = (bundle) => {
    const inBundle = isQuizInBundle(bundle);
    const count = (bundle.quiz_ids || []).length;
    return (
      <div key={bundle.bundle_id}
        className={`flex items-center justify-between p-3 rounded-lg border transition ${
          inBundle ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
        }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{bundle.bundle_name}</span>
            <TierBadge tier={bundle.tier} />
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Year {bundle.year_level} • {count} quiz{count !== 1 ? "zes" : ""} • ${(bundle.price_cents / 100).toFixed(2)} AUD
          </p>
        </div>
        <button onClick={() => handleToggle(bundle)} disabled={saving === bundle.bundle_id}
          className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
            inBundle
              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
          } disabled:opacity-40`}>
          {saving === bundle.bundle_id ? "..." : inBundle ? "Remove" : "Add to Bundle"}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Bundle Mapping</h2>
            <p className="text-xs text-slate-500 mt-0.5">Assign "{quiz.quiz_name}" to purchasable bundles</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Trial / Free Access Toggle */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-cyan-400 font-semibold mb-2">
              Trial / Free Access
            </p>
            <div className={`flex items-center justify-between p-3 rounded-lg border transition ${
              quiz.is_trial ? "bg-cyan-500/5 border-cyan-500/20" : "bg-slate-800/50 border-slate-700/50"
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Free Trial</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">Trial — Free</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Available to all users without purchase — great for samples
                </p>
              </div>
              <button
                onClick={async () => {
                  setSaving("trial");
                  try {
                    const res = await adminFetch(`/api/admin/quizzes/${quiz.quiz_id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ is_trial: !quiz.is_trial }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    quiz.is_trial = !quiz.is_trial;
                    onRefresh();
                  } catch (err) { alert(err.message); }
                  setSaving(null);
                }}
                disabled={saving === "trial"}
                className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  quiz.is_trial
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                    : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
                } disabled:opacity-40`}>
                {saving === "trial" ? "..." : quiz.is_trial ? "Remove Trial" : "Make Trial"}
              </button>
            </div>
          </div>

          {/* Paid Bundles */}
          {matchingBundles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-emerald-400 font-semibold mb-2">
                Recommended (Year {quiz.year_level}, Tier {quiz.tier})
              </p>
              <div className="space-y-2">{matchingBundles.map(renderRow)}</div>
            </div>
          )}
          {otherBundles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Other Bundles</p>
              <div className="space-y-2">{otherBundles.map(renderRow)}</div>
            </div>
          )}
          {bundles.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              No bundles found. Run <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded">node scripts/seedBundles.js</code> to create bundles.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Done</button>
        </div>
      </div>
    </div>
  );
}



/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("quizzes");
  const [quizzes, setQuizzes] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [deletingId, setDeletingId] = useState(null);
  const [settingsQuiz, setSettingsQuiz] = useState(null);
  const [bundleMapQuiz, setBundleMapQuiz] = useState(null);

  const adminInfo = (() => {
    try { return JSON.parse(localStorage.getItem("admin_info") || "{}"); } catch { return {}; }
  })();

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await adminFetch("/api/admin/quizzes");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token"); localStorage.removeItem("admin_info"); navigate("/admin"); return;
      }
      if (!res.ok) throw new Error("Failed to load quizzes");
      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); setError(err.message); }
    finally { setLoading(false); }
  }, [navigate]);

  const fetchBundles = useCallback(async () => {
    try {
      setBundlesLoading(true);
      const res = await adminFetch("/api/admin/bundles");
      if (res.ok) { const data = await res.json(); setBundles(Array.isArray(data) ? data : []); }
    } catch (err) { console.error("Bundles:", err); }
    finally { setBundlesLoading(false); }
  }, []);

  useEffect(() => { fetchQuizzes(); fetchBundles(); }, [fetchQuizzes, fetchBundles]);

  const handleDelete = async (quizId, quizName) => {
    if (!confirm(`Delete "${quizName}"?\nThis cannot be undone.`)) return;
    try {
      setDeletingId(quizId);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Delete failed"); }
      setQuizzes((prev) => prev.filter((q) => q.quiz_id !== quizId));
    } catch (err) { alert(err.message); }
    finally { setDeletingId(null); }
  };

  const handleToggleActive = async (quiz) => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quiz.quiz_id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !quiz.is_active }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuizzes((prev) => prev.map((q) => q.quiz_id === quiz.quiz_id ? { ...q, is_active: !q.is_active } : q));
    } catch (err) { alert(err.message); }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token"); localStorage.removeItem("admin_info"); navigate("/admin");
  };

  const filtered = useMemo(() => quizzes.filter((q) => {
    if (filterYear !== "all" && q.year_level !== Number(filterYear)) return false;
    if (filterSubject !== "all" && q.subject !== filterSubject) return false;
    if (search) {
      const s = search.toLowerCase();
      return (q.quiz_name || "").toLowerCase().includes(s) || (q.subject || "").toLowerCase().includes(s);
    }
    return true;
  }), [quizzes, filterYear, filterSubject, search]);

  const totalQuizzes = quizzes.length;
  const activeQuizzes = quizzes.filter((q) => q.is_active !== false).length;
  const totalQuestions = quizzes.reduce((s, q) => s + (q.question_count || 0), 0);
  const trialQuizzes = quizzes.filter((q) => q.is_trial).length;
  const activeBundles = bundles.filter((b) => b.is_active).length;

  const getBundlesForQuiz = (quizId) => bundles.filter((b) => (b.quiz_ids || []).includes(quizId));

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Bar */}
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
            {adminInfo.name && <span className="text-xs text-slate-400">{adminInfo.name}</span>}
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Quizzes", value: totalQuizzes, color: "text-indigo-400" },
            { label: "Active", value: activeQuizzes, color: "text-emerald-400" },
            { label: "Questions", value: totalQuestions, color: "text-blue-400" },
            { label: "Trial / Free", value: trialQuizzes, color: "text-amber-400" },
            { label: "Bundles", value: activeBundles, color: "text-purple-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {[
            { id: "quizzes", label: "All Quizzes" },
            { id: "upload", label: "Upload Quiz" },
            { id: "create", label: "✚ Create Quiz" },
            { id: "bundles", label: "Bundles" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "upload" && <QuizUploader onUploadSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />}
        {tab === "create" && <ManualQuizCreator isOpen={true} onClose={() => setTab("quizzes")} onSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />}
        {tab === "bundles" && <BundlesTab bundles={bundles} loading={bundlesLoading} quizzes={quizzes} onRefresh={fetchBundles} />}
        {tab === "quizzes" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <input type="text" placeholder="Search quizzes..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Years</option><option value="3">Year 3</option><option value="5">Year 5</option>
                <option value="7">Year 7</option><option value="9">Year 9</option>
              </select>
              <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Subjects</option><option value="Maths">Maths</option><option value="Reading">Reading</option>
                <option value="Writing">Writing</option><option value="Conventions">Conventions</option>
              </select>
              <span className="text-xs text-slate-500 ml-auto">{filtered.length} quiz{filtered.length !== 1 ? "zes" : ""}</span>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={fetchQuizzes} className="text-xs text-red-300 underline mt-1">Retry</button>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-sm text-slate-400">Loading quizzes...</p>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-400 font-medium">{quizzes.length === 0 ? "No quizzes yet" : "No matches"}</p>
                {quizzes.length === 0 && (
                  <button onClick={() => setTab("upload")} className="mt-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Upload Quiz</button>
                )}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Quiz Name</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">Year</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-24">Subject</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-28">Tier</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">Diff.</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-12">Qs</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">Time</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">Status</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">Bundle</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-48">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filtered.map((quiz) => {
                        const qBundles = getBundlesForQuiz(quiz.quiz_id);
                        return (
                          <tr key={quiz.quiz_id} className="hover:bg-slate-800/30 transition-colors group">
                            <td className="px-5 py-3">
                              <button onClick={() => navigate(`/admin/quiz/${quiz.quiz_id}`)}
                                className="text-white font-medium hover:text-indigo-400 transition-colors text-left">
                                {quiz.quiz_name || "Untitled"}
                              </button>
                              {quiz.is_trial && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">Trial</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-slate-300 text-xs">Yr {quiz.year_level}</td>
                            <td className="px-3 py-3"><SubjectBadge subject={quiz.subject} /></td>
                            <td className="px-3 py-3"><TierBadge tier={quiz.tier} /></td>
                            <td className="px-3 py-3"><DifficultyBadge difficulty={quiz.difficulty} /></td>
                            <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{quiz.question_count || 0}</td>
                            <td className="px-3 py-3 text-center text-xs">
                              {quiz.time_limit_minutes
                                ? <span className="text-amber-400">{quiz.time_limit_minutes}m</span>
                                : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button onClick={() => handleToggleActive(quiz)}
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                  quiz.is_active !== false
                                    ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                    : "bg-slate-700/50 text-slate-500 hover:bg-slate-700"
                                }`}>
                                {quiz.is_active !== false ? "Active" : "Off"}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button onClick={() => setBundleMapQuiz(quiz)}
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                  qBundles.length > 0
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20"
                                    : "text-slate-600 hover:text-slate-400"
                                }`}>
                                {qBundles.length > 0 ? `${qBundles.length}` : "+ Map"}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => navigate(`/admin/quiz/${quiz.quiz_id}`)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-lg transition-colors">View</button>
                                <button onClick={() => setSettingsQuiz(quiz)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Settings">⚙</button>
                                <button onClick={() => setBundleMapQuiz(quiz)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-purple-400 hover:text-white hover:bg-purple-600/20 rounded-lg transition-colors" title="Bundle">📦</button>
                                <button onClick={() => handleDelete(quiz.quiz_id, quiz.quiz_name)} disabled={deletingId === quiz.quiz_id}
                                  className="px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-40">
                                  {deletingId === quiz.quiz_id ? "..." : "Del"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {settingsQuiz && <QuizSettingsModal quiz={settingsQuiz} onSave={() => { setSettingsQuiz(null); fetchQuizzes(); }} onClose={() => setSettingsQuiz(null)} />}
      {bundleMapQuiz && <BundleMappingModal quiz={bundleMapQuiz} bundles={bundles} onClose={() => setBundleMapQuiz(null)} onRefresh={fetchBundles} />}
    </div>
  );
}