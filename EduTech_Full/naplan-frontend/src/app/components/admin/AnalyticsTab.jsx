/**
 * AnalyticsTab.jsx — engagement cohorts for the admin dashboard (ENGAGE-1)
 *
 * Reads:
 *   GET /api/admin/analytics/engagement
 *   GET /api/admin/analytics/engagement/:cohort?page=N
 *
 * ⚠️ adminFetch IS A REQUIRED PROP — do not define a local copy.
 *    AdminDashboard.jsx, ManualQuizCreator.jsx and QuizDetailModal.jsx each
 *    carry their own adminFetch, and they DISAGREE: ManualQuizCreator uses
 *    `credentials: "include"` (the migrated httpOnly-cookie path) while
 *    QuizDetailModal still sends a localStorage bearer token. Adding a fourth
 *    variant here would guarantee this tab breaks on whichever half of the
 *    LS-TOKEN migration lands last. Take the parent's.
 *
 * Place in: src/app/components/admin/AnalyticsTab.jsx
 */

import { useState, useEffect, useCallback } from "react";

const COHORT_META = {
  never_logged_in: {
    label: "Never logged in",
    hint: "Paid, credentials never used",
    tone: "rose",
  },
  logged_in_never_quizzed: {
    label: "Logged in, never quizzed",
    hint: "Opened it and bounced",
    tone: "rose",
  },
  dormant: {
    label: "Dormant · 14d",
    hint: "Re-engagement target",
    tone: "amber",
  },
  lapsed: {
    label: "Lapsed · 30d",
    hint: "Chargeback risk",
    tone: "amber",
  },
  stalled: {
    label: "Stalled mid-quiz",
    hint: "Check device breakdown",
    tone: "slate",
  },
  active: {
    label: "Active",
    hint: "Submitted work recently",
    tone: "emerald",
  },
};

const TONE_DOT = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  slate: "bg-slate-500",
  emerald: "bg-emerald-500",
};

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysSince(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function Stat({ label, value, tone = "text-indigo-400" }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

export default function AnalyticsTab({ adminFetch }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openCohort, setOpenCohort] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await adminFetch("/api/admin/analytics/engagement");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed to load analytics (${res.status})`);
      }
      setSummary(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadCohort = useCallback(
    async (cohort, pageNum) => {
      try {
        setDetailLoading(true);
        const res = await adminFetch(
          `/api/admin/analytics/engagement/${cohort}?page=${pageNum}&limit=25`,
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed to load cohort (${res.status})`);
        }
        setDetail(await res.json());
      } catch (err) {
        setError(err.message);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [adminFetch],
  );

  const handleCohortClick = (cohort) => {
    if (openCohort === cohort) {
      setOpenCohort(null);
      setDetail(null);
      return;
    }
    setOpenCohort(cohort);
    setPage(1);
    loadCohort(cohort, 1);
  };

  const goPage = (n) => {
    setPage(n);
    loadCohort(openCohort, n);
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-400">Loading analytics…</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="bg-slate-900 border border-rose-900/50 rounded-xl p-6">
        <p className="text-sm text-rose-400">{error}</p>
        <button
          onClick={loadSummary}
          className="mt-3 px-3 py-1.5 text-xs font-medium text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white rounded-lg transition"
        >
          Try again
        </button>
      </div>
    );
  }

  const cohorts = summary?.cohorts || {};
  const fb = summary?.ai_feedback || {};
  const failTone =
    fb.failure_rate_pct > 5
      ? "text-rose-400"
      : fb.failure_rate_pct > 1
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          {summary?.cached ? "Cached · " : ""}
          generated {fmtDate(summary?.generated_at)}
        </p>
        <button
          onClick={loadSummary}
          className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Active" value={cohorts.active ?? 0} tone="text-emerald-400" />
        <Stat label="Total children" value={summary?.total_children ?? 0} />
        <Stat
          label="Need attention"
          value={
            (cohorts.never_logged_in ?? 0) +
            (cohorts.logged_in_never_quizzed ?? 0) +
            (cohorts.lapsed ?? 0)
          }
          tone="text-rose-400"
        />
        <Stat
          label="AI feedback failures"
          value={`${fb.failure_rate_pct ?? 0}%`}
          tone={failTone}
        />
      </div>

      {fb.failed > 0 && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-300">
            {fb.failed} of {fb.total} submissions have no AI feedback. Those
            parents paid for something they did not receive.
          </p>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {Object.keys(COHORT_META).map((key, i) => {
          const meta = COHORT_META[key];
          const count = cohorts[key] ?? 0;
          const isOpen = openCohort === key;
          return (
            <div key={key}>
              <button
                onClick={() => handleCohortClick(key)}
                disabled={count === 0}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition ${
                  i > 0 ? "border-t border-slate-800" : ""
                } ${count === 0 ? "opacity-40 cursor-default" : "hover:bg-slate-800/50"}`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-none ${TONE_DOT[meta.tone]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white">{meta.label}</span>
                  <span className="block text-xs text-slate-500">{meta.hint}</span>
                </span>
                <span className="text-sm font-semibold text-white">{count}</span>
                <span className="text-slate-600 text-xs">{isOpen ? "▲" : "▶"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-4">
                  {detailLoading && (
                    <p className="text-xs text-slate-500">Loading…</p>
                  )}

                  {!detailLoading && detail?.results?.length === 0 && (
                    <p className="text-xs text-slate-500">No children here.</p>
                  )}

                  {!detailLoading && detail?.results?.length > 0 && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 uppercase tracking-wide">
                              <th className="text-left font-medium pb-2">Child</th>
                              <th className="text-left font-medium pb-2">Year</th>
                              <th className="text-left font-medium pb-2">
                                Last activity
                              </th>
                              <th className="text-left font-medium pb-2">
                                Last login
                              </th>
                              <th className="text-right font-medium pb-2">
                                Logins
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.results.map((c) => {
                              const d = daysSince(c.last_activity_at);
                              return (
                                <tr
                                  key={c.child_id}
                                  className="border-t border-slate-800/60"
                                >
                                  <td className="py-2 pr-3">
                                    <span className="text-white">
                                      {c.display_name || c.username}
                                    </span>
                                    <span className="text-slate-600 ml-1.5">
                                      @{c.username}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 text-slate-400">
                                    {c.year_level}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-400">
                                    {fmtDate(c.last_activity_at)}
                                    {d !== null && (
                                      <span className="text-slate-600 ml-1">
                                        ({d}d)
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-400">
                                    {fmtDate(c.last_login_at)}
                                  </td>
                                  <td className="py-2 text-right text-slate-400">
                                    {c.login_count}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {detail.pages > 1 && (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => goPage(page - 1)}
                            disabled={page <= 1}
                            className="px-2.5 py-1 text-xs text-slate-400 border border-slate-700 rounded disabled:opacity-30 hover:border-slate-500 transition"
                          >
                            Prev
                          </button>
                          <span className="text-xs text-slate-500">
                            Page {detail.page} of {detail.pages} · {detail.total}{" "}
                            total
                          </span>
                          <button
                            onClick={() => goPage(page + 1)}
                            disabled={page >= detail.pages}
                            className="px-2.5 py-1 text-xs text-slate-400 border border-slate-700 rounded disabled:opacity-30 hover:border-slate-500 transition"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Login stamping started when last_login_at shipped, so children who have
        not signed in since then show no login date. Treat the login columns as
        incomplete for roughly two weeks. Activity counts both quiz attempts and
        writing submissions.
      </p>
    </div>
  );
}