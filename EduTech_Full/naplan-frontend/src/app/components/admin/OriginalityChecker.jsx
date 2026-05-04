/**
 * OriginalityChecker.jsx
 *
 * Admin UI for running originality / plagiarism checks on existing quizzes.
 *
 * FIXES from previous version:
 *   ✅ Removed axios — uses fetch (consistent with rest of codebase, no extra dep)
 *   ✅ Vite env: import.meta.env.VITE_API_BASE_URL (was process.env.REACT_APP_API_URL)
 *   ✅ Token key: "admin_token" (was "adminToken") — matches other admin components
 *
 * Place at: src/app/components/admin/OriginalityChecker.jsx
 */

import React, { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// ─── adminFetch wrapper — same pattern as your other admin components ──
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

async function postJSON(url, body = {}) {
  const res = await adminFetch(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.error || errMsg;
    } catch {
      /* ignore */
    }
    throw new Error(errMsg);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// STATUS METADATA
// ═══════════════════════════════════════════════════════════════

const STATUS_META = {
  clean:                          { label: "Clean",                       color: "green",  icon: "✅" },
  unchecked:                      { label: "Not yet checked",             color: "gray",   icon: "⚪" },
  review_semantic:                { label: "Review: similar text",        color: "amber",  icon: "⚠️" },
  review_image_partial:           { label: "Review: similar image",       color: "amber",  icon: "⚠️" },
  blocked_exact_corpus:           { label: "Blocked: exact copy",         color: "red",    icon: "🚫" },
  blocked_structural_corpus:      { label: "Blocked: numbers swapped",    color: "red",    icon: "🚫" },
  blocked_semantic:               { label: "Blocked: paraphrased",        color: "red",    icon: "🚫" },
  blocked_image_high_risk:        { label: "Blocked: image on risk site", color: "red",    icon: "🚫" },
  blocked_image_full_match:       { label: "Blocked: image copy",         color: "red",    icon: "🚫" },
  blocked_image_on_risk_page:     { label: "Blocked: image on risk page", color: "red",    icon: "🚫" },
  duplicate_internal_exact:       { label: "Duplicate in your bank",      color: "blue",   icon: "🔁" },
  duplicate_internal_structural:  { label: "Duplicate (numbers swapped)", color: "blue",   icon: "🔁" },
};

const COLOR_CLASSES = {
  green:  "bg-green-50 text-green-800 border-green-200",
  red:    "bg-red-50 text-red-800 border-red-200",
  amber:  "bg-amber-50 text-amber-800 border-amber-200",
  blue:   "bg-blue-50 text-blue-800 border-blue-200",
  gray:   "bg-gray-50 text-gray-700 border-gray-200",
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unchecked;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${COLOR_CLASSES[meta.color]}`}
    >
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function OriginalityChecker() {
  const [quizzes, setQuizzes]               = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [searchTerm, setSearchTerm]         = useState("");

  const [progress, setProgress] = useState(null);
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState([]);
  const [stats, setStats]       = useState(null);

  // ─── Load quizzes ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getJSON(`/api/admin/quizzes`);
        setQuizzes(data.quizzes || data || []);
      } catch (err) {
        console.error("Failed to load quizzes:", err);
      } finally {
        setLoadingQuizzes(false);
      }
    })();
  }, []);

  // ─── Load global stats on mount ─────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const data = await getJSON(`/api/admin/originality/stats`);
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ─── Load flagged questions for the selected quiz ───────────
  const loadResults = useCallback(async (quizId) => {
    if (!quizId) return;
    try {
      const data = await getJSON(
        `/api/admin/originality/audit?quiz_id=${encodeURIComponent(quizId)}&status=any_flag&limit=200`
      );
      setResults(data.items || []);
    } catch (err) {
      console.error("Failed to load results:", err);
      setResults([]);
    }
  }, []);

  useEffect(() => {
    if (selectedQuizId) loadResults(selectedQuizId);
  }, [selectedQuizId, loadResults]);

  // ─── Trigger a check on the selected quiz ───────────────────
  async function runCheck() {
    if (!selectedQuizId) return;
    setRunning(true);
    setProgress(null);
    try {
      const data = await postJSON(
        `/api/admin/originality/check-quiz/${encodeURIComponent(selectedQuizId)}`
      );
      setProgress(data);
    } catch (err) {
      alert("Failed to start check: " + err.message);
      setRunning(false);
    }
  }

  // ─── Poll progress while a check is running ─────────────────
  useEffect(() => {
    if (!running || !selectedQuizId) return;

    const pollId = setInterval(async () => {
      try {
        const data = await getJSON(
          `/api/admin/originality/check-quiz/${encodeURIComponent(selectedQuizId)}/status`
        );
        setProgress(data);

        if (data.status === "done") {
          clearInterval(pollId);
          setRunning(false);
          await loadResults(selectedQuizId);
          await loadStats();
        }
      } catch (err) {
        console.error("Poll failed:", err);
        clearInterval(pollId);
        setRunning(false);
      }
    }, 2000);

    return () => clearInterval(pollId);
  }, [running, selectedQuizId, loadResults, loadStats]);

  // ─── Re-check a single question ──────────────────────────────
  async function recheckOne(questionId) {
    try {
      await postJSON(`/api/admin/originality/check/${encodeURIComponent(questionId)}`);
      await loadResults(selectedQuizId);
      await loadStats();
    } catch (err) {
      alert("Re-check failed: " + err.message);
    }
  }

  // ─── Filter quizzes by search term ──────────────────────────
  const filteredQuizzes = quizzes.filter((q) => {
    const t = searchTerm.toLowerCase();
    return !t ||
      (q.title || "").toLowerCase().includes(t) ||
      (q.quiz_id || "").toLowerCase().includes(t) ||
      (q.subject || "").toLowerCase().includes(t);
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Originality & Plagiarism Checker</h1>
        <p className="text-sm text-gray-600 mt-1">
          Select a quiz, run the check, and review any flagged questions.
        </p>
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total questions"  value={stats.total} color="gray" />
          <StatCard label="Clean"             value={stats.stats?.clean || 0}      color="green" />
          <StatCard label="Need review"       value={sumStatuses(stats.stats, ["review_semantic", "review_image_partial"])} color="amber" />
          <StatCard label="Blocked"           value={sumStatuses(stats.stats, Object.keys(STATUS_META).filter(k => k.startsWith("blocked_")))} color="red" />
          <StatCard label="Not yet checked"   value={stats.stats?.unchecked || 0}  color="gray" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Quiz selector ─── */}
        <aside className="lg:col-span-1 border rounded-lg overflow-hidden">
          <div className="p-3 border-b bg-gray-50">
            <input
              type="text"
              placeholder="Search quizzes…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {loadingQuizzes ? (
              <div className="p-4 text-center text-gray-500">Loading…</div>
            ) : filteredQuizzes.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No quizzes found</div>
            ) : (
              filteredQuizzes.map((q) => {
                const id = q.quiz_id || q._id;
                const isSelected = id === selectedQuizId;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedQuizId(id)}
                    className={`w-full text-left p-3 border-b hover:bg-blue-50 transition-colors ${
                      isSelected ? "bg-blue-100 border-l-4 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{q.title || id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {q.subject || "—"} · Y{q.year_level || "?"} · {q.questions?.length ?? q.question_count ?? "?"} questions
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ─── Action panel + results ─── */}
        <main className="lg:col-span-2 space-y-4">
          {!selectedQuizId ? (
            <div className="border rounded-lg p-12 text-center text-gray-500">
              Select a quiz from the left to run an originality check.
            </div>
          ) : (
            <>
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="font-semibold">Run Check</h2>
                    <p className="text-sm text-gray-600">
                      Checks every question in this quiz against the corpus + your full bank.
                    </p>
                  </div>
                  <button
                    onClick={runCheck}
                    disabled={running}
                    className={`px-4 py-2 rounded-md text-white font-medium text-sm ${
                      running ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {running ? "Running…" : "Run Originality Check"}
                  </button>
                </div>

                {progress && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>
                        {progress.status === "done" ? "✅ Done" : "⏳ Checking"}
                        {" · "}
                        {progress.done}/{progress.total}
                        {progress.failed > 0 && ` · ${progress.failed} failed`}
                      </span>
                      <span>{Math.round(((progress.done || 0) / (progress.total || 1)) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 transition-all duration-300"
                        style={{ width: `${((progress.done || 0) / (progress.total || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-lg">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <h2 className="font-semibold">
                    Flagged questions ({results.length})
                  </h2>
                  <button
                    onClick={() => loadResults(selectedQuizId)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    ↻ Refresh
                  </button>
                </div>

                {results.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    {progress?.status === "done"
                      ? "🎉 No problems found in this quiz."
                      : "Run the check above to see results."}
                  </div>
                ) : (
                  <div className="divide-y">
                    {results.map((q) => (
                      <FlaggedQuestionCard
                        key={q.question_id}
                        question={q}
                        onRecheck={() => recheckOne(q.question_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, color }) {
  return (
    <div className={`border rounded-lg p-3 ${COLOR_CLASSES[color]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function FlaggedQuestionCard({ question, onRecheck }) {
  const orig = question.originality || {};
  const layers = orig.layers || {};
  const status = orig.status || "unchecked";

  const evidence =
    layers.exact?.corpus_match    ? { type: "Exact match (third-party)",   data: layers.exact.corpus_match } :
    layers.exact?.internal_match  ? { type: "Exact duplicate in your bank", data: layers.exact.internal_match } :
    layers.structural?.corpus_match ? { type: "Numbers-swapped match (third-party)", data: layers.structural.corpus_match } :
    layers.structural?.internal_match ? { type: "Numbers-swapped duplicate in your bank", data: layers.structural.internal_match } :
    layers.semantic?.top_matches?.[0] ? { type: `Semantic similarity (${Math.round(layers.semantic.top_matches[0].similarity * 100)}%)`, data: layers.semantic.top_matches[0] } :
    null;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <StatusBadge status={status} />
        <button onClick={onRecheck} className="text-xs text-blue-600 hover:underline">
          ↻ Re-check
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase mb-1">Your question</div>
          <div className="text-sm bg-gray-50 p-3 rounded border">{question.text}</div>
        </div>

        {evidence && (
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase mb-1">
              {evidence.type}
            </div>
            <div className="text-sm bg-red-50 p-3 rounded border border-red-200">
              {evidence.data.text || evidence.data.matched_text || "(matched item)"}
              {evidence.data.source && (
                <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-red-200">
                  Source: {evidence.data.source.publisher} ·{" "}
                  {evidence.data.source.title || ""} ·{" "}
                  {evidence.data.source.year || ""}
                </div>
              )}
              {evidence.data.question_id && (
                <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-red-200">
                  Internal duplicate ID: {evidence.data.question_id}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {layers.image?.per_image?.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-500 uppercase mb-2">Image matches</div>
          {layers.image.per_image.map((img, i) => (
            <div key={i} className="text-xs bg-amber-50 p-2 rounded border border-amber-200 mb-2">
              <div>
                Image:{" "}
                <a href={img.image_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  view
                </a>
              </div>
              {img.full_matches?.length > 0 && (
                <div className="mt-1">
                  Full matches on:{" "}
                  {img.full_matches.slice(0, 3).map((m, j) => (
                    <a
                      key={j}
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`underline mr-2 ${m.high_risk ? "text-red-600 font-bold" : "text-blue-600"}`}
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

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sumStatuses(statsObj, keys) {
  if (!statsObj) return 0;
  return keys.reduce((acc, k) => acc + (statsObj[k] || 0), 0);
}