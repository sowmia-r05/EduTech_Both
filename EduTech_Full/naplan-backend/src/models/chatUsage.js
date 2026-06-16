/**
 * ChatUsageWidget.jsx
 *
 * Admin dashboard panel: AI tutor (chat) token usage + USD cost,
 * for today / this month / all time. Mirrors AIUsageWidget.
 *
 * Usage:
 *   import ChatUsageWidget from "./ChatUsageWidget";
 *   <ChatUsageWidget />
 *
 * Place in: src/app/components/admin/ChatUsageWidget.jsx
 */

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

function usd(n) {
  const v = Number(n) || 0;
  // show more precision for tiny amounts
  return v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}
function num(n) {
  return (Number(n) || 0).toLocaleString();
}

export default function ChatUsageWidget({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API}/api/admin/chat-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Failed to load chat usage");
      setData(j);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage, refreshKey]);

  if (loading && !data) {
    return <div className="text-sm text-slate-500 py-2">Loading AI tutor usage…</div>;
  }
  if (error || !data) {
    return <div className="text-sm text-red-500 py-2">⚠️ {error || "Usage unavailable"}</div>;
  }

  const Stat = ({ label, u }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-800">{usd(u.cost_usd)}</div>
      <div className="mt-1 text-xs text-slate-400">
        {num(u.count)} messages · {num(u.input_tokens + u.output_tokens)} tokens
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <span>✨</span> AI Tutor — usage &amp; cost
        </h3>
        <button
          onClick={fetchUsage}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Today" u={data.today} />
        <Stat label="This month" u={data.this_month} />
        <Stat label="All time" u={data.all_time} />
      </div>

      <div className="text-[11px] text-slate-400">
        {`gemini-2.5-flash-lite · $${data.model_pricing.input_per_m}/M input · $${data.model_pricing.output_per_m}/M output`}
      </div>
    </div>
  );
}