import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const SUBJECTS = ["Reading", "Writing", "Numeracy", "Language"];
const SUBJECT_COLORS = {
  Reading: "#6366F1",
  Writing: "#EF4444",
  Numeracy: "#10B981",
  Language: "#F59E0B",
};

const TIME_FILTERS = [
  { label: "This Week", days: 7 },
  { label: "This Month", days: 30 },
  { label: "Last 3 Months", days: 90 },
  { label: "All Time", days: Infinity },
];

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function buildTrendData(tests) {
  if (!tests.length) return [];

  const monthMap = {};

  tests.forEach((t) => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });

    if (!monthMap[key]) {
      monthMap[key] = { key, month: label };
      SUBJECTS.forEach((s) => {
        monthMap[key][`${s}_sum`] = 0;
        monthMap[key][`${s}_count`] = 0;
      });
    }

    const subj = t.subject;
    if (SUBJECTS.includes(subj)) {
      monthMap[key][`${subj}_sum`] += t.score;
      monthMap[key][`${subj}_count`] += 1;
    }
  });

  return Object.values(monthMap)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => {
      const point = { month: m.month };
      SUBJECTS.forEach((s) => {
        point[s] = m[`${s}_count`] > 0 ? Math.round(m[`${s}_sum`] / m[`${s}_count`]) : null;
      });
      return point;
    });
}

function buildSubjectComparison(tests) {
  return SUBJECTS.map((subj) => {
    const subjectTests = tests.filter((t) => t.subject === subj);
    const avg = subjectTests.length
      ? Math.round(subjectTests.reduce((s, t) => s + t.score, 0) / subjectTests.length)
      : 0;
    return { subject: subj, score: avg, count: subjectTests.length };
  });
}

