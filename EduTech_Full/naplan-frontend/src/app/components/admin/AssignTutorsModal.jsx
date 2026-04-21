/**
 * AssignTutorsModal.jsx
 *
 * Admin-only modal that assigns a single quiz to multiple tutors at once.
 * Opened from a quiz row on the "All Quizzes" tab in AdminDashboard.
 *
 * This is the inverse of AssignQuizzesModal (which assigns multiple quizzes
 * to ONE tutor). Here we assign ONE quiz to multiple tutors.
 *
 * Backend contract (no new route needed):
 *   GET   /api/admin/tutors                         → list tutors
 *   PATCH /api/admin/tutors/:tutorId/quizzes        → body: { quiz_ids: [...] }
 *
 * For each tutor whose checkbox state changed, we PATCH that tutor's
 * assigned_quiz_ids with this quizId added or removed.
 *
 * Place in: src/app/components/admin/AssignTutorsModal.jsx
 */

import { useState, useEffect } from "react";

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

export default function AssignTutorsModal({ quiz, onSaved, onClose }) {
  const quizId = quiz.quiz_id || quiz._id;

  const [tutors,   setTutors]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // ── Load tutors + pre-check those already assigned to this quiz ────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await adminFetch("/api/admin/tutors");
        if (!res.ok) throw new Error("Failed to load tutors");
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setTutors(list);

        const preChecked = new Set(
          list
            .filter((t) => (t.assigned_quiz_ids || []).includes(quizId))
            .map((t) => t._id)
        );
        setSelected(preChecked);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = tutors.filter((t) => {
    const s = search.toLowerCase();
    return (
      (t.name  || "").toLowerCase().includes(s) ||
      (t.email || "").toLowerCase().includes(s)
    );
  });

  // ── Save: diff current vs new, patch only changed tutors ───────────────────
  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const tasks = [];
      for (const t of tutors) {
        const currentlyAssigned = (t.assigned_quiz_ids || []).includes(quizId);
        const shouldBeAssigned  = selected.has(t._id);
        if (currentlyAssigned === shouldBeAssigned) continue; // no change

        const nextIds = shouldBeAssigned
          ? [...(t.assigned_quiz_ids || []), quizId]
          : (t.assigned_quiz_ids || []).filter((id) => id !== quizId);

        tasks.push(
          adminFetch(`/api/admin/tutors/${t._id}/quizzes`, {
            method: "PATCH",
            body:   JSON.stringify({ quiz_ids: nextIds }),
          }).then(async (res) => {
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error(d.error || `Failed for ${t.name || t.email}`);
            }
            return res.json();
          })
        );
      }

      if (tasks.length === 0) {
        onClose();
        return;
      }

      await Promise.all(tasks);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Assign to Tutors</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{quiz.quiz_name}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl flex-shrink-0 ml-3">✕</button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tutors by name or email…"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-slate-500 mt-2">
            {selected.size} tutor{selected.size !== 1 ? "s" : ""} selected
          </p>
          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">
              {tutors.length === 0
                ? "No tutors yet. Create tutors from the Tutors tab."
                : "No tutors match your search."}
            </p>
          ) : (
            filtered.map((t) => {
              const isChecked   = selected.has(t._id);
              const isSuspended = t.status && t.status !== "active";
              const assignedCount = (t.assigned_quiz_ids || []).length;
              return (
                <label
                  key={t._id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 cursor-pointer hover:bg-slate-750 transition"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(t._id)}
                    className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-medium truncate">
                        {t.name || "Unnamed tutor"}
                      </p>
                      {isSuspended && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded uppercase tracking-wide flex-shrink-0">
                          {t.status}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {t.email} · {assignedCount} quiz{assignedCount !== 1 ? "zes" : ""} assigned
                    </p>
                  </div>
                  {isChecked && <span className="text-emerald-400 text-xs flex-shrink-0">✓</span>}
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition"
          >
            {saving ? "Saving…" : "Save Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}