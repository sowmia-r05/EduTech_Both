import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import StatCard from "@/app/components/dashboardComponents/StatCard";
import AICoachPanel from "@/app/components/dashboardComponents/AICoachPanel";
import DonutScoreChart from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import AISuggestionPanel from "@/app/components/dashboardComponents/AISuggestionPanel";
import AvatarMenu from "@/app/components/dashboardComponents/AvatarMenu";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";
import DateRangeFilter from "@/app/components/dashboardComponents/DateRangeFilter";
import DashboardTour from "@/app/components/dashboardComponents/DashboardTour";
import DashboardTourModal from "@/app/components/dashboardComponents/DashboardTourModal";

import {
  fetchResultsByEmail,
  fetchResultByResponseId,
} from "@/app/utils/api";

/* -------------------- Helpers -------------------- */

const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;

const formatDuration = (seconds) => {
  const secs = Number(seconds);
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m <= 0 ? `${s}s` : `${m}m ${s}s`;
};

const buildTopicStrength = (topicBreakdown = {}) => {
  const strong = [];
  const weak = [];

  Object.entries(topicBreakdown).forEach(([topic, v]) => {
    const total = Number(v?.total) || 0;
    const scored = Number(v?.scored) || 0;
    if (!total) return;

    const accuracy = scored / total;
    if (accuracy >= 0.75) strong.push({ topic, accuracy });
    else if (accuracy <= 0.5)
      weak.push({ topic, lostMarks: total - scored });
  });

  return {
    strongTopics: strong,
    weakTopics: weak.sort((a, b) => b.lostMarks - a.lostMarks),
  };
};

const buildSuggestionsFromFeedback = (feedback) => {
  if (!feedback) return [];

  const list = [];

  if (feedback.overall_feedback)
    list.push({ title: "Overall Feedback", description: feedback.overall_feedback });

  (feedback.strengths || []).forEach((s) =>
    list.push({ title: "Strength", description: s })
  );

  (feedback.weaknesses || []).forEach((w) =>
    list.push({ title: "Weak Area", description: w })
  );

  (feedback.areas_of_improvement || []).forEach((a) => {
    const desc = [a.issue, a.how_to_improve].filter(Boolean).join(" — ");
    if (desc) list.push({ title: "Improvement", description: desc });
  });

  if (feedback.encouragement)
    list.push({ title: "Encouragement", description: feedback.encouragement });

  return list;
};

