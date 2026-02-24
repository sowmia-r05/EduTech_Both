import React from "react";
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
  { level: "Easy", score: 92 },
  { level: "Medium", score: 81 },
  { level: "Hard", score: 64 },
];

const recentActivity = [
  {
    subject: "Reading",
    testName: "Comprehension Test 3",
    date: "May 12",
    accuracy: 85,
    timeTaken: "18 min",
    difficulty: "Medium",
  },
  {
    subject: "Language",
    testName: "Grammar Quiz 4",
    date: "May 08",
    accuracy: 72,
    timeTaken: "15 min",
    difficulty: "Hard",
  },
  {
    subject: "Numeracy",
    testName: "Fractions Assessment",
    date: "May 02",
    accuracy: 79,
    timeTaken: "20 min",
    difficulty: "Medium",
  },
    {
    subject: "Writing",
    testName: "Global Summit AI",
    date: "May 02",
    accuracy: 89,
    timeTaken: "20 min",
    difficulty: "Medium",
  },
];

/* ---------------- MAIN COMPONENT ---------------- */

export default function ParentDashboard() {
  const overallAverage =
    comparisonData.reduce((acc, s) => acc + s.score, 0) /
    comparisonData.length;

  const strongest =
    comparisonData.reduce((prev, curr) =>
      curr.score > prev.score ? curr : prev
    ).subject;

  const weakest =
    comparisonData.reduce((prev, curr) =>
      curr.score < prev.score ? curr : prev
    ).subject;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="max-w-screen-2xl mx-auto px-8 py-6 space-y-6">

        {/* ---------------- HEADER ---------------- */}
        {/* ---------------- HEADER ---------------- */}
<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">

  {/* LEFT SIDE */}
  <div>
    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
      Vishaka Radha
    </h1>
    <p className="text-slate-500 mt-1 text-sm">
      Year 3 • Academic Performance Overview
    </p>
  </div>

  {/* RIGHT SIDE */}
  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">

    <select className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <option>Last 30 Days</option>
      <option>This Term</option>
      <option>This Year</option>
    </select>

    <button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow-sm hover:bg-indigo-700 transition-all">
      Download Report
    </button>

    <button className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium shadow-sm hover:bg-rose-700 transition-all">
      Logout
    </button>

  </div>
</div>

        {/* ---------------- KPI CARDS ---------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">

          <KPI
            title="Overall Average"
            value={`${overallAverage.toFixed(0)}%`}
            trend="+5% from last term"
          />

          <KPI
            title="Strongest Subject"
            value={strongest}
            trend="Consistent growth"
            positive
          />

          <KPI
            title="Needs Attention"
            value={weakest}
            trend="Below target"
            negative
          />

          <KPI
            title="Total Assessments"
            value="24"
            trend="This term"
          />

        </div>

        {/* ---------------- ANALYTICS ROW ---------------- */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* PERFORMANCE TREND */}
          <div className="xl:col-span-2 bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold mb-6 text-slate-800">
              Performance Trend
            </h2>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" />
                <XAxis dataKey="month" stroke="#94A3B8" />
                <YAxis domain={[0, 100]} stroke="#94A3B8" />
                <Tooltip />
                <Line type="monotone" dataKey="Language" stroke="#6366F1" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="Numeracy" stroke="#10B981" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="Reading" stroke="#F59E0B" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="Writing" stroke="#D46B6B" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* SUBJECT COMPARISON */}
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold mb-6 text-slate-800">
              Subject Comparison
            </h2>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" />
                <XAxis dataKey="subject" stroke="#94A3B8" />
                <YAxis domain={[0, 100]} stroke="#94A3B8" />
                <Tooltip />
                <Bar dataKey="score" fill="#6366F1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ---------------- SECOND ROW ---------------- */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ACADEMIC SUMMARY */}
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold text-slate-800">
              Academic Summary
            </h2>

            <Summary label="Target Average" value="85%" />
            <Summary label="Term Improvement" value="+10%" positive />
            <Summary label="Completed Quizzes" value="24" />
            <Summary label="Subjects Active" value="3" />

            <div>
              <p className="text-xs text-slate-500 mb-2">
                Progress Toward Target
              </p>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                  style={{ width: `${overallAverage}%` }}
                />
              </div>
            </div>
          </div>

          {/* DIFFICULTY BREAKDOWN */}
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold mb-6 text-slate-800">
              Difficulty Breakdown
            </h2>

            {difficultyData.map((item, i) => (
              <div key={i} className="mb-5">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{item.level}</span>
                  <span className="font-medium text-slate-900">
                    {item.score}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* INSIGHTS PANEL */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl p-8 shadow-lg">
            <h2 className="text-lg font-semibold mb-6">
              Performance Insights
            </h2>

            <ul className="space-y-3 text-sm leading-relaxed">
              <li>• Reading performance has steadily improved.</li>
              <li>• Language remains below target benchmark.</li>
              <li>• Hard-level assessments need reinforcement.</li>
              <li>• Completion time improving consistently.</li>
            </ul>
          </div>
        </div>

        {/* ---------------- RECENT TABLE ---------------- */}
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-6 text-slate-800">
            Recent Assessments
          </h2>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wide">
                <tr>
                  <th className="py-4 px-6 text-left">Subject</th>
                  <th className="px-6 text-left">Test</th>
                  <th className="px-6 text-left">Date</th>
                  <th className="px-6 text-left">Accuracy</th>
                  <th className="px-6 text-left">Time</th>
                  <th className="px-6 text-left">Difficulty</th>
                  <th className="px-6 text-left">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {recentActivity.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition">
                    <td className="py-4 px-6 font-medium text-slate-800">
                      {row.subject}
                    </td>
                    <td className="px-6">{row.testName}</td>
                    <td className="px-6 text-slate-500">{row.date}</td>
                    <td className="px-6 font-semibold">{row.accuracy}%</td>
                    <td className="px-6 text-slate-500">{row.timeTaken}</td>
                    <td className="px-6 text-slate-600">{row.difficulty}</td>
<td className="px-6">
  <button
    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition"
    onClick={() => console.log("Go to Quiz")}
  >
    Go to Quiz
  </button>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      </div>
  );
}

/* ---------------- REUSABLE COMPONENTS ---------------- */

function KPI({ title, value, trend, positive, negative }) {
  return (
    <div className="relative bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t-2xl"></div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="text-2xl font-semibold mt-3 text-slate-900">{value}</p>
      <p
        className={`text-xs mt-2 ${
          positive
            ? "text-emerald-600"
            : negative
            ? "text-rose-600"
            : "text-slate-500"
        }`}
      >
        {trend}
      </p>
    </div>
  );
}

function Summary({ label, value, positive }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${positive ? "text-emerald-600" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}