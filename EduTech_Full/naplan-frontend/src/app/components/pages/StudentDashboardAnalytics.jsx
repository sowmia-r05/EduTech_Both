import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

/* ---------------- MOCK DATA ---------------- */

const trendData = [
  { month: "Jan", Language: 60, Numeracy: 70, Reading: 75, Writing: 60 },
  { month: "Feb", Language: 65, Numeracy: 72, Reading: 78, Writing: 60 },
  { month: "Mar", Language: 63, Numeracy: 74, Reading: 80, Writing: 60 },
  { month: "Apr", Language: 68, Numeracy: 76, Reading: 82, Writing: 60 },
  { month: "May", Language: 72, Numeracy: 79, Reading: 85, Writing: 60 },
];

const comparisonData = [
  { subject: "Language", score: 72 },
  { subject: "Numeracy", score: 79 },
  { subject: "Reading", score: 85 },
  { subject: "Writing", score: 70 },
];

const difficultyData = [
  { level: "Easy", score: 92, color: "bg-emerald-500" },
  { level: "Medium", score: 81, color: "bg-amber-500" },
  { level: "Hard", score: 64, color: "bg-rose-500" },
];

const recentActivity = [
  { subject: "Reading", testName: "Comprehension Test 3", date: "May 12", accuracy: 85, timeTaken: "18 min", difficulty: "Medium" },
  { subject: "Language", testName: "Grammar Quiz 4", date: "May 08", accuracy: 72, timeTaken: "15 min", difficulty: "Hard" },
  { subject: "Numeracy", testName: "Fractions Assessment", date: "May 02", accuracy: 79, timeTaken: "20 min", difficulty: "Medium" },
  { subject: "Writing", testName: "Global Summit AI", date: "May 02", accuracy: 89, timeTaken: "20 min", difficulty: "Medium" },
];

/* ---------------- MAIN ---------------- */

export default function StudentDashboardAnalytics() {
  const overallAverage = useMemo(
    () => comparisonData.reduce((a, s) => a + s.score, 0) / comparisonData.length,
    []
  );

  const strongest = useMemo(
    () => comparisonData.reduce((p, c) => (c.score > p.score ? c : p)).subject,
    []
  );

  const weakest = useMemo(
    () => comparisonData.reduce((p, c) => (c.score < p.score ? c : p)).subject,
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-100/40">
      <div className="max-w-screen-2xl mx-auto px-8 py-8 space-y-8">

        {/* HEADER */}
        <header className="flex flex-col lg:flex-row justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Vishaka Radha
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Year 3 • Academic Performance Overview
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-indigo-400 outline-none">
              <option>Last 30 Days</option>
              <option>This Term</option>
              <option>This Year</option>
            </select>
            <button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow hover:bg-indigo-700 transition">
              Download Report
            </button>
            <button className="px-5 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium shadow hover:bg-rose-600 transition">
              Logout
            </button>
          </div>
        </header>

        {/* KPI ROW */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <KPI title="Overall Average" value={`${overallAverage.toFixed(0)}%`} />
          <KPI title="Strongest Subject" value={strongest} accent />
          <KPI title="Needs Attention" value={weakest} warning />
          <KPI title="Total Assessments" value="24" />
        </section>

        {/* ANALYTICS */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* LINE CHART */}
          <Card className="xl:col-span-2">
            <CardTitle>Performance Trend</CardTitle>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    boxShadow: "0 15px 30px rgba(0,0,0,0.08)",
                  }}
                />
                {["Language", "Numeracy", "Reading", "Writing"].map((key, i) => {
                  const colors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444"];
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={colors[i]}
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* BAR CHART */}
          <Card>
            <CardTitle>Subject Comparison</CardTitle>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="subject" stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
                <Bar dataKey="score" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </section>

        {/* SECOND ROW */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          <Card>
            <CardTitle>Academic Summary</CardTitle>
            <div className="space-y-4 text-sm">
              <Summary label="Target Average" value="85%" />
              <Summary label="Term Improvement" value="+10%" positive />
              <Summary label="Completed Quizzes" value="24" />
              <Summary label="Subjects Active" value="4" />
            </div>

            <div className="mt-6">
              <p className="text-xs text-slate-500 mb-2">Progress Toward Target</p>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                  style={{ width: `${overallAverage}%` }}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Difficulty Breakdown</CardTitle>
            <div className="space-y-5">
              {difficultyData.map((item) => (
                <div key={item.level}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{item.level}</span>
                    <span className="font-medium text-slate-900">{item.score}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} transition-all duration-700`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-600/95 to-purple-600/95 text-white shadow-xl">
            <CardTitle light>Performance Insights</CardTitle>
            <ul className="space-y-4 text-sm">
              <li>✓ Reading performance steadily improving</li>
              <li>⚠ Language below target benchmark</li>
              <li>! Hard-level assessments need reinforcement</li>
              <li>✓ Completion time improving consistently</li>
            </ul>
          </Card>
        </section>

        {/* TABLE */}
        <Card>
          <CardTitle>Recent Assessments</CardTitle>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  {["Subject", "Test", "Date", "Accuracy", "Time", "Difficulty", "Action"].map((h) => (
                    <th key={h} className="px-6 py-4 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentActivity.map((row, i) => (
                  <tr key={i} className="hover:bg-indigo-50/40 transition">
                    <td className="px-6 py-4 font-medium">{row.subject}</td>
                    <td className="px-6">{row.testName}</td>
                    <td className="px-6 text-slate-500">{row.date}</td>
                    <td className="px-6 font-semibold">{row.accuracy}%</td>
                    <td className="px-6 text-slate-500">{row.timeTaken}</td>
                    <td className="px-6">{row.difficulty}</td>
                    <td className="px-6">
                      <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition">
                        View Quiz
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
}

/* ---------------- UI COMPONENTS ---------------- */

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-8 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, light }) {
  return (
    <h2 className={`text-lg font-semibold mb-6 ${light ? "text-white" : "text-slate-800"}`}>
      {children}
    </h2>
  );
}

function KPI({ title, value, accent, warning }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      <p className="text-xs uppercase tracking-wider text-slate-400">{title}</p>
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

function Summary({ label, value, positive }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${positive ? "text-emerald-600" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}