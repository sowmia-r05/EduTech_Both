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

import { fetchResultsByEmail, fetchResultByResponseId } from "@/app/utils/api";

/* -------------------- Loader -------------------- */
const DotLoader = ({ label = "Loading" }) => (
  <div className="flex flex-col items-center justify-center">
    <div className="flex items-center gap-2" aria-label={label} role="status">
      <span className="dot-loader dot1">.</span>
      <span className="dot-loader dot2">.</span>
      <span className="dot-loader dot3">.</span>
    </div>
    <style>{`
      .dot-loader {
        font-size: 64px;
        font-weight: 700;
        opacity: 0.25;
        animation: dotPulse 1s infinite ease-in-out;
      }
      .dot1 { animation-delay: 0s; }
      .dot2 { animation-delay: 0.15s; }
      .dot3 { animation-delay: 0.3s; }
      @keyframes dotPulse {
        0%, 80%, 100% { opacity: 0.2; }
        40% { opacity: 1; }
      }
    `}</style>
  </div>
);

/* -------------------- No Data Modal -------------------- */
const NoDataModal = ({ isOpen, onClose, onClearFilter }) => {
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl">📅</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              No Results Found
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              There are no quiz attempts recorded for the selected date.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-100 transition"
          >
            Close
          </button>

          <button
            onClick={onClearFilter}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Clear Filter
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

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

/**
 * Build the "suggestions" list used by AISuggestionPanel.
 * Important:
 * - Supports NEW fields: growth_areas
 * - Still supports old fields: areas_of_improvement
 */
const buildSuggestionsFromFeedback = (feedback) => {
  if (!feedback) return [];
  const list = [];

  if (feedback.overall_feedback) {
    list.push({
      title: "Overall Feedback",
      description: feedback.overall_feedback,
    });
  }

  (feedback.strengths || []).forEach((s) =>
    list.push({ title: "Strength", description: s })
  );

  (feedback.weaknesses || []).forEach((w) =>
    list.push({ title: "Weak Area", description: w })
  );

  // ✅ NEW: growth_areas (array of strings)
  (feedback.growth_areas || []).forEach((g) => {
    if (g) list.push({ title: "Improvement", description: g });
  });

  // ✅ OLD SUPPORT: areas_of_improvement (objects)
  (feedback.areas_of_improvement || []).forEach((a) => {
    const desc = [a?.issue, a?.how_to_improve].filter(Boolean).join(" — ");
    if (desc) list.push({ title: "Improvement", description: desc });
  });

  if (feedback.encouragement) {
    list.push({ title: "Encouragement", description: feedback.encouragement });
  }

  return list;
};

/* -------------------- Dashboard -------------------- */
export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const responseId = String(searchParams.get("r") || "").trim();
  const hasResponseId = Boolean(responseId && responseId !== "[ResponseId]");

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);

  const [isTourActive, setIsTourActive] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);

  /* -------------------- Redirect if no responseId -------------------- */
  useEffect(() => {
    if (!hasResponseId) navigate("/", { replace: true });
  }, [hasResponseId, navigate]);

  /* -------------------- Load results -------------------- */
  useEffect(() => {
    if (!hasResponseId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingLatest(true);

        const doc = await fetchResultByResponseId(responseId);
        if (!doc) return;

        if (!cancelled) {
          setLatestResult(doc);

          const all = await fetchResultsByEmail(doc.user.email_address, {
            quiz_name: doc.quiz_name,
          });

          setResultsList(all || [doc]);
        }
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    };

    load();
    return () => (cancelled = true);
  }, [responseId, hasResponseId]);

  /* -------------------- Tour -------------------- */
  useEffect(() => {
    if (!localStorage.getItem("dashboardTourPrompted")) setShowTourModal(true);
  }, []);

  /* -------------------- Filtered results by date -------------------- */
  const filteredResults = useMemo(() => {
    if (!latestResult) return [];

    const quizAttempts = resultsList.filter(
      (r) => r.quiz_name === latestResult.quiz_name
    );

    if (!selectedDate) return quizAttempts;

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    return quizAttempts.filter((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return false;
      const dt = new Date(raw);
      return dt >= start && dt <= end;
    });
  }, [resultsList, selectedDate, latestResult]);

  /* -------------------- NoDataModal trigger -------------------- */
  useEffect(() => {
    if (selectedDate) {
      setShowNoDataModal(filteredResults.length === 0);
    }
  }, [selectedDate, filteredResults]);

  /* -------------------- Pick selected result (latest in filter) -------------------- */
  const selectedResult = useMemo(() => {
    if (!filteredResults.length) return latestResult;

    return [...filteredResults].sort(
      (a, b) =>
        new Date(unwrapDate(b.createdAt || b.date_submitted)) -
        new Date(unwrapDate(a.createdAt || a.date_submitted))
    )[0];
  }, [filteredResults, latestResult]);

  /* -------------------- Loading / empty -------------------- */
  if (loadingLatest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <DotLoader label="Loading dashboard" />
      </div>
    );
  }

  if (!selectedResult) return null;

  /* -------------------- Derived stats -------------------- */
  const percentage = Math.round(Number(selectedResult?.score?.percentage || 0));
  const grade = selectedResult?.score?.grade || "—";
  const duration = formatDuration(selectedResult?.duration);
  const attemptsUsed = filteredResults.length || "—";

  const { strongTopics, weakTopics } = buildTopicStrength(
    selectedResult?.topicBreakdown || {}
  );

  const suggestions = buildSuggestionsFromFeedback(selectedResult?.ai_feedback);

  const displayName =
    `${selectedResult?.user?.first_name || ""} ${
      selectedResult?.user?.last_name || ""
    }`.trim() || "Student";

  return (
    <div className="relative min-h-screen bg-gray-100">
      {/* Dashboard Tour */}
      <DashboardTour isTourActive={isTourActive} setIsTourActive={setIsTourActive} />

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

      {/* No Data Modal */}
      <NoDataModal
        isOpen={showNoDataModal}
        onClose={() => setShowNoDataModal(false)}
        onClearFilter={() => {
          setSelectedDate(null);
          setShowNoDataModal(false);
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
            testTakenDates={resultsList
              .map((r) => {
                const raw = r?.createdAt || r?.date_submitted;
                if (!raw) return null;
                const date = new Date(
                  typeof raw === "object" && raw.$date ? raw.$date : raw
                );
                date.setHours(0, 0, 0, 0);
                return date;
              })
              .filter(Boolean)}
          />
          <AvatarMenu />
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-12 gap-4 px-6 pb-6 min-h-[80vh]">
        {/* Stat Cards */}
        <div className="col-span-7 grid grid-cols-4 gap-4">
          {["Overall Score", "Time Spent", "Result", "Attempts Used"].map(
            (title, idx) => {
              const valueMap = {
                "Overall Score": `${percentage}%`,
                "Time Spent": duration,
                Result: grade,
                "Attempts Used": attemptsUsed,
              };
              return <StatCard key={idx} title={title} value={valueMap[title]} />;
            }
          )}
        </div>

        {/* AI Coach Panel */}
        <div className="col-span-5 row-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <AICoachPanel
            feedback={selectedResult?.ai_feedback}
            strongTopics={strongTopics}
            weakTopics={weakTopics}
          />
        </div>

        {/* Donut Chart */}
        <div className="col-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <DonutScoreChart
            correctPercent={percentage}
            incorrectPercent={100 - percentage}
            height="100%"
          />
        </div>

        {/* Weak Topics Bar Chart */}
        <div className="col-span-4 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <WeakTopicsBarChart topics={weakTopics} height="100%" />
        </div>

        {/* Top Topics Funnel */}
        <div className="col-span-3 bg-white rounded-xl shadow-md p-6 flex flex-col min-h-0">
          <TopTopicsFunnelChart
            topicBreakdown={selectedResult?.topicBreakdown}
            topN={5}
            height={250}
            title="Top 5 Topics Overview"
          />
        </div>

        {/* AI Suggestions */}
        <div className="col-span-4">
          <div className="bg-white rounded-xl shadow p-4 h-full flex flex-col min-h-0">
            <AISuggestionPanel
              suggestions={suggestions}
              studyTips={selectedResult?.ai_feedback?.study_tips || []}
              topicWiseTips={selectedResult?.ai_feedback?.topic_wise_tips || []} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}