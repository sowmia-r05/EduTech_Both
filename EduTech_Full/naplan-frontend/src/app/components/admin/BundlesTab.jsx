/**
 * BundlesTab.jsx
 *
 * ═══════════════════════════════════════════════════════════════
 * Self-contained Bundle Manager tab for the Admin Dashboard.
 *
 * FEATURES:
 *   ✅ Create bundles (name, description, year, pricing, quiz count, questions/quiz)
 *   ✅ Multi-currency support (AUD $, INR ₹, USD $)
 *   ✅ Enforce exact quiz count — admin must assign exactly max_quiz_count quizzes
 *   ✅ Two distribution logics: Standard / Swap-Cascade
 *   ✅ Edit / Delete / Toggle active
 *   ✅ Quiz assignment modal with search & enforced count
 *   ✅ Year/Level is now a free-text optional field (generic, not NAPLAN-specific)
 *   ✅ Manual quiz removal from expanded bundle view
 *
 * Place in: src/app/components/admin/BundlesTab.jsx
 * ═══════════════════════════════════════════════════════════════
 */

import { useState } from "react";

/* ════════════════════════════════════════════════════════
   ADMIN FETCH
   ════════════════════════════════════════════════════════ */
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
   CURRENCY HELPERS
   ════════════════════════════════════════════════════════ */
const CURRENCIES = {
  aud: { symbol: "$", label: "AUD", flag: "🇦🇺" },
  inr: { symbol: "₹", label: "INR", flag: "🇮🇳" },
  usd: { symbol: "$", label: "USD", flag: "🇺🇸" },
};

function formatPrice(priceCents, currency = "aud") {
  const cur = CURRENCIES[currency] || CURRENCIES.aud;
  return `${cur.symbol}${(priceCents / 100).toFixed(2)} ${cur.label}`;
}


/* ════════════════════════════════════════════════════════
   CREATE / EDIT BUNDLE MODAL
   ════════════════════════════════════════════════════════ */
