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

import {
  fetchLatestResultByEmail,
  fetchResultsByEmail,
  normalizeEmail,
} from "@/app/utils/api";

import waitingGif from "@/app/components/Public/dragon_play.gif";

/* -------------------- helpers -------------------- */

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

  Object.entries(topicBreakdown || {}).forEach(([topic, v]) => {
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

const isAiPending = (result) => {
  const status = String(result?.ai_feedback_meta?.status || "").toLowerCase();
  if (["done", "completed", "success"].includes(status)) return false;
  if (["failed", "error"].includes(status)) return false;
  return true;
};

/* -------------------- component -------------------- */

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = normalizeEmail(searchParams.get("email") || "");
  const quizParam = searchParams.get("quiz") || "";

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);

  /* -------------------- Redirect if email missing -------------------- */
  useEffect(() => {
    if (!email) {
      navigate("/", { replace: true });
    }
  }, [email, navigate]);

  /* -------------------- Initial fetch -------------------- */
  useEffect(() => {
    if (!email) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [latest, list] = await Promise.all([
          fetchLatestResultByEmail(
            email,
            quizParam ? { quiz_name: quizParam } : {}
          ),
          fetchResultsByEmail(email),
        ]);

        if (!cancelled) {
          setLatestResult(latest);
          setResultsList(Array.isArray(list) ? list : []);
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => (cancelled = true);
  }, [email, quizParam]);

  /* -------------------- AI Polling -------------------- */
  useEffect(() => {
    if (!email || selectedDate) return;

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const latest = await fetchLatestResultByEmail(
          email,
          quizParam ? { quiz_name: quizParam } : {}
        );

        if (cancelled) return;

        setLatestResult(latest);

        if (isAiPending(latest)) {
          timer = setTimeout(poll, 4000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 6000);
      }
    };

    timer = setTimeout(poll, 1500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [email, quizParam, selectedDate]);

  /* -------------------- Subject + Date Filtering -------------------- */
  const filteredResults = useMemo(() => {
    let list = resultsList;

    if (quizParam) {
      list = list.filter(
        (r) =>
          r.quiz_name &&
          r.quiz_name.toLowerCase().includes(quizParam.toLowerCase())
      );
    }

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

  /* -------------------- Guards / Loading states -------------------- */
  if (loading) {
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

  if (isAiPending(selectedResult)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <img src={waitingGif} alt="Preparing feedback" className="w-56 h-56" />
      </div>
    );
  }

  /* -------------------- Derived Values -------------------- */
  const percentage = Math.round(
    Number(selectedResult?.score?.percentage || 0)
  );
  const grade = selectedResult?.score?.grade || "—";
  const displayGrade =
    ["fail", "f", "failed"].includes(String(grade).toLowerCase())
      ? "Practice Needed"
      : grade;
  const duration = formatDuration(selectedResult?.duration);

  const { strongTopics, weakTopics } = buildTopicStrength(
    selectedResult?.topicBreakdown || {}
  );

  const suggestions = buildSuggestionsFromFeedback(
    selectedResult?.ai_feedback
  );

  const displayName = `${selectedResult?.user?.first_name || ""} ${
    selectedResult?.user?.last_name || ""
  }`.trim() || "Student";

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">
          <span className="text-blue-600">{displayName} - </span>
          <span className="text-purple-600">
            {selectedResult?.quiz_name || "Quiz"} Report
          </span>
        </h1>

        <div className="flex items-center gap-4">
          <DateRangeFilter
            selectedDate={selectedDate}
            onChange={(date) => setSelectedDate(date)}
          />
          <AvatarMenu />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 grid grid-cols-4 gap-4">
          <StatCard title="Overall Score" value={`${percentage}%`} />
          <StatCard title="Time Spent" value={duration} />
          <StatCard title="Result" value={displayGrade} />
          <StatCard title="Attempts Used" value={selectedResult?.attempt || "—"} />
        </div>

        <div className="col-span-5 row-span-3">
          <AICoachPanel
            feedback={selectedResult?.ai_feedback}
            strongTopics={strongTopics}
            weakTopics={weakTopics}
          />
        </div>

        <div className="col-span-3">
          <div className="bg-white rounded-xl shadow p-4 h-full">
            <DonutScoreChart
              correctPercent={percentage}
              incorrectPercent={100 - percentage}
            />
          </div>
        </div>

        <div className="col-span-4">
          <div className="bg-white rounded-xl shadow p-4 h-full">
            <WeakTopicsBarChart topics={weakTopics} />
          </div>
        </div>

        <div className="col-span-3">
          <div className="bg-white rounded-xl shadow p-4 h-full">
            <TopTopicsFunnelChart
              topicBreakdown={selectedResult?.topicBreakdown}
              topN={5}
              height={250}
              title="Top 5 Topics"
            />
          </div>
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
