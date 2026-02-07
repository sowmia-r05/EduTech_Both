import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import StatCard from "@/app/components/dashboardComponents/StatCard";
import AICoachPanel from "@/app/components/dashboardComponents/AICoachPanel";
import DonutScoreChart from "@/app/components/dashboardComponents/DonutScoreChart";
import WeakTopicsBarChart from "@/app/components/dashboardComponents/WeakTopicsBarChart";
import AISuggestionPanel from "@/app/components/dashboardComponents/AISuggestionPanel";
import AvatarMenu from "@/app/components/dashboardComponents/AvatarMenu";
import TopTopicsFunnelChart from "@/app/components/dashboardComponents/TopTopicsFunnelChart";

import {
  fetchLatestResultByEmail,
  fetchResultsByEmail,
  normalizeEmail,
} from "@/app/utils/api";

/* -------------------- helpers -------------------- */

// Handle ISO string OR Mongo export shape { $date: "..." }
const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;

const formatShortDate = (dateValue) => {
  const raw = unwrapDate(dateValue);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
};

// seconds -> "5m 55s"  OR  "—"
const formatDuration = (seconds) => {
  const secs = Number(seconds);
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
};

const buildTopicStrength = (topicBreakdown = {}) => {
  const strong = [];
  const weak = [];

  Object.entries(topicBreakdown || {}).forEach(([topic, v]) => {
    const total = Number(v?.total) || 0;
    const scored = Number(v?.scored) || 0;
    if (!total) return;

    const accuracy = scored / total;

    if (accuracy >= 0.75) {
      strong.push({ topic, accuracy });
    } else if (accuracy <= 0.5) {
      weak.push({ topic, lostMarks: total - scored });
    }
  });

  return {
    strongTopics: strong,
    weakTopics: weak.sort((a, b) => b.lostMarks - a.lostMarks),
  };
};

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

  (feedback.areas_of_improvement || []).forEach((a) => {
    const desc = [a.issue, a.how_to_improve].filter(Boolean).join(" — ");
    if (desc) list.push({ title: "Improvement", description: desc });
  });

  if (feedback.encouragement) {
    list.push({
      title: "Encouragement",
      description: feedback.encouragement,
    });
  }

  return list;
};

// ✅ AI loading condition:
// show the centered loading ONLY when AI feedback is NOT available yet
// (so if data already exists, you won't see the loading in the middle)
const isAiPending = (latestResult) => {
  const hasFeedback = !!latestResult?.ai_feedback; // if feedback already exists, don't show AI loading
  if (hasFeedback) return false;

  // if you store status elsewhere, update this path accordingly
  const s = String(latestResult?.ai_feedback_meta?.status || "").toLowerCase();
  if (!s) return false; // if no status, don't block UI
  return s !== "done" && s !== "completed";
};