/* -------------------- Dashboard -------------------- */

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const responseId = String(searchParams.get("r") || "").trim();
  const hasResponseId = Boolean(responseId && responseId !== "[ResponseId]");

  const [quizResults, setQuizResults] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isTourActive, setIsTourActive] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);

  /* -------------------- Redirect -------------------- */
  useEffect(() => {
    if (!hasResponseId) navigate("/", { replace: true });
  }, [hasResponseId, navigate]);

  /* -------------------- Load Data -------------------- */
  useEffect(() => {
    if (!hasResponseId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const doc = await fetchResultByResponseId(responseId);
        if (!doc || cancelled) return;

        const allAttempts = await fetchResultsByEmail(
          doc.user.email_address,
          { quiz_name: doc.quiz_name }
        );

        if (!cancelled) {
          setQuizResults(allAttempts?.length ? allAttempts : [doc]);
        }

      } catch (err) {
        console.error("Dashboard load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => (cancelled = true);
  }, [responseId, hasResponseId]);

  /* -------------------- Tour -------------------- */
  useEffect(() => {
    if (!localStorage.getItem("dashboardTourPrompted"))
      setShowTourModal(true);
  }, []);

  /* -------------------- Build Date Map (O1 Filtering) -------------------- */
  const resultsByDate = useMemo(() => {
    const map = new Map();

    quizResults.forEach((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return;

      const d = new Date(raw);
      d.setHours(0, 0, 0, 0);

      const key = d.getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });

    return map;
  }, [quizResults]);

  /* -------------------- Calendar Dates -------------------- */
  const testTakenDates = useMemo(() => {
    return Array.from(resultsByDate.keys()).map(
      (timestamp) => new Date(Number(timestamp))
    );
  }, [resultsByDate]);

  /* -------------------- Filtered Results -------------------- */
  const filteredResults = useMemo(() => {
    if (!selectedDate) return quizResults;

    const key = new Date(selectedDate).setHours(0, 0, 0, 0);
    return resultsByDate.get(key) || [];
  }, [selectedDate, resultsByDate, quizResults]);

  /* -------------------- Selected Result -------------------- */
  const selectedResult = useMemo(() => {
    if (!filteredResults.length) return quizResults[0];

    return [...filteredResults].sort(
      (a, b) =>
        new Date(unwrapDate(b.createdAt || b.date_submitted)) -
        new Date(unwrapDate(a.createdAt || a.date_submitted))
    )[0];
  }, [filteredResults, quizResults]);

  /* -------------------- Derived Metrics -------------------- */
  const percentage = Math.round(
    Number(selectedResult?.score?.percentage || 0)
  );
  const grade = selectedResult?.score?.grade || "—";
  const duration = formatDuration(selectedResult?.duration);
  const attemptsUsed = filteredResults.length || quizResults.length || "—";

  const { strongTopics, weakTopics } = useMemo(
    () => buildTopicStrength(selectedResult?.topicBreakdown || {}),
    [selectedResult?.topicBreakdown]
  );

  const suggestions = useMemo(
    () => buildSuggestionsFromFeedback(selectedResult?.ai_feedback),
    [selectedResult?.ai_feedback]
  );

  const displayName =
    `${selectedResult?.user?.first_name || ""} ${
      selectedResult?.user?.last_name || ""
    }`.trim() || "Student";

  /* -------------------- Loading -------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl font-semibold text-gray-600">
          Loading Dashboard...
        </div>
      </div>
    );
  }

  if (!selectedResult) return null;

  /* -------------------- Render -------------------- */

  return (
    <div className="relative min-h-screen bg-gray-100">
      <DashboardTour
        isTourActive={isTourActive}
        setIsTourActive={setIsTourActive}
      />

      <DashboardTourModal
        isOpen={showTourModal}
        onStart={() => {
          setShowTourModal(false);
          setTimeout(() => setIsTourActive(true), 150);
          localStorage.setItem("dashboardTourPrompted", "true");
        }}
        onSkip={() => {
          setShowTourModal(false);
          localStorage.setItem("dashboardTourPrompted", "true");
        }}
      />

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 mb-4">
        <h1 className="text-3xl font-bold">
          <span className="text-blue-600">{displayName} - </span>
          <span className="text-purple-600">
            {selectedResult?.quiz_name || "Quiz"} Report
          </span>
        </h1>

        <div className="flex items-center gap-4">
          <DateRangeFilter
            selectedDate={selectedDate}
            onChange={setSelectedDate}
            testTakenDates={testTakenDates}
          />
          <AvatarMenu />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-12 gap-4 px-6 pb-6">
        <div className="col-span-7 grid grid-cols-4 gap-4">
          <StatCard title="Overall Score" value={`${percentage}%`} />
          <StatCard title="Time Spent" value={duration} />
          <StatCard title="Result" value={grade} />
          <StatCard title="Attempts Used" value={attemptsUsed} />
        </div>

        <div className="col-span-5 row-span-3 bg-white rounded-xl shadow-md p-6">
          <AICoachPanel
            feedback={selectedResult?.ai_feedback}
            strongTopics={strongTopics}
            weakTopics={weakTopics}
          />
        </div>

        <div className="col-span-3 bg-white rounded-xl shadow-md p-6">
          <DonutScoreChart
            correctPercent={percentage}
            incorrectPercent={100 - percentage}
          />
        </div>

        <div className="col-span-4 bg-white rounded-xl shadow-md p-6">
          <WeakTopicsBarChart topics={weakTopics} />
        </div>

        <div className="col-span-3 bg-white rounded-xl shadow-md p-6">
          <TopTopicsFunnelChart
            topicBreakdown={selectedResult?.topicBreakdown}
            topN={5}
            height={250}
            title="Top 5 Topics"
          />
        </div>

        <div className="col-span-4">
          <div className="bg-white rounded-xl shadow p-4 h-full">
            <AISuggestionPanel
              suggestions={suggestions}
              studyTips={selectedResult?.ai_feedback?.study_tips || []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
