import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/app/components/ui/card";

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

/* -------------------- Dashboard Component -------------------- */
export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = normalizeEmail(searchParams.get("email") || "");
  const quizParam = searchParams.get("quiz") || "";

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  /* -------------------- initial fetch -------------------- */
  useEffect(() => {
    if (!email) {
      setError("Email is required.");
      setLoading(false);
      return;
    }

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
          setLatestResult(latest || null);
          setResultsList(Array.isArray(list) ? list : list?.results || []);
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

  /* -------------------- AI polling -------------------- */
  useEffect(() => {
    if (!email) return;

    let cancelled = false;
    let timer;

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
  }, [email, quizParam]);

  /* -------------------- filtering -------------------- */
  const filteredResults = useMemo(() => {
    if (!startDate || !endDate) return resultsList;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return resultsList.filter((r) => {
      const raw = unwrapDate(r?.createdAt || r?.date_submitted);
      if (!raw) return false;
      const dt = new Date(raw);
      return dt >= start && dt <= end;
    });
  }, [resultsList, startDate, endDate]);

  const isDateFilterActive = startDate && endDate;
  const hasNoFilteredResults =
    isDateFilterActive && filteredResults.length === 0;

  /* -------------------- select latest filtered result -------------------- */
  const selectedResult = useMemo(() => {
    if (!filteredResults.length) return latestResult;

    return [...filteredResults].sort(
      (a, b) =>
        new Date(unwrapDate(b.createdAt || b.date_submitted)) -
        new Date(unwrapDate(a.createdAt || a.date_submitted))
    )[0];
  }, [filteredResults, latestResult]);

  /* -------------------- derived data -------------------- */
  const percentage = useMemo(() => {
    const p = Number(selectedResult?.score?.percentage);
    return Number.isNaN(p) ? 0 : Math.round(p);
  }, [selectedResult]);

  const grade = selectedResult?.score?.grade || "—";
  const gradeLower = String(grade).toLowerCase();
  const displayGrade =
    ["fail", "f", "failed"].includes(gradeLower)
      ? "Practice Needed"
      : grade;

  const duration = useMemo(
    () => formatDuration(selectedResult?.duration),
    [selectedResult]
  );

  const attemptsCount = useMemo(() => {
    const a = Number(selectedResult?.attempt);
    if (Number.isFinite(a) && a > 0) return a;
    return resultsList.length || "—";
  }, [selectedResult, resultsList]);

  const { strongTopics, weakTopics } = useMemo(
    () => buildTopicStrength(selectedResult?.topicBreakdown || {}),
    [selectedResult]
  );

  const suggestions = useMemo(
    () => buildSuggestionsFromFeedback(selectedResult?.ai_feedback),
    [selectedResult]
  );

  const displayName = useMemo(() => {
    const u = selectedResult?.user;
    return `${u?.first_name || ""} ${u?.last_name || ""}`.trim() || "Student";
  }, [selectedResult]);

  /* -------------------- guards -------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <img src={waitingGif} alt="Loading" className="w-52 h-52" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <button
          onClick={() => navigate("/NonWritingLookupQuizResults")}
          className="text-blue-600 hover:underline"
        >
          {error}
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

  /* -------------------- render -------------------- */
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
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
          <AvatarMenu />
        </div>
      </div>

      {/* -------------------- Alert for no results -------------------- */}
      {hasNoFilteredResults && (
        <div className="mb-4 rounded-lg bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-3">
          No exam results found for the selected date range.
        </div>
      )}

      {/* -------------------- Dashboard Grid -------------------- */}
      {!hasNoFilteredResults && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 grid grid-cols-4 gap-4">
            <StatCard title="Overall Score" value={`${percentage}%`} />
            <StatCard title="Time Spent" value={duration} />
            <StatCard title="Result" value={displayGrade} />
            <StatCard title="Attempts Used" value={attemptsCount} />
          </div>

          <div className="col-span-5 row-span-3">
            <AICoachPanel
              feedback={selectedResult?.ai_feedback}
              strongTopics={strongTopics}
              weakTopics={weakTopics}
            />
          </div>

          <div className="col-span-3 min-h-[280px]">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <DonutScoreChart
                correctPercent={percentage}
                incorrectPercent={100 - percentage}
              />
            </div>
          </div>

          <div className="col-span-4 min-h-[280px]">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <WeakTopicsBarChart topics={weakTopics} />
            </div>
          </div>

          <div className="col-span-3 min-h-[290px]">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <TopTopicsFunnelChart
                topicBreakdown={selectedResult?.topicBreakdown}
                topN={5}
                height={250}
                title="Top 5 Topics"
              />
            </div>
          </div>

          <div className="col-span-4 min-h-[280px]">
            <div className="bg-white rounded-xl shadow p-4 h-full">
              <AISuggestionPanel
                suggestions={suggestions}
                studyTips={selectedResult?.ai_feedback?.study_tips || []}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
