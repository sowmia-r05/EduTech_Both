/**
 * AIUsageWidget.jsx
 *
 * ═══════════════════════════════════════════════════════════════
 * Compact reusable widget showing current month's AI image spend
 * versus the configured budget. Used at the top of the
 * AIImageGenerator modal, and on the standalone dashboard page.
 *
 * Props:
 *   compact   — if true, renders a single-line bar (for modals)
 *   refreshKey — change this number to force a refetch (e.g. after generation)
 *   onLoad    — callback({ blocked, warn, remaining, ... }) when fetched
 *
 * Place in: src/app/components/admin/AIUsageWidget.jsx
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

function formatUSD(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function getBarColor(pct, blocked) {
  if (blocked) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

export default function AIUsageWidget({
  compact = false,
  refreshKey = 0,
  onLoad = null,
  showRefresh = true,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API}/api/admin/ai-image/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Failed to load usage");
      setData(j);
      if (onLoad) onLoad(j.this_month);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [onLoad]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage, refreshKey]);

  /* ─────────────────────────────────────────────────────────── */

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
        <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
        Loading budget...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-xs text-red-400">
        ⚠️ {error || "Usage data unavailable"}
      </div>
    );
  }

  const m = data.this_month;
  const pct = Math.round(m.pct_used);
  const barColor = getBarColor(pct, m.blocked);

  // ── Compact (single-line, for modals) ──────────────────────────
  if (compact) {
    return (
      <div
        className={`rounded-lg border px-3 py-2 ${
          m.blocked
            ? "bg-red-900/30 border-red-700/50"
            : m.warn
            ? "bg-amber-900/20 border-amber-700/40"
            : "bg-slate-800/60 border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={m.blocked ? "text-red-300" : "text-slate-300"}>
              {m.blocked ? "🚫 Budget exhausted" : m.warn ? "⚠️ Budget" : "💰 Budget"}
            </span>
            <span className="font-mono font-medium text-white">
              {formatUSD(m.spent_usd)} / {formatUSD(m.monthly_budget_usd)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-slate-400">
              {formatUSD(m.remaining_usd)} left · {m.count} images
            </span>
            {showRefresh && (
              <button
                onClick={fetchUsage}
                title="Refresh"
                className="text-slate-500 hover:text-slate-200 text-xs"
              >
                ↻
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-1.5 bg-slate-900 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Full (dashboard card) ──────────────────────────────────────
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            <span>💰</span> AI image budget
          </h3>
          <p className="text-[11px] text-slate-500">
            Resets on the 1st of each month · Model: {data.config.model}
          </p>
        </div>
        {showRefresh && (
          <button
            onClick={fetchUsage}
            className="text-slate-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-slate-800"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {/* Status banner */}
      {m.blocked && (
        <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-3 py-2 text-sm text-red-200">
          🚫 <strong>Budget exhausted.</strong> Generation is blocked until next month
          or until an admin raises <code>AI_IMAGE_MONTHLY_BUDGET_USD</code>.
        </div>
      )}
      {!m.blocked && m.warn && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2 text-sm text-amber-200">
          ⚠️ You've used {pct}% of this month's budget. {formatUSD(m.remaining_usd)} left.
        </div>
      )}

      {/* Big numbers */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Spent</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">
            {formatUSD(m.spent_usd)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{m.count} images</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Budget</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">
            {formatUSD(m.monthly_budget_usd)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">monthly</div>
        </div>
        <div className={`rounded-lg p-3 ${m.blocked ? "bg-red-900/30" : "bg-emerald-900/20"}`}>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${m.blocked ? "text-red-300" : "text-emerald-300"}`}>
            {formatUSD(m.remaining_usd)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            ≈ {Math.floor(m.remaining_usd / 0.04)} more standard images
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>Monthly usage</span>
          <span className="font-medium">{pct}% used</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Per-admin breakdown */}
      {data.by_admin && data.by_admin.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-300 mb-2">By admin (this month)</div>
          <div className="space-y-1.5">
            {data.by_admin.map((a) => (
              <div
                key={a.admin_email}
                className="flex items-center justify-between text-xs bg-slate-800/40 rounded px-2.5 py-1.5"
              >
                <span className="text-slate-300 truncate flex-1">{a.admin_email}</span>
                <span className="font-mono text-slate-400 ml-2">
                  {a.count} · {formatUSD(a.spent_usd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All time */}
      <div className="border-t border-slate-700 pt-3 flex justify-between text-[11px] text-slate-500">
        <span>All-time total</span>
        <span className="font-mono">
          {formatUSD(data.all_time.total_spent_usd)} · {data.all_time.total_count} images
        </span>
      </div>
    </div>
  );
}