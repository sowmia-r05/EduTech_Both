/**
 * ParentAccessAnalytics.jsx
 *
 * Admin view: which parents have USED the platform vs signed up and never
 * returned. Backed by GET /api/admin/analytics/parents.
 */

import { useState, useEffect, useMemo } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
}

function StatCard({ label, value, tone }) {
  const tones = {
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    slate: "border-slate-700 bg-slate-800/60 text-slate-300",
  };
  return (
    <div className={`rounded-2xl border px-5 py-4 ${tones[tone] || tones.slate}`}>
      <p className="text-[11px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function SignalChip({ on, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
        on
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
          : "bg-slate-700/40 text-slate-500 border border-slate-700"
      }`}
    >
      {on ? "✓" : "–"} {children}
    </span>
  );
}

export default function ParentAccessAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("used"); // "used" | "not_used"
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    adminFetch("/api/admin/analytics/parents")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d))))
      .then(setData)
      .catch((e) => setError(e.error || "Failed to load analytics"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = tab === "used" ? data.used : data.not_used;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.email?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q),
    );
  }, [data, tab, search]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminFetch("/api/admin/analytics/parents/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parent-access-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
        <button
          onClick={load}
          className="mt-3 px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Parent Access</h1>
          <p className="text-xs text-slate-500 mt-1">
            Used = logged in, purchased, or a child with quiz/login activity.
            Generated {new Date(data.generated_at).toLocaleString()}.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg whitespace-nowrap"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Considered" value={t.parents_considered} tone="slate" />
        <StatCard label="Used" value={t.used} tone="green" />
        <StatCard label="Not used" value={t.not_used} tone="amber" />
      </div>

      <div className="flex items-center gap-2 mb-4">
        {[
          ["used", `Used (${t.used})`],
          ["not_used", `Not used (${t.not_used})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === key
                ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                : "bg-slate-800/60 border border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or name…"
          className="ml-auto w-64 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Parent</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              {tab === "used" && (
                <th className="text-left px-4 py-2.5 font-medium">Signals</th>
              )}
              <th className="text-left px-4 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No parents in this group.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.parent_id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <p className="text-white">{r.name || "—"}</p>
                    <p className="text-[11px] text-slate-500">{r.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/40 text-slate-300 border border-slate-700 capitalize">
                      {r.status}
                    </span>
                  </td>
                  {tab === "used" && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <SignalChip on={r.signals.logged_in}>login</SignalChip>
                        <SignalChip on={r.signals.purchased}>paid</SignalChip>
                        <SignalChip on={r.signals.child_activity}>quiz</SignalChip>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}