function CreateBundleModal({ bundle, allBundles, onSave, onClose }) {
  const isEdit = !!bundle;

  const [form, setForm] = useState({
    bundle_name: bundle?.bundle_name || "",
    description: bundle?.description || "",
    year_level: bundle?.year_level?.toString() || "",
    price_cents: bundle ? (bundle.price_cents / 100).toString() : "",
    currency: bundle?.currency || "aud",
    max_quiz_count: bundle?.max_quiz_count?.toString() || "",
    questions_per_quiz: bundle?.questions_per_quiz?.toString() || "",
    distribution_mode: bundle?.distribution_mode || "standard",
    swap_eligible_from: bundle?.swap_eligible_from || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const u = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setError("");
  };

  const toggleSwapSource = (bundleId) => {
    setForm((f) => ({
      ...f,
      swap_eligible_from: f.swap_eligible_from.includes(bundleId)
        ? f.swap_eligible_from.filter((id) => id !== bundleId)
        : [...f.swap_eligible_from, bundleId],
    }));
  };

  const swapCandidates = allBundles.filter((b) => b.bundle_id !== bundle?.bundle_id);

  const handleSubmit = async () => {
    if (!form.bundle_name.trim()) return setError("Bundle name is required");
    if (!form.price_cents || Number(form.price_cents) < 0) return setError("Valid price is required");
    if (!form.max_quiz_count || Number(form.max_quiz_count) < 1) return setError("Quiz count must be at least 1");

    setSaving(true);
    setError("");

    try {
      const payload = {
        bundle_name: form.bundle_name.trim(),
        description: form.description.trim(),
        year_level: form.year_level.trim() || null,
        price_cents: Math.round(Number(form.price_cents) * 100),
        currency: form.currency,
        max_quiz_count: Number(form.max_quiz_count),
        questions_per_quiz: Number(form.questions_per_quiz) || 0,
        distribution_mode: form.distribution_mode,
        swap_eligible_from: form.distribution_mode === "swap" ? form.swap_eligible_from : [],
      };

      const url = isEdit ? `/api/admin/bundles/${bundle.bundle_id}` : "/api/admin/bundles";
      const method = isEdit ? "PATCH" : "POST";

      const res = await adminFetch(url, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed to ${isEdit ? "update" : "create"} bundle`);
      }

      onSave();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Bundle" : "Create New Bundle"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* Bundle Name */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Bundle Name *</label>
            <input value={form.bundle_name} onChange={u("bundle_name")} placeholder="e.g. Year 3 Premium Pack"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Description</label>
            <input value={form.description} onChange={u("description")} placeholder="Short description..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Year Level — free text, optional */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Year / Level <span className="text-slate-600">(optional)</span></label>
            <input value={form.year_level} onChange={u("year_level")} placeholder="e.g. Year 3, Grade 5, Level 1..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Price (e.g. 19.00) *</label>
              <input type="number" step="0.01" min="0" value={form.price_cents} onChange={u("price_cents")} placeholder="e.g. 19.00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Currency *</label>
              <div className="flex gap-2">
                {Object.entries(CURRENCIES).map(([key, cur]) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, currency: key }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border transition ${
                      form.currency === key ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}>
                    <span>{cur.flag}</span>
                    <span>{cur.symbol} {cur.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quiz Count + Questions/Quiz */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Number of Quizzes *</label>
              <input type="number" min="1" value={form.max_quiz_count} onChange={u("max_quiz_count")} placeholder="e.g. 10"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-[10px] text-slate-500 mt-1">You must assign exactly this many quizzes</p>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5 block">Questions per Quiz</label>
              <input type="number" min="1" value={form.questions_per_quiz} onChange={u("questions_per_quiz")} placeholder="e.g. 20"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {/* Distribution Mode */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-2 block">Distribution Logic *</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setForm((f) => ({ ...f, distribution_mode: "standard", swap_eligible_from: [] }))}
                className={`p-4 rounded-xl border text-left transition ${form.distribution_mode === "standard" ? "bg-indigo-500/10 border-indigo-500/40" : "bg-slate-800/50 border-slate-700 hover:border-slate-600"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full border-2 ${form.distribution_mode === "standard" ? "bg-indigo-400 border-indigo-400" : "border-slate-600"}`} />
                  <span className={`text-sm font-semibold ${form.distribution_mode === "standard" ? "text-indigo-300" : "text-slate-400"}`}>Standard</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed ml-5">Each bundle is independent. User gets only the quizzes they purchased.</p>
              </button>

              <button type="button"
                onClick={() => setForm((f) => ({ ...f, distribution_mode: "swap" }))}
                className={`p-4 rounded-xl border text-left transition ${form.distribution_mode === "swap" ? "bg-amber-500/10 border-amber-500/40" : "bg-slate-800/50 border-slate-700 hover:border-slate-600"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full border-2 ${form.distribution_mode === "swap" ? "bg-amber-400 border-amber-400" : "border-slate-600"}`} />
                  <span className={`text-sm font-semibold ${form.distribution_mode === "swap" ? "text-amber-300" : "text-slate-400"}`}>Swap / Cascade</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed ml-5">Reuse quizzes from selected bundles when user hasn't purchased them.</p>
              </button>
            </div>
          </div>

          {/* Swap Source Selection */}
          {form.distribution_mode === "swap" && (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
              <label className="text-[11px] text-amber-400 uppercase tracking-wide font-semibold mb-2 block">⇄ Select Bundles to Swap From</label>
              <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                Choose which bundles this bundle can absorb quizzes from when a user buys it without owning those bundles.
              </p>

              {swapCandidates.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No other bundles available. Create more bundles first.</p>
              ) : (
                <div className="space-y-2">
                  {swapCandidates.map((b) => {
                    const isSelected = form.swap_eligible_from.includes(b.bundle_id);
                    const qCount = b.max_quiz_count || (b.quiz_ids || []).length || b.quiz_count || 0;
                    return (
                      <button key={b.bundle_id} type="button" onClick={() => toggleSwapSource(b.bundle_id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${isSelected ? "bg-amber-500/10 border-amber-500/25" : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"}`}>
                        <span className={`w-5 h-5 rounded flex items-center justify-center border-2 text-[10px] ${isSelected ? "bg-amber-500 border-amber-500 text-black" : "border-slate-600"}`}>
                          {isSelected && "✓"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-white">{b.bundle_name}</span>
                          <span className="text-[11px] text-slate-500 ml-2">
                            {b.year_level ? `${b.year_level} • ` : ""}{qCount} quizzes • {formatPrice(b.price_cents, b.currency || "aud")}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {form.swap_eligible_from.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/15 text-[11px] text-indigo-300 leading-relaxed">
                  <strong>Preview:</strong> If a user purchases this bundle without owning{" "}
                  {form.swap_eligible_from.map((id) => swapCandidates.find((b) => b.bundle_id === id)?.bundle_name || id).join(" or ")}
                  , their {form.max_quiz_count || "X"} quiz slots will first be filled from those unpurchased bundles, then the remainder from this bundle's own pool.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? "Saving..." : isEdit ? "Update Bundle" : "Create Bundle"}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════
   QUIZ ASSIGNMENT MODAL
   ════════════════════════════════════════════════════════ */
function QuizAssignmentModal({ bundle, quizzes, allBundles, onSave, onClose }) {
  const maxCount = bundle.max_quiz_count || 999;
  const currentIds = bundle.quiz_ids || [];
  const [selected, setSelected] = useState([...currentIds]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const assignedElsewhere = new Set(
    allBundles.filter((b) => b.bundle_id !== bundle.bundle_id).flatMap((b) => b.quiz_ids || [])
  );

  const filtered = quizzes.filter((q) =>
    (q.quiz_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.subject || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.quiz_id || "").toLowerCase().includes(search.toLowerCase())
  );

  const remaining = maxCount - selected.length;

  const toggleQuiz = (quizId) => {
    setSelected((prev) => {
      if (prev.includes(quizId)) return prev.filter((id) => id !== quizId);
      if (prev.length >= maxCount) return prev;
      return [...prev, quizId];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toRemove = currentIds.filter((id) => !selected.includes(id));
      const toAdd = selected.filter((id) => !currentIds.includes(id));

      for (const qid of toRemove) {
        await adminFetch(`/api/admin/bundles/${bundle.bundle_id}/quizzes`, { method: "DELETE", body: JSON.stringify({ quiz_id: qid }) });
      }
      for (const qid of toAdd) {
        await adminFetch(`/api/admin/bundles/${bundle.bundle_id}/quizzes`, { method: "POST", body: JSON.stringify({ quiz_id: qid }) });
      }
      onSave();
    } catch (err) {
      alert("Error assigning quizzes: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Assign Quizzes — "{bundle.bundle_name}"</h2>
              <p className="text-[11px] text-slate-500 mt-1">Select exactly <strong className="text-indigo-400">{maxCount}</strong> quizzes</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition">✕</button>
          </div>

          {/* Counter */}
          <div className={`mt-3 flex items-center gap-3 px-4 py-3 rounded-lg border ${remaining === 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
            <span className={`text-xl font-bold font-mono ${remaining === 0 ? "text-emerald-400" : "text-amber-400"}`}>{selected.length}/{maxCount}</span>
            <div>
              <p className={`text-xs font-semibold ${remaining === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                {remaining === 0 ? "All slots filled!" : `${remaining} more needed`}
              </p>
              <p className="text-[10px] text-slate-500">{remaining === 0 ? "Ready to save" : "Select more quizzes"}</p>
            </div>
          </div>

          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quizzes..."
            className="w-full mt-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Quiz List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No quizzes found</p>}
            {filtered.map((quiz) => {
              const qid = quiz.quiz_id;
              const isSelected = selected.includes(qid);
              const isElsewhere = assignedElsewhere.has(qid);
              const isDisabled = !isSelected && (remaining === 0 || isElsewhere);

              return (
                <button key={qid} type="button" onClick={() => !isElsewhere && toggleQuiz(qid)} disabled={isDisabled && !isSelected}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${
                    isSelected ? "bg-indigo-500/10 border-indigo-500/25"
                    : isElsewhere ? "bg-slate-800/30 border-slate-800 opacity-40 cursor-not-allowed"
                    : isDisabled ? "bg-slate-800/30 border-slate-800 opacity-40"
                    : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                  }`}>
                  <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 text-[10px] ${isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-600"}`}>
                    {isSelected && "✓"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium block truncate ${isSelected ? "text-white" : "text-slate-300"}`}>{quiz.quiz_name}</span>
                    <span className="text-[10px] text-slate-500">
                      {quiz.subject && `${quiz.subject} • `}{quiz.year_level ? `Year ${quiz.year_level} • ` : ""}{quiz.question_count || "?"} questions
                      {isElsewhere && " • assigned to another bundle"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={() => setSelected([])} className="px-3 py-1.5 text-xs text-slate-500 hover:text-white transition">Clear All</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancel</button>
            <button onClick={handleSave} disabled={saving || selected.length !== maxCount}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${selected.length === maxCount ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-700 text-slate-500 cursor-not-allowed"} disabled:opacity-50`}>
              {saving ? "Saving..." : `Save (${selected.length}/${maxCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════
   MAIN EXPORT — BundlesTab
   ════════════════════════════════════════════════════════ */
export default function BundlesTab({ bundles, loading, quizzes, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editBundle, setEditBundle] = useState(null);
  const [assignBundle, setAssignBundle] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [removingQuiz, setRemovingQuiz] = useState(null);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-sm text-slate-400">Loading bundles...</p>
      </div>
    );
  }

  const handleDelete = async (bundleId, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(bundleId);
    try {
      const res = await adminFetch(`/api/admin/bundles/${bundleId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      onRefresh();
    } catch (err) { alert(err.message); }
    setDeleting(null);
  };

  const handleToggleActive = async (bundle) => {
    try {
      const res = await adminFetch(`/api/admin/bundles/${bundle.bundle_id}`, { method: "PATCH", body: JSON.stringify({ is_active: !bundle.is_active }) });
      if (!res.ok) throw new Error("Failed");
      onRefresh();
    } catch (err) { alert(err.message); }
  };

  const handleRemoveQuiz = async (bundleId, quizId) => {
    if (!confirm("Remove this quiz from the bundle?")) return;
    setRemovingQuiz(quizId);
    try {
      const res = await adminFetch(`/api/admin/bundles/${bundleId}/quizzes`, {
        method: "DELETE",
        body: JSON.stringify({ quiz_id: quizId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to remove quiz");
      }
      onRefresh();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setRemovingQuiz(null);
  };

  const filtered = filter === "all" ? bundles
    : filter === "active" ? bundles.filter((b) => b.is_active)
    : filter === "swap" ? bundles.filter((b) => b.distribution_mode === "swap")
    : bundles.filter((b) => b.distribution_mode !== "swap");

  const byYear = {};
  filtered.forEach((b) => {
    const key = b.year_level || "Uncategorized";
    if (!byYear[key]) byYear[key] = [];
    byYear[key].push(b);
  });

  return (
    <div>
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "swap", label: "Swap" }, { key: "standard", label: "Standard" }].map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === tab.key ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-300"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14m-7-7h14" /></svg>
          Create Bundle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: bundles.length, color: "text-indigo-400" },
          { label: "Active", value: bundles.filter((b) => b.is_active).length, color: "text-emerald-400" },
          { label: "Swap Mode", value: bundles.filter((b) => b.distribution_mode === "swap").length, color: "text-amber-400" },
          { label: "Quizzes Assigned", value: bundles.reduce((s, b) => s + (b.quiz_ids || []).length, 0), color: "text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-slate-400 font-medium">No bundles found</p>
          <p className="text-sm text-slate-500 mt-1">Click "Create Bundle" to add one.</p>
        </div>
      )}

      {/* Bundle Cards */}
      <div className="space-y-8">
        {Object.entries(byYear).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([year, yBundles]) => (
          <div key={year}>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{year}</h3>
            <div className="space-y-3">
              {yBundles.sort((a, b) => (a.bundle_name || "").localeCompare(b.bundle_name || "")).map((bundle) => {
                const qIds = bundle.quiz_ids || [];
                const maxQ = bundle.max_quiz_count || 0;
                const fillPct = maxQ > 0 ? Math.min((qIds.length / maxQ) * 100, 100) : 0;
                const isExpanded = expandedId === bundle.bundle_id;
                const swapSources = (bundle.swap_eligible_from || []).map((id) => bundles.find((b) => b.bundle_id === id)).filter(Boolean);

                return (
                  <div key={bundle.bundle_id} className={`bg-slate-900 border rounded-xl transition ${bundle.is_active ? "border-slate-800 hover:border-slate-700" : "border-slate-800/50 opacity-60"}`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="text-sm font-semibold text-white">{bundle.bundle_name}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${bundle.distribution_mode === "swap" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                              {bundle.distribution_mode === "swap" ? "⇄ Swap" : "● Standard"}
                            </span>
                            {!bundle.is_active && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border bg-red-500/10 text-red-400 border-red-500/20">Inactive</span>}
                          </div>
                          {bundle.description && <p className="text-[11px] text-slate-500 mt-0.5">{bundle.description}</p>}

                          <div className="flex items-center gap-5 mt-3 text-xs text-slate-400 flex-wrap">
                            <span className="font-semibold text-emerald-400">{formatPrice(bundle.price_cents, bundle.currency || "aud")}</span>
                            <span>•</span>
                            <span>{maxQ > 0 ? `${maxQ} quizzes` : `${qIds.length} quizzes`}</span>
                            {bundle.questions_per_quiz > 0 && <><span>•</span><span>{bundle.questions_per_quiz} Q/quiz</span></>}
                            <span>•</span>
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-16 h-1.5 rounded bg-slate-800 overflow-hidden">
                                <span className="block h-full rounded transition-all" style={{ width: `${fillPct}%`, backgroundColor: fillPct >= 100 ? "#10b981" : fillPct > 0 ? "#f59e0b" : "#ef4444" }} />
                              </span>
                              <span className={`font-mono text-[11px] ${fillPct >= 100 ? "text-emerald-400" : "text-amber-400"}`}>{qIds.length}/{maxQ || "?"}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                          <button onClick={() => setAssignBundle(bundle)} className="px-2.5 py-1.5 text-xs font-medium text-purple-400 hover:text-white hover:bg-purple-600/20 rounded-lg transition-colors" title="Assign Quizzes">📋 Assign</button>
                          <button onClick={() => setEditBundle(bundle)} className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Edit">⚙</button>
                          <button onClick={() => handleToggleActive(bundle)} className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${bundle.is_active ? "text-emerald-400 hover:bg-emerald-600/20" : "text-slate-500 hover:bg-slate-700"}`} title={bundle.is_active ? "Deactivate" : "Activate"}>
                            {bundle.is_active ? "●" : "○"}
                          </button>
                          <button onClick={() => handleDelete(bundle.bundle_id, bundle.bundle_name)} disabled={deleting === bundle.bundle_id} className="px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-40" title="Delete">
                            {deleting === bundle.bundle_id ? "..." : "🗑"}
                          </button>
                          <button onClick={() => setExpandedId(isExpanded ? null : bundle.bundle_id)} className="px-2 py-1.5 text-xs text-slate-500 hover:text-white rounded-lg transition-colors">
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-0 border-t border-slate-800/50">
                        <div className="pt-4 space-y-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Assigned Quizzes ({qIds.length}/{maxQ || "∞"})</p>
                            {qIds.length === 0 ? (
                              <div className="p-3 rounded-lg bg-red-500/5 border border-dashed border-red-500/20 text-red-400 text-xs">
                                ⚠ No quizzes assigned. Click "Assign" to add exactly {maxQ || "the required"} quizzes.
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {qIds.map((qid) => {
                                  const quiz = quizzes.find((q) => q.quiz_id === qid);
                                  return (
                                    <span key={qid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 group">
                                      {quiz ? quiz.quiz_name : qid}
                                      <button
                                        onClick={() => handleRemoveQuiz(bundle.bundle_id, qid)}
                                        disabled={removingQuiz === qid}
                                        className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-indigo-400 hover:bg-red-500/20 hover:text-red-400 transition opacity-60 group-hover:opacity-100 disabled:opacity-30"
                                        title="Remove quiz"
                                      >
                                        {removingQuiz === qid ? "…" : "✕"}
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {bundle.distribution_mode === "swap" && swapSources.length > 0 && (
                            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
                              <p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold mb-2">⇄ Swap Distribution Flow</p>
                              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                                When a user buys <strong className="text-white">"{bundle.bundle_name}"</strong> without owning {swapSources.map((s) => s.bundle_name).join(" or ")}, their {maxQ} quiz slots are filled:
                              </p>
                              <div className="space-y-2 pl-2">
                                {swapSources.map((source, i) => (
                                  <div key={source.bundle_id} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</div>
                                    <div className="flex-1 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                                      <span className="text-xs font-medium text-white">{source.bundle_name}</span>
                                      <span className="text-[10px] text-slate-500 ml-2">→ up to {source.max_quiz_count || (source.quiz_ids || []).length || 0} quizzes (if unpurchased)</span>
                                    </div>
                                  </div>
                                ))}
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">★</div>
                                  <div className="flex-1 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                                    <span className="text-xs font-semibold text-indigo-300">{bundle.bundle_name}</span>
                                    <span className="text-[10px] text-slate-500 ml-2">→ remaining slots from own pool (total: {maxQ})</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {showCreate && <CreateBundleModal bundle={null} allBundles={bundles} onSave={() => { setShowCreate(false); onRefresh(); }} onClose={() => setShowCreate(false)} />}
      {editBundle && <CreateBundleModal bundle={editBundle} allBundles={bundles} onSave={() => { setEditBundle(null); onRefresh(); }} onClose={() => setEditBundle(null)} />}
      {assignBundle && <QuizAssignmentModal bundle={assignBundle} quizzes={quizzes} allBundles={bundles} onSave={() => { setAssignBundle(null); onRefresh(); }} onClose={() => setAssignBundle(null)} />}
    </div>
  );
}