/* -------------------- component -------------------- */

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = normalizeEmail(searchParams.get("email") || "");
  const quizParam = searchParams.get("quiz") || "";

  const [latestResult, setLatestResult] = useState(null);
  const [resultsList, setResultsList] = useState([]);
  const [loading, setLoading] = useState(true); // fetch loading
  const [error, setError] = useState("");

  // Normalize list shape in case API returns {results:[...]} or {data:[...]}
  const normalizeResultsList = (list) => {
    if (Array.isArray(list)) return list;
    if (Array.isArray(list?.results)) return list.results;
    if (Array.isArray(list?.data)) return list.data;
    return [];
  };

  // ✅ Initial fetch (latest + list)
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
          setLatestResult(latest);
          setResultsList(normalizeResultsList(list));
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [email, quizParam]);

  // ✅ Poll ONLY when AI is pending (so the loading disappears automatically once AI is done)
  useEffect(() => {
    if (!email) return;
    if (!latestResult) return;

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const latest = await fetchLatestResultByEmail(
          email,
          quizParam ? { quiz_name: quizParam } : {}
        );
        if (!cancelled) setLatestResult(latest);

        if (!cancelled && isAiPending(latest)) {
          timer = setTimeout(poll, 4000); // poll every 4s until AI done
        }
      } catch {
        // don't hard-fail the whole dashboard on poll failure
      }
    };

    if (isAiPending(latestResult)) {
      timer = setTimeout(poll, 2500);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [email, quizParam, latestResult]);

  /* -------------------- derived data -------------------- */

  const percentage = useMemo(() => {
    const p = Number(latestResult?.score?.percentage);
    return Number.isNaN(p) ? 0 : Math.round(p);
  }, [latestResult]);

  const grade = latestResult?.score?.grade || "—";
  const gradeLower = String(grade).toLowerCase();
  const displayGrade =
    gradeLower === "fail" ||
    gradeLower === "f" ||
    gradeLower === "failed" ||
    grade === "F"
      ? "Practice Needed"
      : grade;

  const duration = useMemo(() => {
    return formatDuration(latestResult?.duration);
  }, [latestResult]);

  const attemptsCount = useMemo(() => {
    const a = Number(latestResult?.attempt);
    if (Number.isFinite(a) && a > 0) return a;

    const maxAttempt = Math.max(
      0,
      ...((resultsList || []).map((r) => Number(r?.attempt) || 0))
    );
    if (maxAttempt > 0) return maxAttempt;

    return resultsList?.length || "—";
  }, [latestResult, resultsList]);

  const { strongTopics, weakTopics } = useMemo(
    () => buildTopicStrength(latestResult?.topicBreakdown || {}),
    [latestResult]
  );

  const suggestions = useMemo(
    () => buildSuggestionsFromFeedback(latestResult?.ai_feedback),
    [latestResult]
  );

  const displayName = useMemo(() => {
    const u = latestResult?.user;
    return `${u?.first_name || ""} ${u?.last_name || ""}`.trim() || "Student";
  }, [latestResult]);

  const aiStatus = String(latestResult?.ai_feedback_meta?.status || "");
  const aiStatusMessage =
    latestResult?.ai_feedback_meta?.status_message ||
    latestResult?.ai_feedback_meta?.message ||
    "";

  /* -------------------- guards -------------------- */

  // 1) Initial API fetch loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  // 2) Error / no data
  if (error || !latestResult) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-700 mb-4">{error || "No results found."}</p>
          <button
            onClick={() => navigate("/NonWritingLookupQuizResults")}
            className="text-blue-600 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // 3) ✅ AI pending loader (CENTERED) — only if AI feedback not available yet
  if (isAiPending(latestResult)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 text-center w-full max-w-xl">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">
            Generating your AI feedback…
          </h2>
          <p className="mt-2 text-gray-600">
            {aiStatusMessage || "Please wait a moment while we prepare your report."}
          </p>
          {aiStatus ? (
            <div className="mt-3 text-sm text-gray-500">
              Status: <span className="font-semibold">{aiStatus}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /* -------------------- render -------------------- */

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
          {displayName} NAPLAN Practice Report
        </h1>
        <AvatarMenu />
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Stats */}
        <div className="col-span-7 grid grid-cols-4 gap-4 min-h-[120px]">
          <StatCard title="Overall Score" value={`${percentage}%`} />
          <StatCard title="Time Spent" value={duration} />
          <StatCard
            title="Result"
            value={displayGrade}
            status={
              gradeLower === "fail" ||
              gradeLower === "f" ||
              gradeLower === "failed" ||
              grade === "F" ||
              grade === "not_yet_achieved"
                ? "needs attention"
                : grade
            }
          />
          <StatCard title="Attempts Used" value={attemptsCount} />
        </div>

        {/* AI Coach */}
        <div className="col-span-5 row-span-3 min-h-[520px]">
          <div className="bg-blue-600 rounded-xl shadow h-full">
            <AICoachPanel
              feedback={latestResult.ai_feedback}
              strongTopics={strongTopics}
              weakTopics={weakTopics}
            />
          </div>
        </div>

        {/* Charts */}
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

        {/* Top 5 Topics Funnel chart */}
        <div className="col-span-3 min-h-[290px]">
          <div className="bg-white rounded-xl shadow p-4 h-full">
            <TopTopicsFunnelChart
              topicBreakdown={latestResult?.topicBreakdown}
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
              studyTips={latestResult?.ai_feedback?.study_tips || []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
