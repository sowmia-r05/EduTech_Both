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
  fetchLatestResultByEmail,
  fetchResultsByEmail,
  normalizeEmail,
} from "@/app/utils/api";

import waitingGif from "@/app/components/Public/dragon_play.gif";

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
    else if (accuracy <= 0.5) weak.push({ topic, lostMarks: total - scored });
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

const isAiPending = (result) => {
  const status = String(result?.ai_feedback_meta?.status || "").toLowerCase();
  if (["done", "completed", "success"].includes(status)) return false;
  if (["failed", "error"].includes(status)) return false;
  return true;
};

/* -------------------- Dashboard Component -------------------- */

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = normalizeEmail(searchParams.get("email") || "");
  const quizParam = searchParams.get("quiz") || "";

  const [isTourActive, setIsTourActive] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);

  /* -------------------- Redirect if email missing -------------------- */
  useEffect(() => {
    if (!email) navigate("/", { replace: true });
  }, [email, navigate]);

  /* -------------------- Fetch Latest Result Immediately -------------------- */
  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const loadLatest = async () => {
      try {
        setLoadingLatest(true);
        const latest = await fetchLatestResultByEmail(
          email,
          quizParam ? { quiz_name: quizParam } : {}
        );
        if (!cancelled) setLatestResult(latest);
      } catch {
        if (!cancelled) setError("Failed to load latest result.");
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    };

    loadLatest();
    return () => (cancelled = true);
  }, [email, quizParam]);

  /* -------------------- Lazy Load Historical Results -------------------- */
  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const loadResultsList = async () => {
      try {
        setLoadingList(true);
        const list = await fetchResultsByEmail(email, { limit: 50 });
        if (!cancelled) setResultsList(list);
      } catch {
        if (!cancelled) console.warn("Failed to load full results list.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };

    // Delay slightly to prioritize latestResult render
    setTimeout(loadResultsList, 200);
    return () => (cancelled = true);
  }, [email]);

  /* -------------------- Optimized AI Polling -------------------- */
  useEffect(() => {
    if (!email || selectedDate) return;
    let cancelled = false;
    let timer = null;
    let retryInterval = 4000;

    const poll = async () => {
      if (cancelled) return;
      try {
        const latest = await fetchLatestResultByEmail(
          email,
          quizParam ? { quiz_name: quizParam } : {}
        );
        if (cancelled) return;
        setLatestResult(latest);

        if (isAiPending(latest)) {
          retryInterval = Math.min(retryInterval * 1.2, 12000); // exponential backoff
          timer = setTimeout(poll, retryInterval);
        }
      } catch {
        retryInterval = Math.min(retryInterval * 1.5, 15000);
        if (!cancelled) timer = setTimeout(poll, retryInterval);
      }
    };

    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [email, quizParam, selectedDate]);

  /* -------------------- Dashboard Tour -------------------- */
  useEffect(() => {
    const hasSeenTourPrompt = localStorage.getItem("dashboardTourPrompted");
    if (!hasSeenTourPrompt) setShowTourModal(true);
  }, []);

  /* -------------------- Dates for Date Filter -------------------- */
  const testTakenDates = useMemo(
    () =>
      resultsList
        .map((r) => unwrapDate(r?.createdAt || r?.date_submitted))
        .filter(Boolean)
        .map((d) => {
          const date = new Date(d);
          date.setHours(0, 0, 0, 0);
          return date;
        }),
    [resultsList]
  );

  /* -------------------- Filtered Results -------------------- */
  const filteredResults = useMemo(() => {
    let list = resultsList;
    if (quizParam)
      list = list.filter(
        (r) =>
          r.quiz_name &&
          r.quiz_name.toLowerCase().includes(quizParam.toLowerCase())
      );
    if (!selectedDate) return list;
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    return list.filter((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return false;
      const dt = new Date(raw);
      return dt >= start && dt <= end;
    });
  }, [resultsList, selectedDate, quizParam]);

  const selectedResult = useMemo(() => {
    if (selectedDate && !filteredResults.length) return null;
    if (!filteredResults.length) return latestResult;

    return [...filteredResults].sort(
      (a, b) =>
        new Date(unwrapDate(b.createdAt || b.date_submitted)) -
        new Date(unwrapDate(a.createdAt || a.date_submitted))
    )[0];
  }, [filteredResults, latestResult, selectedDate]);

  /* -------------------- Loading Skeletons -------------------- */
  if (loadingLatest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <img src={waitingGif} alt="Loading" className="w-56 h-56" />
      </div>
    );
  }

  if (selectedDate && !selectedResult) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-6 py-4 rounded-xl shadow-md text-center">
          <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
          <p>No quiz result exists for the selected date.</p>
          <button
            onClick={() => setSelectedDate(null)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Clear Date Filter
          </button>
        </div>
      </div>
    );
  }

  if (error || !selectedResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <button
          onClick={() => navigate("/NonWritingLookupQuizResults")}
          className="text-blue-600 hover:underline"
        >
          {error || "No results found."}
        </button>
      </div>
    );
  }

  /* -------------------- Derived Values -------------------- */
  const percentage = Math.round(Number(selectedResult?.score?.percentage || 0));
  const grade = selectedResult?.score?.grade || "—";
  const displayGrade = ["fail", "f", "failed"].includes(String(grade).toLowerCase())
    ? "Practice Needed"
    : grade;
  const duration = formatDuration(selectedResult?.duration);

  const { strongTopics, weakTopics } = buildTopicStrength(
    selectedResult?.topicBreakdown || {}
  );
  const suggestions = buildSuggestionsFromFeedback(selectedResult?.ai_feedback);

  const displayName =
    `${selectedResult?.user?.first_name || ""} ${selectedResult?.user?.last_name || ""}`.trim() || "Student";

  /* -------------------- Render -------------------- */
  return (
    <div className="relative min-h-screen bg-gray-100">
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

      <div>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 mb-4">
          <h1 className="text-3xl font-bold">
            <span className="text-blue-600">{displayName} -</span>{" "}
            <span className="text-purple-600">{selectedResult?.quiz_name || "Quiz"} Report</span>
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

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4 px-6 pb-6">
          {/* Stat Cards */}
          <div className="col-span-7 grid grid-cols-4 gap-4">
            {["Overall Score", "Time Spent", "Result", "Attempts Used"].map((title, idx) => {
              const valueMap = {
                "Overall Score": `${percentage}%`,
                "Time Spent": duration,
                Result: displayGrade,
                "Attempts Used": selectedResult?.attempt || "—",
              };
              return (
                <div key={idx} id={title.toLowerCase().replace(/\s/g, "-")}>
                  <StatCard title={title} value={valueMap[title]} loading={loadingList} />
                </div>
              );
            })}
          </div>

          {/* AI Coach */}
          <div className="col-span-5 row-span-3" id="ai-coach">
            <AICoachPanel
              feedback={selectedResult?.ai_feedback}
              strongTopics={strongTopics}
              weakTopics={weakTopics}
              loading={loadingList}
            />
          </div>

          {/* Donut Chart */}
          <div className="col-span-3" id="donut-chart">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              {loadingList ? <div className="h-56 animate-pulse bg-gray-200 rounded-xl" /> :
                <DonutScoreChart correctPercent={percentage} incorrectPercent={100 - percentage} />}
            </div>
          </div>

          {/* Weak Topics */}
          <div className="col-span-4" id="weak-topics">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              {loadingList ? <div className="h-56 animate-pulse bg-gray-200 rounded-xl" /> :
                <WeakTopicsBarChart topics={weakTopics} />}
            </div>
          </div>

          {/* Top Topics */}
          <div className="col-span-3" id="top-topics">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              {loadingList ? <div className="h-56 animate-pulse bg-gray-200 rounded-xl" /> :
                <TopTopicsFunnelChart topicBreakdown={selectedResult?.topicBreakdown} topN={5} height={250} title="Top 5 Topics" />}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="col-span-4" id="suggestions">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              {loadingList ? <div className="h-56 animate-pulse bg-gray-200 rounded-xl" /> :
                <AISuggestionPanel suggestions={suggestions} studyTips={selectedResult?.ai_feedback?.study_tips || []} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
