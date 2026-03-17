/**
 * TutorsTab.jsx
 *
 * Admin-only tab in AdminDashboard for managing tutors.
 *
 * Features:
 *   ✅ Create tutor accounts (name, email, password)
 *   ✅ List all tutors with verification progress per assigned quiz
 *   ✅ Assign / unassign quizzes to each tutor
 *   ✅ Suspend / reactivate / delete tutors
 *   ✅ See each tutor's total verification stats
 */

import { useState, useEffect, useCallback } from "react";

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

// ─── Create Tutor Modal ───────────────────────────────────────────────────────
function CreateTutorModal({ onCreated, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const tf = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim())  { setError("Name is required"); return; }
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }

    try {
      setLoading(true);
      const res  = await adminFetch("/api/admin/tutors", {
        method: "POST",
        body:   JSON.stringify({
          name:     form.name.trim(),
          email:    form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tutor");
      onCreated(data.tutor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Create Tutor Account</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Full Name</label>
            <input type="text" value={form.name} onChange={tf("name")} placeholder="John Smith"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input type="email" value={form.email} onChange={tf("email")} placeholder="tutor@example.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input type="password" value={form.password} onChange={tf("password")} placeholder="Min 8 characters"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition">
              {loading ? "Creating..." : "Create Tutor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assign Quizzes Modal ─────────────────────────────────────────────────────
function AssignQuizzesModal({ tutor, quizzes, onSaved, onClose }) {
  const [selected, setSelected] = useState(new Set(tutor.assigned_quiz_ids || []));
  const [search,   setSearch]   = useState("");
  const [saving,   setSaving]   = useState(false);

  const filtered = quizzes.filter((q) =>
    (q.quiz_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.subject   || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (quizId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(quizId) ? next.delete(quizId) : next.add(quizId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/tutors/${tutor._id}/quizzes`, {
        method: "PATCH",
        body:   JSON.stringify({ quiz_ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onSaved(data.tutor);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Assign Quizzes</h2>
              <p className="text-xs text-slate-500 mt-0.5">to {tutor.name}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quizzes..." 
            className="mt-3 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[11px] text-slate-500 mt-2">{selected.size} quiz{selected.size !== 1 ? "zes" : ""} selected</p>
        </div>

        {/* Quiz list */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">No quizzes found.</p>
          ) : (
            filtered.map((q) => {
              const quizId = q.quiz_id || q._id;
              const isChecked = selected.has(quizId);
              return (
                <label key={quizId} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 cursor-pointer hover:bg-slate-750 transition">
                  <input type="checkbox" checked={isChecked} onChange={() => toggle(quizId)}
                    className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{q.quiz_name}</p>
                    <p className="text-[11px] text-slate-500">
                      Year {q.year_level} · {q.subject} · {q.question_count || 0} questions
                    </p>
                  </div>
                  {isChecked && <span className="text-emerald-400 text-xs flex-shrink-0">✓ Assigned</span>}
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition">
            {saving ? "Saving..." : "Save Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main TutorsTab ───────────────────────────────────────────────────────────
export default function TutorsTab({ quizzes, verificationSummary }) {
  const [tutors,       setTutors]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [assignTutor,  setAssignTutor]  = useState(null);
  const [deletingId,   setDeletingId]   = useState(null);

  const fetchTutors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch("/api/admin/tutors");
      if (res.ok) {
        const data = await res.json();
        setTutors(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTutors(); }, [fetchTutors]);

  const handleTutorCreated = (tutor) => {
    setTutors((prev) => [tutor, ...prev]);
    setShowCreate(false);
  };

  const handleQuizzesAssigned = (updatedTutor) => {
    setTutors((prev) => prev.map((t) => t._id === updatedTutor._id ? updatedTutor : t));
    setAssignTutor(null);
  };

  const handleToggleStatus = async (tutor) => {
    const action = tutor.status === "active" ? "suspend" : "reactivate";
    try {
      const res = await adminFetch(`/api/admin/tutors/${tutor._id}`, {
        method: "PATCH",
        body:   JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setTutors((prev) => prev.map((t) => t._id === data.tutor._id ? data.tutor : t));
      }
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (tutor) => {
    if (!confirm(`Delete tutor "${tutor.name}"? This cannot be undone.`)) return;
    setDeletingId(tutor._id);
    try {
      const res = await adminFetch(`/api/admin/tutors/${tutor._id}`, { method: "DELETE" });
      if (res.ok) setTutors((prev) => prev.filter((t) => t._id !== tutor._id));
      else { const d = await res.json(); alert(d.error || "Delete failed"); }
    } catch (err) { alert(err.message); }
    finally { setDeletingId(null); }
  };

  // Compute per-tutor verification stats across assigned quizzes
  const getTutorStats = (tutor) => {
    const ids = tutor.assigned_quiz_ids || [];
    let approved = 0, rejected = 0, pending = 0, total = 0;
    for (const qid of ids) {
      const s = verificationSummary[qid];
      if (s) {
        approved += s.approved || 0;
        rejected += s.rejected || 0;
        pending  += s.pending  || 0;
        total    += s.total    || 0;
      }
    }
    return { approved, rejected, pending, total };
  };

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-white">Tutors</h2>
          <p className="text-xs text-slate-500 mt-0.5">{tutors.length} tutor{tutors.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition">
          + Create Tutor
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tutors.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-slate-300 font-medium">No tutors yet</p>
          <p className="text-slate-500 text-sm mt-1">Create a tutor account and assign quizzes for them to verify.</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition">
            Create First Tutor
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tutors.map((tutor) => {
            const stats   = getTutorStats(tutor);
            const pct     = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
            const allDone = stats.total > 0 && stats.approved === stats.total;

            return (
              <div key={tutor._id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-400 font-bold text-sm">
                        {tutor.name?.charAt(0)?.toUpperCase() || "T"}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">{tutor.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                          tutor.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-700/50 text-slate-500 border-slate-700"
                        }`}>
                          {tutor.status}
                        </span>
                        {allDone && stats.total > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                            ✓ All Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{tutor.email}</p>

                      {/* Assigned quizzes chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(tutor.assigned_quiz_ids || []).length === 0 ? (
                          <span className="text-[11px] text-slate-600 italic">No quizzes assigned</span>
                        ) : (
                          tutor.assigned_quiz_ids.map((qid) => {
                            const quiz = quizzes.find((q) => (q.quiz_id || q._id) === qid);
                            const qStats = verificationSummary[qid] || {};
                            const qPct = qStats.total > 0 ? Math.round((qStats.approved / qStats.total) * 100) : 0;
                            return (
                              <span key={qid}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400">
                                {quiz?.quiz_name || qid.slice(0, 8) + "..."}
                                <span className={`font-semibold ${qPct === 100 ? "text-emerald-400" : "text-indigo-400"}`}>
                                  {qPct}%
                                </span>
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: stats + actions */}
                  <div className="flex flex-col items-end gap-3">
                    {/* Verification stats */}
                    {stats.total > 0 && (
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-xs justify-end">
                          <span className="text-emerald-400 font-semibold">{stats.approved}✓</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-red-400 font-semibold">{stats.rejected}✗</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-amber-400 font-semibold">{stats.pending}⋯</span>
                          <span className="text-slate-500">/ {stats.total}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-32 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setAssignTutor(tutor)}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-white hover:bg-indigo-600/20 border border-indigo-500/30 rounded-lg transition">
                        Assign Quizzes
                      </button>
                      <button onClick={() => handleToggleStatus(tutor)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                          tutor.status === "active"
                            ? "text-amber-400 hover:text-white hover:bg-amber-600/20 border-amber-500/30"
                            : "text-emerald-400 hover:text-white hover:bg-emerald-600/20 border-emerald-500/30"
                        }`}>
                        {tutor.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                      <button onClick={() => handleDelete(tutor)} disabled={deletingId === tutor._id}
                        className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/20 border border-red-500/30 rounded-lg transition disabled:opacity-40">
                        {deletingId === tutor._id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateTutorModal onCreated={handleTutorCreated} onClose={() => setShowCreate(false)} />
      )}
      {assignTutor && (
        <AssignQuizzesModal
          tutor={assignTutor}
          quizzes={quizzes}
          onSaved={handleQuizzesAssigned}
          onClose={() => setAssignTutor(null)}
        />
      )}
    </div>
  );
}