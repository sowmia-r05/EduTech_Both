/**
 * AIImageDashboard.jsx
 *
 * ═══════════════════════════════════════════════════════════════
 * Standalone admin page showing AI image budget + full generation
 * history with prompts, previews, and admin attribution.
 *
 * Mount in your admin router, e.g.:
 *   <Route path="/admin/ai-images" element={<AIImageDashboard />} />
 *
 * Add a link in AdminDashboard sidebar:
 *   <Link to="/admin/ai-images">🎨 AI Images</Link>
 *
 * Place in: src/app/components/admin/AIImageDashboard.jsx
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from "react";
import AIUsageWidget from "./AIUsageWidget";

const API = import.meta.env.VITE_API_BASE_URL || "";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

export default function AIImageDashboard() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | success | failed
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("admin_token");
      const params = new URLSearchParams({ limit: "50" });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(
        `${API}/api/admin/ai-image/usage/history?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Failed to load history");
      setHistory(j.history || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🎨</span> AI image generation
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track OpenAI image generation spend, view generation history, and manage your monthly budget.
          </p>
        </div>

        {/* Usage widget */}
        <AIUsageWidget refreshKey={refreshKey} />

        {/* History section */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent generations</h2>
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="all">All</option>
                <option value="success">Success only</option>
                <option value="failed">Failed only</option>
              </select>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded hover:bg-slate-800"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-sm text-red-300 mb-3">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-center py-12 text-slate-500">
              <div className="inline-block w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-xs">Loading history...</p>
            </div>
          )}

          {!loading && history.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No generations yet.
            </div>
          )}

          {!loading && history.length > 0 && (
            <div className="space-y-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    h.status === "success"
                      ? "bg-slate-800/50 border-slate-700"
                      : "bg-red-900/20 border-red-800/40"
                  }`}
                >
                  {/* Thumbnail */}
                  {h.s3_url ? (
                    <a href={h.s3_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                      <img
                        src={h.s3_url}
                        alt="Generated"
                        className="w-16 h-16 rounded object-cover border border-slate-700 hover:border-indigo-500 transition"
                      />
                    </a>
                  ) : (
                    <div className="w-16 h-16 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">
                      {h.status === "failed" ? "❌" : "🖼️"}
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 line-clamp-2">
                      {h.prompt || <span className="italic text-slate-500">No prompt</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                      <span>📧 {h.admin_email}</span>
                      <span>🕒 {formatDate(h.created_at)}</span>
                      <span>📐 {h.size} {h.quality !== "standard" && `· ${h.quality}`}</span>
                      <span className="font-mono">${(h.cost_usd || 0).toFixed(3)}</span>
                    </div>
                    {h.error && (
                      <p className="text-[11px] text-red-300 mt-1">⚠️ {h.error}</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      h.status === "success"
                        ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40"
                        : "bg-red-900/40 text-red-300 border border-red-700/40"
                    }`}
                  >
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}