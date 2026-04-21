// AdminDashboard.jsx — v6 VERIFICATION SUMMARY
//
// CHANGES FROM v5:
//   ✅ Added VerificationSummaryBadge component
//   ✅ Added verificationSummary state + fetchVerificationSummary()
//   ✅ Added "Verified" column to quiz table showing X✓ | Y✗ | Z⋯ per quiz
//   ✅ fetchVerificationSummary called on mount alongside fetchQuizzes/fetchBundles

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import QuizUploader       from "./QuizUploader";
import BundlesTab         from "./BundlesTab";
import TutorsTab          from "./Tutorstab";
import QuizSettingsExtras from "./QuizSettingsExtras";
import ManualQuizCreator  from "./ManualQuizCreator";
import AssignTutorsModal  from "./AssignTutorsModal";
import { ADMIN_PATH }     from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ════════════════════════════════════════════════════════
// INVITE MODAL (super_admin only)
// ════════════════════════════════════════════════════════
function InviteModal({ onClose }) {
  const [loading,   setLoading]   = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied,    setCopied]    = useState(false);
  const [error,     setError]     = useState("");

  const generateInvite = async () => {
    try {
      setLoading(true); setError("");
      const res  = await adminFetch("/api/admin/invite", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate invite");
      setInviteUrl(data.invite_url);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Invite Admin</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!inviteUrl ? (
          <button onClick={generateInvite} disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {loading ? "Generating..." : "Generate Invite Link"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg px-4 py-3 text-xs text-slate-300 break-all">{inviteUrl}</div>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
                {copied ? "✓ Copied!" : "Copy Link"}
              </button>
              <button onClick={generateInvite} disabled={loading}
                className="px-4 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition disabled:opacity-50">
                New Link
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              <p className="text-amber-400 text-xs">⚠️ This link is single-use and expires in 24 hours.</p>
            </div>
          </div>
        )}
        <button onClick={onClose} className="w-full text-sm text-slate-500 hover:text-slate-300 transition pt-1">Close</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DIFFICULTY BADGE
// ════════════════════════════════════════════════════════
function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const map = {
    easy:     { label: "Easy",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    Easy:     { label: "Easy",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    medium:   { label: "Medium",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20"       },
    Medium:   { label: "Medium",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20"       },
    Standard: { label: "Standard", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20"       },
    hard:     { label: "Hard",     cls: "bg-rose-500/10 text-rose-400 border-rose-500/20"          },
    Hard:     { label: "Hard",     cls: "bg-rose-500/10 text-rose-400 border-rose-500/20"          },
  };
  const { label, cls } = map[difficulty] || { label: difficulty, cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ════════════════════════════════════════════════════════
// TIER BADGE
// ════════════════════════════════════════════════════════
function TierBadge({ tier }) {
  const map = {
    A:     { label: "A — Full Tests", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    B:     { label: "B — Topic Std",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20"   },
    C:     { label: "C — Topic Hard", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20"      },
    Trial: { label: "Trial — Free",   cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"      },
  };
  const { label, cls } = map[tier] || { label: tier, cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{label}</span>;
}

// ════════════════════════════════════════════════════════
// ✅ NEW: VERIFICATION SUMMARY BADGE
// Shows per-quiz approved / rejected / pending counts in the table
// ════════════════════════════════════════════════════════
function VerificationSummaryBadge({ stats }) {
  if (!stats) {
    return <span className="text-[10px] text-slate-600">—</span>;
  }

  const { approved = 0, rejected = 0, pending = 0, total = 0 } = stats;
  const allApproved = approved === total && total > 0;
  const hasRejected = rejected > 0;

  return (
    <div className="flex items-center justify-center gap-1.5">
      {/* Approved */}
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${allApproved ? "text-emerald-400" : "text-slate-400"}`}>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {approved}
      </span>

      <span className="text-slate-700 text-[10px]">/</span>
      <span className="text-[11px] text-slate-500">{total}</span>

      {/* Rejected count — only shown if any */}
      {hasRejected && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400 ml-0.5">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {rejected}
        </span>
      )}

      {/* Green dot when fully verified */}
      {allApproved && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="All questions verified" />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// QUIZ SETTINGS MODAL
// ════════════════════════════════════════════════════════
function QuizSettingsModal({ quiz, onSave, onClose }) {
  const [form, setForm] = useState({
    quiz_name:           quiz.quiz_name           || "",
    year_level:          quiz.year_level           || 3,
    subject:             quiz.subject              || "",
    tier:                quiz.tier                 || "A",
    difficulty:          quiz.difficulty           || "",
    time_limit_minutes:  quiz.time_limit_minutes   ?? "",
    set_number:          quiz.set_number           || 1,
    is_active:           quiz.is_active            !== false,
    is_trial:            quiz.is_trial             || false,
    randomize_questions: quiz.randomize_questions  || false,
    randomize_options:   quiz.randomize_options    || false,
    voice_url:           quiz.voice_url            || null,
    video_url:           quiz.video_url            || null,
    attempts_enabled:    quiz.attempts_enabled     ?? (quiz.max_attempts !== 1 && quiz.max_attempts != null),
    max_attempts:        quiz.max_attempts         ?? "",
    passing_score:       quiz.passing_score        ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const quizId = quiz.quiz_id || quiz._id;

  const handleSave = async () => {
    try {
      setSaving(true); setError("");
      const payload = {
        ...form,
        time_limit_minutes: form.time_limit_minutes === "" ? null : Number(form.time_limit_minutes),
        max_attempts: form.max_attempts === "" || form.max_attempts === null
          ? (form.attempts_enabled ? null : 1)
          : Number(form.max_attempts),
        passing_score: form.passing_score === "" ? null : Number(form.passing_score),
        difficulty: form.difficulty || null,
      };
      const res  = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body:   JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSave(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExtrasChange = (updater) => {
    setForm((prev) =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater }
    );
  };

  const tf = (field) => (e) =>
    setForm((p) => ({
      ...p,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Quiz Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">{quiz.quiz_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Quiz Name */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Quiz Name</label>
          <input type="text" value={form.quiz_name} onChange={tf("quiz_name")}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
          <select value={form.subject} onChange={tf("subject")}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— None —</option>
            <option value="Maths">Maths</option>
            <option value="Reading">Reading</option>
            <option value="Writing">Writing</option>
            <option value="Language conventions">Language conventions</option>
          </select>
        </div>

        {/* Year + Difficulty */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Year Level", field: "year_level", opts: [3, 5, 7, 9] },
            { label: "Difficulty", field: "difficulty", opts: ["", "Easy", "Standard", "Hard"] },
          ].map(({ label, field, opts }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
              <select value={form[field]} onChange={tf(field)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {opts.map((o) => <option key={o} value={o}>{o || "— None —"}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Time Limit */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Time Limit (min)</label>
          <input type="number" value={form.time_limit_minutes} onChange={tf("time_limit_minutes")} placeholder="No limit"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* ✅ QuizSettingsExtras — ONCE ONLY */}
        <QuizSettingsExtras form={form} onChange={setForm} />

        {/* ✅ Checkboxes — ONCE ONLY */}
        <div className="space-y-2 pt-2">
          {[
            { label: "Active",               field: "is_active"           },
            { label: "Trial (free access)",  field: "is_trial"            },
            { label: "Randomize Questions",  field: "randomize_questions" },
            { label: "Randomize Options",    field: "randomize_options"   },
          ].map(({ label, field }) => (
            <label key={field} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form[field]} onChange={tf(field)}
                className="w-4 h-4 rounded accent-indigo-500" />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// BUNDLE MAPPING MODAL
// ════════════════════════════════════════════════════════
function BundleMappingModal({ quiz, bundles, onClose, onRefresh }) {
  const quizId = quiz.quiz_id || quiz._id;

  const assignedBundleIds = bundles
    .filter((b) => (b.quiz_ids || []).includes(quizId))
    .map((b) => b.bundle_id);

  const [saving,   setSaving]   = useState(false);
  const [selected, setSelected] = useState(new Set(assignedBundleIds));
  const [error, setError] = useState("");


  const toggle = (bundleId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(bundleId) ? next.delete(bundleId) : next.add(bundleId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const toAdd    = [...selected].filter((id) => !assignedBundleIds.includes(id));
      const toRemove = assignedBundleIds.filter((id) => !selected.has(id));
      const results = await Promise.all([
        ...toAdd.map((bundleId) =>
          adminFetch(`/api/admin/bundles/${bundleId}/quizzes`, {
            method: "POST", body: JSON.stringify({ quiz_id: quizId }),
          })
        ),
        ...toRemove.map((bundleId) =>
          adminFetch(`/api/admin/bundles/${bundleId}/quizzes`, {
            method: "DELETE", body: JSON.stringify({ quiz_id: quizId }),
          })
        ),
      ]);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const d = await failed.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update bundle mapping");
      }
      await onRefresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
};

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Bundle Mapping</h2>
            <p className="text-xs text-slate-500 mt-0.5">{quiz.quiz_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 max-h-80 overflow-y-auto space-y-2">
          {bundles.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">No bundles yet.</p>
          ) : bundles.map((b) => (
            <label key={b.bundle_id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 cursor-pointer hover:bg-slate-750">
              <input type="checkbox" checked={selected.has(b.bundle_id)} onChange={() => toggle(b.bundle_id)}
                className="w-4 h-4 rounded accent-indigo-500" />
              <div>
                <p className="text-sm text-white font-medium">{b.bundle_name}</p>
                <p className="text-xs text-slate-500">{b.quiz_count || 0} quizzes · Year {b.year_level}</p>
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-red-400 text-sm px-6 pt-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [tab,                  setTab]                  = useState("quizzes");
  const [quizzes,              setQuizzes]              = useState([]);
  const [bundles,              setBundles]              = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [bundlesLoading,       setBundlesLoading]       = useState(true);
  const [error,                setError]                = useState("");
  const [search,               setSearch]               = useState(() => localStorage.getItem("aq_search")        || "");
  const [filterYear,           setFilterYear]           = useState(() => localStorage.getItem("aq_filterYear")    || "all");
  const [filterSubject,        setFilterSubject]        = useState(() => localStorage.getItem("aq_filterSubject") || "all");
  const [deletingId,           setDeletingId]           = useState(null);
  const [settingsQuiz,         setSettingsQuiz]         = useState(null);
  const [bundleMapQuiz,        setBundleMapQuiz]        = useState(null);
  const [assignTutorsQuiz,     setAssignTutorsQuiz]     = useState(null);
  const [showInvite,           setShowInvite]           = useState(false);
  // ✅ NEW: verification summary map { [quiz_id]: { approved, rejected, pending, total } }
  const [verificationSummary,  setVerificationSummary]  = useState({});

  const adminInfo = (() => {
    try { return JSON.parse(localStorage.getItem("admin_info") || "{}"); } catch { return {}; }
  })();

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await adminFetch("/api/admin/quizzes");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_info");
        navigate(ADMIN_PATH);
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

  const fetchBundles = useCallback(async () => {
    try {
      setBundlesLoading(true);
      const res = await adminFetch("/api/admin/bundles");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_info");
        navigate(ADMIN_PATH);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBundles(Array.isArray(data) ? data : []);
      } else {
        console.error("Failed to load bundles:", res.status);
      }
    } catch (err) {
      console.error("Bundles:", err);
    } finally {
      setBundlesLoading(false);
    }
  }, [navigate]);

  // ✅ NEW: fetch verification summary
  const fetchVerificationSummary = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/verification-summary");
      if (res.ok) {
        const data = await res.json();
        setVerificationSummary(data.summary || {});
      }
    } catch (err) {
      console.error("Verification summary:", err);
    }
  }, []);

  // ✅ All three fetched on mount
  useEffect(() => {
    fetchQuizzes();
    fetchBundles();
    fetchVerificationSummary();
  }, [fetchQuizzes, fetchBundles, fetchVerificationSummary]);
  useEffect(() => {
  const interval = setInterval(() => {
    fetchQuizzes();
    fetchVerificationSummary();
  }, 60000);
  return () => clearInterval(interval);
}, [fetchQuizzes, fetchVerificationSummary]);
  useEffect(() => { localStorage.setItem("aq_search",        search);        }, [search]);
  useEffect(() => { localStorage.setItem("aq_filterYear",    filterYear);    }, [filterYear]);
  useEffect(() => { localStorage.setItem("aq_filterSubject", filterSubject); }, [filterSubject]);

  const handleDelete = async (quizId, quizName) => {
    if (!confirm(`Delete "${quizName}"?\nThis cannot be undone.`)) return;
    try {
      setDeletingId(quizId);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Delete failed"); }
      setQuizzes((prev) => prev.filter((q) => (q.quiz_id || q._id) !== quizId));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdminVerify = async (quiz) => {
    const quizId = quiz.quiz_id || quiz._id;
    const newVal = !quiz.admin_verified;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          admin_verified:    newVal,
          admin_verified_by: newVal ? adminInfo.email : null,
          admin_verified_at: newVal ? new Date().toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuizzes((prev) => prev.map((q) =>
        (q.quiz_id || q._id) === quizId
          ? { ...q, admin_verified: newVal, admin_verified_by: adminInfo.email }
          : q
      ));
    } catch (err) { alert(err.message); }
  };

  const handleToggleActive = async (quiz) => {
    const quizId = quiz.quiz_id || quiz._id;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !quiz.is_active }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuizzes((prev) => prev.map((q) =>
        (q.quiz_id || q._id) === quizId ? { ...q, is_active: !q.is_active } : q
      ));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    try { await adminFetch("/api/admin/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    navigate(ADMIN_PATH);
  };

  const filtered = useMemo(() => quizzes.filter((q) => {
  if (filterYear !== "all" && String(q.year_level) !== String(filterYear)) return false;
  if (filterSubject !== "all" && (q.subject || "").trim().toLowerCase() !== filterSubject.trim().toLowerCase()) return false;
  if (search) {
    const s = search.toLowerCase();
    if (!(q.quiz_name || "").toLowerCase().includes(s)) return false;
  }
  return true;
}), [quizzes, filterYear, filterSubject, search]);

  const totalQuizzes   = quizzes.length;
  const activeQuizzes  = quizzes.filter((q) => q.is_active === true).length;
  const totalQuestions = quizzes.reduce((s, q) => s + (q.question_count || 0), 0);
  const trialQuizzes   = quizzes.filter((q) => q.is_trial).length;
  const activeBundles  = bundles.filter((b) => b.is_active).length;
  const getBundlesForQuiz = (quizId) => bundles.filter((b) => (b.quiz_ids || []).includes(quizId));

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span className="text-base font-semibold text-white">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {adminInfo.role === "admin" && (
              <button onClick={() => setShowInvite(true)}
                className="px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-white border border-indigo-500/30 hover:bg-indigo-600 rounded-lg transition">
                + Invite Admin
              </button>
            )}
            <span className="text-xs text-slate-500">{adminInfo.email || ""}</span>
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Quizzes", value: totalQuizzes,   color: "text-indigo-400"  },
            { label: "Active",        value: activeQuizzes,  color: "text-emerald-400" },
            { label: "Questions",     value: totalQuestions, color: "text-blue-400"    },
            { label: "Trial / Free",  value: trialQuizzes,   color: "text-amber-400"   },
            { label: "Bundles",       value: activeBundles,  color: "text-purple-400"  },
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
            { id: "quizzes", label: "All Quizzes"  },
            { id: "upload",  label: "Upload Quiz"   },
            { id: "create",  label: "✚ Create Quiz" },
            { id: "bundles", label: "Bundles"        },
            { id: "tutors",  label: "👤 Tutors"      },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "upload"  && <QuizUploader onUploadSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />}
        {tab === "create"  && <ManualQuizCreator isOpen onClose={() => setTab("quizzes")} onSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />}
        {tab === "bundles" && <BundlesTab bundles={bundles} loading={bundlesLoading} quizzes={quizzes} onRefresh={fetchBundles} />}
        {tab === "tutors"  && <TutorsTab quizzes={quizzes} verificationSummary={verificationSummary} />}

        {tab === "quizzes" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <input type="text" placeholder="Search quizzes..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
                <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Years</option>
                {[3, 5, 7, 9].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
              <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Subjects</option>
                {["Maths", "Reading", "Writing", "Language conventions"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500 ml-auto">

                {filtered.length} quiz{filtered.length !== 1 ? "zes" : ""}
              </span>
              <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-slate-500">
              {filtered.length} quiz{filtered.length !== 1 ? "zes" : ""}
            </span>
            <button
              onClick={() => { fetchQuizzes(); fetchVerificationSummary(); }}
              className="text-xs text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
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
                <p className="text-slate-400 font-medium">
                  {quizzes.length === 0
                    ? "No quizzes yet. Upload or create your first quiz."
                    : "No quizzes match your search."}
                </p>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="px-5 py-3 text-left   text-[11px] font-medium text-slate-500 uppercase tracking-wide">Quiz</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Yr</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Difficulty</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Qs</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Status</th>
                      {/* ✅ NEW: Verified column */}
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide"> tutor Verified</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Admin ✓</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Bundle</th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide">Duration</th>
                      <th className="px-5 py-3 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wide sticky right-0 z-10 bg-slate-900">Actions</th>
                    
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filtered.map((quiz) => {
                      const quizId   = quiz.quiz_id || quiz._id;
                      const qBundles = getBundlesForQuiz(quizId);
                      return (
                        <tr key={quizId} className="group hover:bg-slate-800/50 transition-colors">

                          {/* Quiz name + badges */}
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-medium">{quiz.quiz_name}</span>
                              {quiz.is_trial && (
                                <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded">Trial</span>
                              )}
                              <TierBadge tier={quiz.tier} />
                              {quiz.tutor_flag?.status === "flagged" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded">
                                  🚩 FLAGGED
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Year */}
                          <td className="px-3 py-3 text-center text-slate-400">{quiz.year_level}</td>

                          {/* Difficulty */}
                          <td className="px-3 py-3 text-center">
                            <DifficultyBadge difficulty={quiz.difficulty} />
                            {!quiz.difficulty && <span className="text-slate-600 text-[10px]">—</span>}
                          </td>

                          {/* Question count */}
                          <td className="px-3 py-3 text-center text-slate-400">{quiz.question_count || 0}</td>

                          {/* Active toggle */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleActive(quiz); }}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition ${
                                quiz.is_active !== false
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                  : "bg-slate-700/50 text-slate-500 border-slate-700 hover:bg-slate-700"
                              }`}>
                              {quiz.is_active !== false ? "Active" : "Inactive"}
                            </button>
                          </td>

                          {/* ✅ NEW: Verification summary badge */}
                          <td className="px-3 py-3 text-center">
                            <VerificationSummaryBadge stats={verificationSummary[quizId]} />
                          </td>

                            {/* Admin Verified */}
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAdminVerify(quiz); }}
                            title={quiz.admin_verified ? `Verified by ${quiz.admin_verified_by || "admin"}` : "Click to verify"}
                            className={`w-7 h-7 rounded-lg border transition flex items-center justify-center mx-auto ${
                              quiz.admin_verified
                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                                : "bg-slate-800 border-slate-700 text-slate-600 hover:border-indigo-500/50 hover:text-indigo-400"
                            }`}>
                            {quiz.admin_verified ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            )}
                          </button>
                        </td>

                          {/* Bundle mapping */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setBundleMapQuiz(quiz); }}
                              className={`text-[10px] font-medium px-2 py-1 rounded transition ${
                                qBundles.length > 0
                                  ? "text-purple-400 hover:text-white"
                                  : "text-slate-600 hover:text-slate-400"
                              }`}>
                              {qBundles.length > 0 ? `+ ${qBundles.length}` : "+ Map"}
                            </button>
                          </td>
                        

                          {/* Duration */}
                          <td className="px-3 py-3 text-center text-slate-400">
                            {quiz.time_limit_minutes
                              ? <span className="text-[11px] font-medium text-slate-300">{quiz.time_limit_minutes}<span className="text-slate-500 ml-0.5">m</span></span>
                              : <span className="text-slate-600 text-[10px]">—</span>
                            }
                          </td>

                          {/* Actions */}
                         <td className="px-5 py-3 text-right sticky right-0 z-10 bg-slate-900 group-hover:bg-slate-800/50 transition-colors">
                           <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!quizId) { alert("Quiz ID not found"); return; }
                                  navigate(`${ADMIN_PATH}/quiz/${quizId}`);
                                }}
                                className="px-2.5 py-1.5 text-xs font-medium text-indigo-400 hover:text-white hover:bg-indigo-600/20 rounded-lg transition-colors">
                                View
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSettingsQuiz(quiz); }}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                title="Settings">
                                ⚙
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setAssignTutorsQuiz(quiz); }}
                                className="px-2.5 py-1.5 text-xs font-medium text-purple-400 hover:text-white hover:bg-purple-600/20 rounded-lg transition-colors"
                                title="Assign to tutors">
                                👤
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(quizId, quiz.quiz_name); }}
                                disabled={deletingId === quizId}
                                className="px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-40">
                                {deletingId === quizId ? "..." : "Del"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showInvite    && <InviteModal onClose={() => setShowInvite(false)} />}
      {settingsQuiz  && <QuizSettingsModal quiz={settingsQuiz} onSave={() => { setSettingsQuiz(null); fetchQuizzes(); }} onClose={() => setSettingsQuiz(null)} />}
     {bundleMapQuiz && (
  <BundleMappingModal
    quiz={bundleMapQuiz}
    bundles={bundles}
    onClose={() => setBundleMapQuiz(null)}
    onRefresh={async () => { await fetchBundles(); await fetchQuizzes(); }}
  />
)}
{assignTutorsQuiz && (
        <AssignTutorsModal
          quiz={assignTutorsQuiz}
          onClose={() => setAssignTutorsQuiz(null)}
        />
      )}
    </div>
  );
}
