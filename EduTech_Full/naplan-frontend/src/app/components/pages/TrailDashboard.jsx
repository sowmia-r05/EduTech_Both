import { useMemo } from "react";
import StatCard from "@/app/components/dashboardComponents/StatCard";
import AICoachPanel from "@/app/components/dashboardComponents/AICoachPanel";
import DonutScoreChart from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import AISuggestionPanel from "@/app/components/dashboardComponents/AISuggestionPanel";
import AvatarMenu from "@/app/components/dashboardComponents/AvatarMenu";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";

/* -------------------- MOCK DATA -------------------- */

const mockResult = {
  quiz_name: "NAPLAN Practice Test",
  attempt: 2,
  duration: 1850,
  score: {
    percentage: 72,
    grade: "B",
  },
  topicBreakdown: {
    Vocabulary: { total: 20, scored: 16 },
    Grammar: { total: 15, scored: 8 },
    Comprehension: { total: 25, scored: 20 },
    Paraphrasing: { total: 10, scored: 4 },
  },
  ai_feedback: {
    overall_feedback:
      "Good progress overall. Focus more on grammar accuracy and paraphrasing.",
    strengths: ["Strong vocabulary usage", "Good reading comprehension"],
    weaknesses: ["Grammar inconsistencies", "Paraphrasing accuracy"],
    study_tips: [
      "Practice sentence transformation daily",
      "Review common grammar structures",
    ],
  },
  user: {
    first_name: "John",
    last_name: "Doe",
  },
};

/* -------------------- Helpers -------------------- */

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

const buildTopicStrength = (topicBreakdown = {}) => {
  const strong = [];
  const weak = [];

  Object.entries(topicBreakdown).forEach(([topic, v]) => {
    const accuracy = v.scored / v.total;
    if (accuracy >= 0.75) strong.push({ topic, accuracy });
    else weak.push({ topic, lostMarks: v.total - v.scored });
  });

  return { strongTopics: strong, weakTopics: weak };
};

/* -------------------- Component -------------------- */

export default function TrailDashboard() {
  const percentage = mockResult.score.percentage;
  const duration = formatDuration(mockResult.duration);
  const displayName = `${mockResult.user.first_name} ${mockResult.user.last_name}`;

  const { strongTopics, weakTopics } = useMemo(
    () => buildTopicStrength(mockResult.topicBreakdown),
    []
  );

  return (
    <div className="relative min-h-screen bg-gray-100">

      {/* 🔒 UNLOCK OVERLAY */}
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-white text-center px-6">
        <div className="bg-white text-gray-900 p-8 rounded-2xl shadow-2xl max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">🔒 Unlock Your Dashboard</h2>
          <p className="mb-6 text-gray-600">
            Upgrade your plan to unlock detailed analytics, AI insights,
            performance charts, and personalized study recommendations.
          </p>
          <button className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition">
            Unlock to Watch Dashboard
          </button>
        </div>
      </div>

      {/* 🔹 Blurred Dashboard Content */}
      <div className="blur-md pointer-events-none select-none">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 mb-4">
          <h1 className="text-3xl font-bold">
            <span className="text-blue-600">{displayName} -</span>{" "}
            <span className="text-purple-600">
              {mockResult.quiz_name} Report
            </span>
          </h1>
          <AvatarMenu />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-12 gap-4 px-6 pb-6">

          {/* Stat Cards */}
          <div className="col-span-7 grid grid-cols-4 gap-4">
            <StatCard title="Overall Score" value={`${percentage}%`} />
            <StatCard title="Time Spent" value={duration} />
            <StatCard title="Result" value={mockResult.score.grade} />
            <StatCard title="Attempts Used" value={mockResult.attempt} />
          </div>

          {/* AI Coach */}
          <div className="col-span-5 row-span-3">
            <AICoachPanel
              feedback={mockResult.ai_feedback}
              strongTopics={strongTopics}
              weakTopics={weakTopics}
            />
          </div>

          {/* Donut Chart */}
          <div className="col-span-3">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <DonutScoreChart
                correctPercent={percentage}
                incorrectPercent={100 - percentage}
              />
            </div>
          </div>

          {/* Weak Topics */}
          <div className="col-span-4">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <WeakTopicsBarChart topics={weakTopics} />
            </div>
          </div>

          {/* Top Topics */}
          <div className="col-span-3">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <TopTopicsFunnelChart
                topicBreakdown={mockResult.topicBreakdown}
                topN={5}
                height={250}
                title="Top 5 Topics"
              />
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="col-span-4">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <AISuggestionPanel
                suggestions={[
                  { title: "Focus Area", description: "Improve grammar accuracy" },
                  { title: "Tip", description: "Practice paraphrasing daily" },
                ]}
                studyTips={mockResult.ai_feedback.study_tips}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