function buildDifficultyBreakdown(tests) {
  const easy = tests.filter((t) => t.score >= 80);
  const medium = tests.filter((t) => t.score >= 50 && t.score < 80);
  const hard = tests.filter((t) => t.score < 50);

  return [
    {
      level: "High Scores (80%+)",
      count: easy.length,
      avgScore: easy.length ? Math.round(easy.reduce((a, t) => a + t.score, 0) / easy.length) : 0,
      color: "bg-emerald-500",
    },
    {
      level: "Mid Scores (50–79%)",
      count: medium.length,
      avgScore: medium.length ? Math.round(medium.reduce((a, t) => a + t.score, 0) / medium.length) : 0,
      color: "bg-amber-500",
    },
    {
      level: "Needs Work (<50%)",
      count: hard.length,
      avgScore: hard.length ? Math.round(hard.reduce((a, t) => a + t.score, 0) / hard.length) : 0,
      color: "bg-rose-500",
    },
  ];
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT

   Props:
   - tests          : Array of { id, subject, name, score, date, grade, duration, ... }
   - displayName    : string
   - yearLevel      : string | number | null
   - onBack         : () => void  (optional callback for "Back to Dashboard")
   - onLogout       : () => void  (optional callback for "Logout")
   - embedded       : boolean     (true when rendered inside ChildDashboard's
                                   analytics view — hides Back button since
                                   ChildDashboard already shows its own sticky nav)
   ═══════════════════════════════════════════════════════════ */

export default function StudentDashboardAnalytics({
  tests = [],
  displayName = "Student",
  yearLevel = null,
  onBack = null,
  onLogout = null,
  embedded = false,
}) {
  const navigate = useNavigate();
  const { logout, logoutChild, childToken, parentToken } = useAuth();

  const [timeFilter, setTimeFilter] = useState(3); // default "All Time"

  /* ─── Fallback handlers when used as standalone route ─── */
  const handleBack = onBack || (() => {
    if (childToken) {
      navigate("/child-dashboard");
    } else if (parentToken) {
      navigate("/parent-dashboard");
    } else {
      navigate("/");
    }
  });

  const handleLogout = onLogout || (() => {
    if (childToken) {
      logoutChild();
    } else {
      logout();
    }
    navigate("/");
  });

  /* ─── Filter tests by time window ─── */
  const filteredTests = useMemo(() => {
    const { days } = TIME_FILTERS[timeFilter];
    if (days === Infinity) return tests;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return tests.filter((t) => new Date(t.date) >= cutoff);
  }, [tests, timeFilter]);

  const hasData = filteredTests.length > 0;

  /* ─── Computed analytics ─── */
  const overallAverage = useMemo(() => {
    if (!filteredTests.length) return 0;
    return Math.round(filteredTests.reduce((a, t) => a + t.score, 0) / filteredTests.length);
  }, [filteredTests]);

  const comparisonData = useMemo(() => buildSubjectComparison(filteredTests), [filteredTests]);

  const strongest = useMemo(() => {
    const withData = comparisonData.filter((c) => c.count > 0);
    if (!withData.length) return "—";

    const best = withData.reduce((p, c) => (c.score > p.score ? c : p));

    // ✅ FIX: Don't show "strongest" if:
    //  1. Only 1 subject has data (same subject can't be both strongest & weakest)
    //  2. Best score is below 50% (a failing score is NOT a strength)
    if (withData.length <= 1) return "—";
    if (best.score < 50) return "—";

    return best.subject;
  }, [comparisonData]);

  const weakest = useMemo(() => {
    const withData = comparisonData.filter((c) => c.count > 0);
    if (!withData.length) return "—";
    return withData.reduce((p, c) => (c.score < p.score ? c : p)).subject;
  }, [comparisonData]);

  const trendData = useMemo(() => buildTrendData(filteredTests), [filteredTests]);
  const difficultyData = useMemo(() => buildDifficultyBreakdown(filteredTests), [filteredTests]);

  const recentAssessments = useMemo(() => {
    return [...filteredTests]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
  }, [filteredTests]);

  const improvement = useMemo(() => {
    if (filteredTests.length < 2) return null;
    const sorted = [...filteredTests].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    const avgFirst = firstHalf.reduce((a, t) => a + t.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, t) => a + t.score, 0) / secondHalf.length;
    return Math.round(avgSecond - avgFirst);
  }, [filteredTests]);

  const activeSubjects = useMemo(
    () => comparisonData.filter((c) => c.count > 0).length,
    [comparisonData]
  );

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-8 space-y-8">

        {/* ──────────── HEADER ──────────── */}
        <header className="flex flex-col lg:flex-row justify-between gap-6 pb-6 border-b border-slate-200">

          {/* Left: Back arrow + name */}
          <div className="flex items-start gap-4">
            {!embedded && (
              <button
                onClick={handleBack}
                className="mt-1 inline-flex items-center justify-center w-10 h-10 rounded-xl
                           bg-white border border-slate-200 shadow-sm
                           hover:bg-slate-50 hover:border-slate-300 transition-all"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {displayName}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {yearLevel ? `Year ${yearLevel} • ` : ""}Academic Performance Overview
              </p>
            </div>
          </div>

          {/* Right: Time filters + action buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">

            {/* Time filter pills */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              {TIME_FILTERS.map((f, i) => (
                <button
                  key={f.label}
                  onClick={() => setTimeFilter(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                    ${timeFilter === i
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {!embedded && (
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                             bg-white border border-slate-200 text-slate-700 shadow-sm
                             hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Dashboard
                </button>
              )}

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                           bg-rose-500 text-white shadow-sm
                           hover:bg-rose-600 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* ──────────── KPI ROW ──────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {hasData ? (
            <>
              <KPI title="Overall Average" value={`${overallAverage}%`} />
              <KPI title="Strongest Subject" value={strongest} accent />
              <KPI title="Needs Attention" value={weakest} warning />
              <KPI title="Total Assessments" value={String(filteredTests.length)} />
            </>
          ) : (
            <>
              <KPISkeleton />
              <KPISkeleton />
              <KPISkeleton />
              <KPISkeleton />
            </>
          )}
        </section>

        {/* ──────────── CHARTS ROW ──────────── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* AREA CHART — Performance Trend */}
          <Card className="xl:col-span-2">
            <CardTitle>Performance Trend</CardTitle>
            {hasData && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={trendData}>
                  <defs>
                    {SUBJECTS.map((key) => (
                      <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={SUBJECT_COLORS[key]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "none",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                      padding: "12px 16px",
                    }}
                    formatter={(value, name) => [`${value}%`, name]}
                  />
                  {SUBJECTS.map((key) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={SUBJECT_COLORS[key]}
                      strokeWidth={2.5}
                      fill={`url(#gradient-${key})`}
                      dot={{ r: 4, fill: SUBJECT_COLORS[key] }}
                      activeDot={{ r: 6 }}
                      connectNulls={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartSkeleton message="Take some tests to see your performance trend over time" />
            )}
          </Card>

          {/* BAR CHART — Subject Comparison */}
          <Card>
            <CardTitle>Subject Comparison</CardTitle>
            {hasData ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="subject" stroke="#94a3b8" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Average"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "none",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                    }}
                  />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="score" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartSkeleton message="Complete tests in different subjects to compare" />
            )}
          </Card>
        </section>

        {/* ──────────── SECOND ROW ──────────── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Academic Summary */}
          <Card>
            <CardTitle>Academic Summary</CardTitle>
            {hasData ? (
              <>
                <div className="space-y-4 text-sm">
                  <SummaryRow label="Overall Average" value={`${overallAverage}%`} />
                  {improvement !== null && (
                    <SummaryRow
                      label="Improvement"
                      value={`${improvement >= 0 ? "+" : ""}${improvement}%`}
                      positive={improvement >= 0}
                    />
                  )}
                  <SummaryRow label="Completed Tests" value={String(filteredTests.length)} />
                  <SummaryRow label="Subjects Active" value={String(activeSubjects)} />
                </div>

                <div className="mt-6">
                  <p className="text-xs text-slate-500 mb-2">Progress Toward Target (85%)</p>
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 rounded-full"
                      style={{ width: `${Math.min((overallAverage / 85) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {overallAverage >= 85 ? "Target reached!" : `${Math.max(0, 85 - overallAverage)}% to go`}
                  </p>
                </div>
              </>
            ) : (
              <SummarySkeleton />
            )}
          </Card>

          {/* Score Distribution */}
          <Card>
            <CardTitle>Score Distribution</CardTitle>
            {hasData ? (
              <div className="space-y-5">
                {difficultyData.map((item) => (
                  <div key={item.level}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600">{item.level}</span>
                      <span className="font-semibold text-slate-900">
                        {item.count} test{item.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-700`}
                        style={{
                          width: filteredTests.length
                            ? `${(item.count / filteredTests.length) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <DistributionSkeleton />
            )}
          </Card>

          {/* Performance Insights */}
          <Card
            className={
              hasData
                ? "bg-gradient-to-br from-indigo-600/95 to-purple-600/95 text-white shadow-xl"
                : ""
            }
          >
            <CardTitle light={hasData}>Performance Insights</CardTitle>
            {hasData ? (
              <ul className="space-y-4 text-sm leading-relaxed">
                {strongest !== "—" && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">✓</span>
                    <span>{strongest} is your strongest subject — keep it up!</span>
                  </li>
                )}
                {weakest !== "—" && weakest !== strongest && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">⚠</span>
                    <span>{weakest} needs more practice — focus on this area</span>
                  </li>
                )}
                {improvement !== null && improvement > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">📈</span>
                    <span>Your scores improved by {improvement}% — great progress!</span>
                  </li>
                )}
                {improvement !== null && improvement <= 0 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">💪</span>
                    <span>Keep practising consistently to see improvement</span>
                  </li>
                )}
                {filteredTests.length >= 5 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">🎯</span>
                    <span>You've completed {filteredTests.length} tests — dedication pays off!</span>
                  </li>
                )}
                {activeSubjects < 4 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5">📝</span>
                    <span>Try tests in more subjects to build a complete picture</span>
                  </li>
                )}
              </ul>
            ) : (
              <InsightsSkeleton />
            )}
          </Card>
        </section>

        {/* ──────────── RECENT ASSESSMENTS TABLE ──────────── */}
        <Card>
          <CardTitle>Recent Assessments</CardTitle>
          {hasData ? (
            <div className="overflow-x-auto">
              <div className="overflow-hidden rounded-xl border border-slate-200 min-w-[700px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider">
                    <tr>
                      {["Subject", "Test Name", "Date", "Score", "Duration", "Grade"].map((h) => (
                        <th key={h} className="px-6 py-4 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentAssessments.map((row, i) => (
                      <tr key={row.id || i} className="hover:bg-indigo-50/40 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: SUBJECT_COLORS[row.subject] || "#94a3b8" }}
                            />
                            <span className="font-medium text-slate-800">{row.subject}</span>
                          </span>
                        </td>
                        <td className="px-6 text-slate-700 max-w-[200px] truncate">
                          {row.name || row.quiz_name}
                        </td>
                        <td className="px-6 text-slate-500">
                          {new Date(row.date).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-6">
                          <span
                            className={`font-semibold ${
                              row.score >= 80
                                ? "text-emerald-600"
                                : row.score >= 50
                                  ? "text-amber-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {row.score}%
                          </span>
                        </td>
                        <td className="px-6 text-slate-500">{formatDuration(row.duration)}</td>
                        <td className="px-6">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                              row.grade === "A" || row.grade === "A+"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.grade === "B" || row.grade === "B+"
                                  ? "bg-blue-50 text-blue-700"
                                  : row.grade === "C" || row.grade === "C+"
                                    ? "bg-amber-50 text-amber-700"
                                    : row.grade
                                      ? "bg-slate-50 text-slate-600"
                                      : "text-slate-400"
                            }`}
                          >
                            {row.grade || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <TableSkeleton />
          )}
        </Card>

        {/* ──────────── EMPTY STATE CTA ──────────── */}
        {!hasData && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 mb-4">
              <svg
                className="w-8 h-8 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Analytics Yet</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Once you complete your first test, your results and cumulative performance will appear
              here. Start a quiz to unlock your analytics!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   UI COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, light }) {
  return (
    <h2 className={`text-lg font-semibold mb-6 ${light ? "text-white/90" : "text-slate-800"}`}>
      {children}
    </h2>
  );
}

function KPI({ title, value, accent, warning }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{title}</p>
      <p
        className={`text-3xl font-bold mt-3 ${
          accent ? "text-indigo-600" : warning ? "text-rose-500" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryRow({ label, value, positive }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600">{label}</span>
      <span
        className={`font-semibold ${
          positive === true ? "text-emerald-600" : positive === false ? "text-rose-500" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SKELETON COMPONENTS — shown when no data
   ═══════════════════════════════════════════════════════════ */

function SkeletonPulse({ className = "" }) {
  return <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />;
}

function KPISkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <SkeletonPulse className="h-3 w-24 mb-4" />
      <SkeletonPulse className="h-8 w-16" />
    </div>
  );
}

function ChartSkeleton({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] text-center">
      <div className="flex items-end gap-3 mb-6">
        {[40, 65, 45, 75, 55].map((h, i) => (
          <div
            key={i}
            className="w-8 bg-slate-100 rounded-md animate-pulse"
            style={{ height: h, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <p className="text-sm text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex justify-between">
          <SkeletonPulse className="h-4 w-28" />
          <SkeletonPulse className="h-4 w-12" />
        </div>
      ))}
      <div className="mt-6">
        <SkeletonPulse className="h-2 w-full mt-2" />
      </div>
    </div>
  );
}

function DistributionSkeleton() {
  return (
    <div className="space-y-5">
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <div className="flex justify-between mb-1.5">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="h-4 w-16" />
          </div>
          <SkeletonPulse className="h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-2">
          <SkeletonPulse className="h-4 w-4 mt-0.5 rounded" />
          <SkeletonPulse className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="bg-slate-50 px-6 py-4 flex gap-12">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonPulse key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="px-6 py-4 flex gap-12">
            {[1, 2, 3, 4, 5, 6].map((col) => (
              <SkeletonPulse key={col} className="h-4 w-16" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
