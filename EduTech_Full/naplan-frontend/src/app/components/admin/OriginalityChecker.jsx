/**
 * OriginalityChecker.jsx  (v6 — duplicate cards now show BOTH quiz names + Edit buttons)
 *
 * CHANGES FROM v5:
 *   ✅ FindingCard now reads source_quiz + match_info from the enriched /audit response
 *   ✅ Both quiz names display in colored pills (📘 Quiz Name · Y3)
 *   ✅ Two Edit buttons — one per quiz — so admin can jump to either side
 *   ✅ goToQuiz() now takes a quizId argument directly
 *
 * Place at: src/app/components/admin/OriginalityChecker.jsx
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  if (!headers["Content-Type"] && typeof opts.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${url}`, { ...opts, headers });
}

async function getJSON(url) {
  const res = await adminFetch(url);
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

async function postJSON(url, body = {}) {
  const res = await adminFetch(url, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try { errMsg = (await res.json()).error || errMsg; } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

const STATUS_META = {
  clean:                          { label: "Clean",                 color: "green",  icon: "✅" },
  unchecked:                      { label: "Unchecked",             color: "gray",   icon: "⚪" },
  review_semantic:                { label: "Similar text",          color: "amber",  icon: "⚠️" },
  review_image_partial:           { label: "Similar image",         color: "amber",  icon: "⚠️" },
  blocked_exact_corpus:           { label: "Exact copy",            color: "red",    icon: "🚫" },
  blocked_structural_corpus:      { label: "Numbers swapped",       color: "red",    icon: "🚫" },
  blocked_semantic:               { label: "Paraphrased",           color: "red",    icon: "🚫" },
  blocked_image_high_risk:        { label: "Image on risk site",    color: "red",    icon: "🚫" },
  blocked_image_full_match:       { label: "Image copy",            color: "red",    icon: "🚫" },
  blocked_image_on_risk_page:     { label: "Image on risk page",    color: "red",    icon: "🚫" },
  duplicate_internal_exact:       { label: "Internal duplicate",    color: "blue",   icon: "🔁" },
  duplicate_internal_structural:  { label: "Internal (structural)", color: "blue",   icon: "🔁" },
};

const COLOR_CLASSES = {
  green:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  red:    "bg-red-500/10 text-red-400 border-red-500/30",
  amber:  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/30",
  gray:   "bg-slate-700/40 text-slate-300 border-slate-600",
};

const INTERNAL_STATUSES = ["duplicate_internal_exact", "duplicate_internal_structural"];
const CORPUS_STATUSES   = ["blocked_exact_corpus", "blocked_structural_corpus", "blocked_semantic"];
const REVIEW_STATUSES   = ["review_semantic", "review_image_partial"];
const IMAGE_STATUSES    = ["blocked_image_high_risk", "blocked_image_full_match", "blocked_image_on_risk_page"];

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
export default function OriginalityChecker() {
  const navigate = useNavigate();

  const [items, setItems]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [tab, setTab]                     = useState("internal");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterYear,    setFilterYear]    = useState("all");

  const [showRunner, setShowRunner] = useState(true);
  const [quizzes, setQuizzes]       = useState([]);
  const [quizSearch, setQuizSearch] = useState("");
  const [quizFilterSubject, setQuizFilterSubject] = useState("all");
  const [quizFilterYear,    setQuizFilterYear]    = useState("all");
  const [selectedQuizIds, setSelectedQuizIds] = useState(new Set());
  const [bulkProgress, setBulkProgress]       = useState(null);
  const [running, setRunning]                 = useState(false);
  const pollRef = useRef(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, auditData, quizzesData] = await Promise.all([
        getJSON("/api/admin/originality/stats"),
        getJSON("/api/admin/originality/audit?status=any_flag&limit=1000"),
        getJSON("/api/admin/quizzes"),
      ]);
      setStats(statsData);
      setItems(auditData.items || []);
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getJSON("/api/admin/originality/check-quizzes/status");
        if (data?.status === "running") {
          setRunning(true);
          setBulkProgress(data);
          startPolling();
        }
      } catch {}
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await getJSON("/api/admin/originality/check-quizzes/status");
        setBulkProgress(data);
        if (data.status === "done" || data.status === "idle" || data.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunning(false);
          loadAll();
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setRunning(false);
      }
    }, 2000);
  }

  async function handleRun() {
    if (selectedQuizIds.size === 0) {
      alert("Select at least one quiz first.");
      return;
    }
    if (selectedQuizIds.size > 100) {
      alert("Max 100 quizzes per bulk run. Split into smaller batches.");
      return;
    }
    if (!confirm(
      `Run plagiarism check on ${selectedQuizIds.size} quiz${selectedQuizIds.size !== 1 ? "es" : ""}?\n\n` +
      `This will check every question in each selected quiz against:\n` +
      `  • Third-party question banks (corpus)\n` +
      `  • Your own internal question bank\n` +
      `  • Web image matches (if enabled)\n\n` +
      `Time estimate: ~30 seconds per quiz.`
    )) return;

    try {
      setRunning(true);
      setBulkProgress(null);
      await postJSON("/api/admin/originality/check-quizzes", {
        quiz_ids: [...selectedQuizIds],
      });
      startPolling();
    } catch (err) {
      alert("Failed to start: " + err.message);
      setRunning(false);
    }
  }

  async function handleScanAllUnchecked() {
    if (!confirm(
      "Run duplicate detection on ALL unchecked quizzes?\n\n" +
      "This is FREE and only checks INTERNAL duplicates (within your own bank).\n" +
      "Already-checked quizzes are skipped.\n\n" +
      "Estimated time: ~10-30 minutes depending on bank size."
    )) return;

    try {
      setRunning(true);
      setBulkProgress(null);
      const result = await postJSON("/api/admin/originality/scan-all", {
        onlyUnchecked: true,
      });
      if (result.quiz_count === 0) {
        alert(result.message || "Nothing to scan.");
        setRunning(false);
        return;
      }
      startPolling();
    } catch (err) {
      alert("Failed to start: " + err.message);
      setRunning(false);
    }
  }

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      const id = q.quiz_id || q._id;
      if (!id) return false;
      if (quizSearch) {
        const s = quizSearch.toLowerCase();
        if (!(q.quiz_name || "").toLowerCase().includes(s)) return false;
      }
      if (quizFilterSubject !== "all") {
        if ((q.subject || "").toLowerCase() !== quizFilterSubject.toLowerCase()) return false;
      }
      if (quizFilterYear !== "all") {
        if (String(q.year_level) !== String(quizFilterYear)) return false;
      }
      return true;
    });
  }, [quizzes, quizSearch, quizFilterSubject, quizFilterYear]);

  function toggleQuiz(id) {
    setSelectedQuizIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedQuizIds((prev) => {
      const next = new Set(prev);
      filteredQuizzes.forEach((q) => next.add(q.quiz_id || q._id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedQuizIds(new Set());
  }

  const filtered = useMemo(() => {
    return items.filter((q) => {
      const status = q.originality?.status;
      if (!status) return false;

      let inTab = false;
      if (tab === "internal") inTab = INTERNAL_STATUSES.includes(status);
      if (tab === "corpus")   inTab = CORPUS_STATUSES.includes(status);
      if (tab === "review")   inTab = REVIEW_STATUSES.includes(status);
      if (tab === "image")    inTab = IMAGE_STATUSES.includes(status);
      if (!inTab) return false;

      if (filterSubject !== "all") {
        if ((q.subject || "").toLowerCase() !== filterSubject.toLowerCase()) return false;
      }
      if (filterYear !== "all") {
        if (String(q.year_level) !== String(filterYear)) return false;
      }
      return true;
    });
  }, [items, tab, filterSubject, filterYear]);

  const counts = useMemo(() => {
    const s = stats?.stats || {};
    return {
      internal: (s.duplicate_internal_exact || 0) + (s.duplicate_internal_structural || 0),
      corpus:   (s.blocked_exact_corpus || 0) + (s.blocked_structural_corpus || 0) + (s.blocked_semantic || 0),
      review:   (s.review_semantic || 0) + (s.review_image_partial || 0),
      image:    (s.blocked_image_high_risk || 0) + (s.blocked_image_full_match || 0) + (s.blocked_image_on_risk_page || 0),
      clean:    s.clean || 0,
      unchecked:s.unchecked || 0,
    };
  }, [stats]);

  // ✅ NEW: takes a quizId directly (not the question object)
  const goToQuiz = (quizId) => {
    if (!quizId) return alert("Quiz ID not found.");
    navigate(`${ADMIN_PATH}/quiz/${quizId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
  <div>
    <h1 className="text-xl font-bold text-white">🛡️ Originality & Duplicates</h1>
    <p className="text-xs text-slate-400 mt-1">
      Bank-wide view of plagiarism findings. Pick quizzes below and run checks in bulk.
    </p>
  </div>
  <div className="flex items-center gap-2">
    <button
      onClick={async () => {
        if (!confirm(
          "Clear ALL originality flags across the entire bank?\n\n" +
          "Every question will go back to 'Unchecked'.\n" +
          "You'll need to re-run the scan afterwards.\n\n" +
          "This cannot be undone."
        )) return;
        try {
          const res = await postJSON("/api/admin/originality/reset-all");
          alert(`Cleared ${res.cleared} questions. Re-scan when ready.`);
          loadAll();
        } catch (err) {
          alert("Reset failed: " + err.message);
        }
      }}
      disabled={loading || running}
      className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 disabled:opacity-50 text-xs text-red-400 rounded-lg border border-red-500/30 transition"
    >
      🗑️ Reset all flags
    </button>
    <button
      onClick={loadAll}
      disabled={loading}
      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs text-slate-300 rounded-lg border border-slate-700 transition"
    >
      {loading ? "Loading..." : "↻ Refresh"}
    </button>
  </div>
</div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Total"          value={stats.total}      color="gray"  />
          <StatCard label="Clean"          value={counts.clean}     color="green" />
          <StatCard label="Internal dups"  value={counts.internal}  color="blue"  />
          <StatCard label="Corpus matches" value={counts.corpus}    color="red"   />
          <StatCard label="Need review"    value={counts.review}    color="amber" />
          <StatCard label="Unchecked"      value={counts.unchecked} color="gray"  />
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowRunner((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 bg-slate-900 hover:bg-slate-800/50 transition border-b border-slate-800"
        >
          <div className="flex items-center gap-3">
            <span className="text-base">🚀</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Run Plagiarism Check</div>
              <div className="text-[11px] text-slate-400">
                {running
                  ? "Check in progress..."
                  : selectedQuizIds.size > 0
                    ? `${selectedQuizIds.size} quiz${selectedQuizIds.size !== 1 ? "es" : ""} selected`
                    : "Select quizzes to scan"}
              </div>
            </div>
          </div>
          <span className="text-slate-500 text-xs">{showRunner ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {showRunner && (
          <div className="p-5 space-y-4">
            {running && bulkProgress && (
              <BulkProgressBar progress={bulkProgress} />
            )}

            <div className="bg-indigo-500/5 border border-indigo-500/30 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    ⚡ Quick Scan: All Unchecked Quizzes
                  </div>
                  <div className="text-[12px] text-slate-400 mt-1">
                    Runs <strong className="text-indigo-300">Duplicate Detection</strong> (free, instant)
                    across every quiz that hasn&apos;t been scanned yet. Skips already-checked quizzes.
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {counts.unchecked} unchecked questions · ~10-30 min depending on bank size
                  </div>
                </div>
                <button
                  onClick={handleScanAllUnchecked}
                  disabled={running || counts.unchecked === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition whitespace-nowrap"
                >
                  {running ? "Running…" : counts.unchecked === 0 ? "✓ All scanned" : "⚡ Scan All Unchecked"}
                </button>
              </div>
            </div>

            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium pt-2">
              — or pick specific quizzes below —
            </div>

            <div className="grid md:grid-cols-[1fr_auto_auto] gap-3">
              <input
                type="text"
                placeholder="Search quizzes by name..."
                value={quizSearch}
                onChange={(e) => setQuizSearch(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={quizFilterSubject}
                onChange={(e) => setQuizFilterSubject(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="all">All Subjects</option>
                {["Maths", "Numeracy", "Reading", "Writing", "Language conventions"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={quizFilterYear}
                onChange={(e) => setQuizFilterYear(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="all">All Years</option>
                {[3, 5, 7, 9].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={selectAllVisible}
                className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
              >
                Select all visible ({filteredQuizzes.length})
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedQuizIds.size === 0}
                className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 transition"
              >
                Clear selection
              </button>
              <span className="text-xs text-slate-500 ml-auto">
                <strong className="text-indigo-400">{selectedQuizIds.size}</strong> selected
              </span>
              <button
                onClick={handleRun}
                disabled={running || selectedQuizIds.size === 0}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg border border-rose-500 transition"
              >
                {running ? "Running..." : `🛡️ Run on ${selectedQuizIds.size} selected`}
              </button>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-lg max-h-80 overflow-y-auto">
              {filteredQuizzes.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">No quizzes match your filters</div>
              ) : (
                filteredQuizzes.map((q) => {
                  const id = q.quiz_id || q._id;
                  const checked = selectedQuizIds.has(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-3 px-4 py-2 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/40 transition ${
                        checked ? "bg-indigo-500/5" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuiz(id)}
                        className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{q.quiz_name || id}</div>
                        <div className="text-[11px] text-slate-500">
                          {q.subject || "—"} · Y{q.year_level || "?"} · {q.question_count || 0} questions
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        <TabBtn active={tab === "internal"} onClick={() => setTab("internal")}>
          🔁 Internal Duplicates ({counts.internal})
        </TabBtn>
        <TabBtn active={tab === "corpus"} onClick={() => setTab("corpus")}>
          🚫 Corpus Matches ({counts.corpus})
        </TabBtn>
        <TabBtn active={tab === "review"} onClick={() => setTab("review")}>
          ⚠️ Need Review ({counts.review})
        </TabBtn>
        <TabBtn active={tab === "image"} onClick={() => setTab("image")}>
          🖼️ Image Matches ({counts.image})
        </TabBtn>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All Subjects</option>
          {["Maths", "Numeracy", "Reading", "Writing", "Language conventions"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All Years</option>
          {[3, 5, 7, 9].map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
        {(filterSubject !== "all" || filterYear !== "all") && (
          <button
            onClick={() => {
              setFilterSubject("all");
              setFilterYear("all");
            }}
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
          >
            ↺ Reset filters
          </button>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          Showing {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {tab === "internal" && "🎉 No internal duplicates found."}
            {tab === "corpus"   && "🎉 No corpus matches. (Note: this only catches matches against your uploaded corpus.)"}
            {tab === "review"   && "🎉 Nothing needs reviewing."}
            {tab === "image"    && "🎉 No image plagiarism found."}
          </div>
        ) : (
          filtered.map((q) => (
            <FindingCard
              key={q.question_id}
              question={q}
              onGoToQuiz={goToQuiz}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════

function BulkProgressBar({ progress }) {
  const idx = (progress.current_quiz_index ?? 0) + 1;
  const total = progress.total_quizzes || 1;
  const overallPct = Math.round(((idx - 1) / total) * 100);
  const cur = progress.current_quiz_progress || {};
  const curPct = cur.total > 0 ? Math.round((cur.done / cur.total) * 100) : 0;

  return (
    <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 animate-spin text-rose-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm font-medium text-rose-300">
          Checking quiz {idx} of {total}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>Overall progress</span>
          <span>{overallPct}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div className="bg-rose-500 h-1.5 transition-all" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {progress.current_quiz_name && (
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span className="truncate pr-2">
              <strong className="text-white">{progress.current_quiz_name}</strong>
              {cur.flagged > 0 && <span className="text-amber-400 ml-2">{cur.flagged} flagged</span>}
            </span>
            <span>{cur.done || 0}/{cur.total || "?"}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-1.5 transition-all" style={{ width: `${curPct}%` }} />
          </div>
        </div>
      )}

      {progress.completed_quizzes?.length > 0 && (
        <div className="text-[11px] text-slate-500 pt-1">
          ✅ Completed: {progress.completed_quizzes.length} ·
          {" "}Flagged across all: {progress.completed_quizzes.reduce((s, q) => s + (q.flagged || 0), 0)}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`border rounded-xl p-3 ${COLOR_CLASSES[color] || COLOR_CLASSES.gray}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
        active
          ? "bg-indigo-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unchecked;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border ${COLOR_CLASSES[meta.color]}`}
    >
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// ✅ UPGRADED: FindingCard now shows BOTH quiz names + Edit buttons
// ════════════════════════════════════════════════════════════════
function FindingCard({ question, onGoToQuiz }) {
  const orig   = question.originality || {};
  const layers = orig.layers || {};
  const status = orig.status || "unchecked";
  const text   = question.text || question.question_text || "";

  // Source quiz info (your question's quiz) — from enriched audit endpoint
  const sourceQuiz = question.source_quiz || null;
  const sourceQuizId =
    sourceQuiz?.quiz_id ||
    (question.quiz_ids && question.quiz_ids[0]) ||
    question.quiz_id ||
    null;

  // Matched question info — from enriched audit endpoint
  const matchInfo = question.match_info || null;

  // Determine evidence type
  const evidence =
    layers.exact?.corpus_match     ? { title: "Exact match (third-party)",            data: layers.exact.corpus_match,        external: true,  internalMatch: false } :
    layers.exact?.internal_match   ? { title: "Exact duplicate in your bank",         data: layers.exact.internal_match,      external: false, internalMatch: true  } :
    layers.structural?.corpus_match ? { title: "Numbers-swapped match (third-party)", data: layers.structural.corpus_match,   external: true,  internalMatch: false } :
    layers.structural?.internal_match ? { title: "Numbers-swapped duplicate in your bank", data: layers.structural.internal_match, external: false, internalMatch: true } :
    layers.semantic?.top_matches?.[0] ? {
      title: `Semantic similarity (${Math.round(layers.semantic.top_matches[0].similarity * 100)}%)`,
      data: layers.semantic.top_matches[0],
      external: layers.semantic.top_matches[0].source_type === "corpus",
      internalMatch: layers.semantic.top_matches[0].source_type !== "corpus",
    } :
    null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Top row: status + meta */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <StatusBadge status={status} />
        <span className="text-[11px] text-slate-500">
          {question.subject || "—"} · Y{question.year_level || "?"}
        </span>
      </div>

      {/* Two-column comparison */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* ── LEFT: Your question ──────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] font-medium text-slate-500 uppercase">
              Your question
            </div>
            {sourceQuizId && (
              <button
                onClick={() => onGoToQuiz(sourceQuizId)}
                className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-medium rounded transition"
              >
                ✏️ Edit →
              </button>
            )}
          </div>

          {/* Quiz name pill */}
          {sourceQuiz?.quiz_name && (
            <div className="text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-md px-2 py-1 inline-block">
              📘 {sourceQuiz.quiz_name}
              {sourceQuiz.year_level && <span className="text-slate-400 ml-1">· Y{sourceQuiz.year_level}</span>}
            </div>
          )}

          <div className="text-sm text-slate-200 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {stripHtml(text)}
          </div>
        </div>

        {/* ── RIGHT: Match info ───────────────────────────────────── */}
        {evidence && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10px] font-medium text-slate-500 uppercase">
                {evidence.title}
              </div>
              {/* Internal match — show Edit button */}
              {evidence.internalMatch && matchInfo?.quiz_id && (
                <button
                  onClick={() => onGoToQuiz(matchInfo.quiz_id)}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-medium rounded transition"
                >
                  ✏️ Edit →
                </button>
              )}
            </div>

            {/* Quiz name pill — for internal duplicates */}
            {evidence.internalMatch && matchInfo?.quiz_name && (
              <div className="text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-md px-2 py-1 inline-block">
                📘 {matchInfo.quiz_name}
                {matchInfo.year_level && <span className="text-slate-400 ml-1">· Y{matchInfo.year_level}</span>}
              </div>
            )}

            <div className={`text-sm p-3 rounded-lg border max-h-40 overflow-y-auto whitespace-pre-wrap ${
              evidence.external
                ? "text-red-200 bg-red-500/5 border-red-500/30"
                : "text-blue-200 bg-blue-500/5 border-blue-500/30"
            }`}>
              {stripHtml(
                matchInfo?.text ||
                evidence.data.text ||
                evidence.data.matched_text ||
                "(matched item)"
              )}

              {evidence.data.source && (
                <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-700/50">
                  Source: <strong>{evidence.data.source.publisher}</strong>
                  {evidence.data.source.title && ` — ${evidence.data.source.title}`}
                  {evidence.data.source.year && ` (${evidence.data.source.year})`}
                  {evidence.data.source.url && (
                    <>
                      {" — "}
                      <a href={evidence.data.source.url} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                        view source
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image-match evidence */}
      {layers.image?.per_image?.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 uppercase mb-1">Image matches</div>
          {layers.image.per_image.map((img, i) => (
            <div key={i} className="text-xs bg-amber-500/5 border border-amber-500/30 p-2 rounded-lg mb-2">
              <div className="text-slate-400">
                Image:{" "}
                <a href={img.image_url} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                  view
                </a>
              </div>
              {img.full_matches?.length > 0 && (
                <div className="mt-1 text-slate-300">
                  Found on:{" "}
                  {img.full_matches.slice(0, 3).map((m, j) => (
                    <a
                      key={j}
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`underline mr-2 ${m.high_risk ? "text-red-400 font-bold" : "text-indigo-400"}`}
                    >
                      {m.domain}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<img[^>]*>/gi, " [image] ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}