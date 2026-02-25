import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Target,
  Lightbulb,
  FileText,
} from "lucide-react";

import waitingGif from "@/app/components/Public/dragon_play.gif";
import AvatarMenu from "@/app/components/ResultComponents/AvatarMenu";
import DateRangeFilter from "@/app/components/dashboardComponents/DateRangeFilter";

import {
  fetchLatestWritingByEmailAndQuiz,
  fetchWritingByResponseId,
  fetchLatestWritingByUsername,
  normalizeEmail,
} from "@/app/utils/api";

/* -------------------- Helpers -------------------- */
const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;

const isAiPending = (d) => {
  const s = String(d?.ai?.status || "").toLowerCase();
  if (["done", "completed", "success"].includes(s)) return false;
  if (["error", "failed"].includes(s)) return false;
  return true;
};

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
              There are no writing attempts recorded for the selected date.
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

/* ==================== ResultPage ==================== */
export default function ResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ✅ Dynamic ResponseId param (URL uses r=...)
  const responseId = String(searchParams.get("r") || "").trim();

  // Old fallback params (still supported)
  const email = normalizeEmail(searchParams.get("email"));
  const quizName = String(searchParams.get("quiz") || "").trim();

  const hasFallback = !!email && !!quizName;

  const userName = useMemo(() => (email ? email.split("@")[0] : "User"), [email]);

  const [doc, setDoc] = useState(null);
  const [writingsList, setWritingsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ NEW: Date picker state
  const [selectedDate, setSelectedDate] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);

  // ----------------------------
  // Fetch evaluation + all writings for this quiz
  // ----------------------------
  useEffect(() => {
    if (!responseId && !hasFallback) {
      navigate("/");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = responseId
          ? await fetchWritingByResponseId(responseId)
          : await fetchLatestWritingByEmailAndQuiz(email, quizName);

        if (cancelled) return;
        setDoc(data);

        // ✅ NEW: Fetch all writing submissions for this quiz (for date picker dots)
        if (data?.user?.email_address && data?.quiz_name) {
          try {
            const all = await fetchLatestWritingByUsername(data.user.email_address, {
              quiz_name: data.quiz_name,
            });
            if (!cancelled) setWritingsList(all || [data]);
          } catch {
            if (!cancelled) setWritingsList([data]);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Failed to load evaluation data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [responseId, hasFallback, email, quizName, navigate]);

  // ----------------------------
  // Poll until AI done (max 3 mins)
  // ----------------------------
  useEffect(() => {
    if (!responseId && !hasFallback) return;
    if (!doc) return;
    if (!isAiPending(doc)) return;

    let cancelled = false;
    let timer = null;
    const start = Date.now();
    const MAX_MS = 180000;

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() - start > MAX_MS) {
        setError("Your feedback is still processing. Please try again in 1–2 minutes.");
        return;
      }

      try {
        const latest = responseId
          ? await fetchWritingByResponseId(responseId)
          : await fetchLatestWritingByEmailAndQuiz(email, quizName);

        if (cancelled) return;

        setDoc(latest);

        if (isAiPending(latest)) {
          timer = setTimeout(poll, 4000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 6000);
      }
    };

    timer = setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [responseId, hasFallback, email, quizName, doc]);

  // If doc returned but missing ai block, route back
  useEffect(() => {
    if (!loading && doc && !doc.ai) {
      navigate("https://www.flexiquiz.com/Dashboard/Index");
    }
  }, [loading, doc, navigate]);

  // ----------------------------
  // ✅ NEW: Quiz-scoped attempts (for date dots + filtering)
  // ----------------------------
  const quizAttempts = useMemo(() => {
    if (!doc) return [];
    return writingsList.filter(
      (w) => w.quiz_name === doc.quiz_name
    );
  }, [writingsList, doc]);

  // ✅ NEW: Filtered results by selected date
  const filteredResults = useMemo(() => {
    if (!selectedDate) return quizAttempts;

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    return quizAttempts.filter((w) => {
      const raw = unwrapDate(w?.submitted_at || w?.date_submitted || w?.date_created || w?.createdAt);
      if (!raw) return false;
      const dt = new Date(raw);
      return dt >= start && dt <= end;
    });
  }, [quizAttempts, selectedDate]);

  // ✅ NEW: NoDataModal trigger
  useEffect(() => {
    if (selectedDate) {
      setShowNoDataModal(filteredResults.length === 0);
    }
  }, [selectedDate, filteredResults]);

  // ✅ NEW: Pick selected doc (latest in filtered range, or original doc)
  const selectedDoc = useMemo(() => {
    if (!filteredResults.length) return doc;

    return [...filteredResults].sort(
      (a, b) =>
        new Date(unwrapDate(b.submitted_at || b.date_submitted || b.createdAt)) -
        new Date(unwrapDate(a.submitted_at || a.date_submitted || a.createdAt))
    )[0];
  }, [filteredResults, doc]);

  // ✅ NEW: Consistent date parsing for testTakenDates (dots in calendar)
  const testTakenDates = useMemo(() => {
    return quizAttempts
      .map((w) => {
        const raw = unwrapDate(w?.submitted_at || w?.date_submitted || w?.date_created || w?.createdAt);
        if (!raw) return null;
        const date = new Date(raw);
        if (isNaN(date.getTime())) return null;
        date.setHours(0, 0, 0, 0);
        return date;
      })
      .filter(Boolean);
  }, [quizAttempts]);

  // ----------------------------
  // AI state (robust) — uses selectedDoc instead of doc
  // ----------------------------
  const activeDoc = selectedDoc || doc;
  const feedback = activeDoc?.ai?.feedback;
  const aiStatus = activeDoc?.ai?.status;
  const aiMessage = activeDoc?.ai?.message;

  const isAiError = aiStatus === "error";
  const isProcessing = loading || (activeDoc && isAiPending(activeDoc));
  const hasAiFailed = isAiError;

  // ----------------------------
  // Loading UI
  // ----------------------------
  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-2 sm:p-3">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-6 px-4 sm:py-8 sm:px-6">
            <img
              src={waitingGif}
              alt="Loading animation"
              className="w-50 h-50 sm:w-56 sm:h-56 object-contain mb-4"
            />
            <div className="text-center space-y-2">
              <p className="text-xl sm:text-2xl font-semibold text-gray-900">
                Almost there, {userName}!
              </p>
              <p className="text-sm text-gray-500">
                {aiMessage || "We're analysing your writing — hang tight!"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------
  // Error UI
  // ----------------------------
  if (error || hasAiFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Evaluation Error</h2>
            <p className="text-sm text-gray-600 mb-4">
              {error || aiMessage || "Something went wrong during evaluation."}
            </p>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeDoc) return null;

  // ----------------------------
  // Derived KPI values (from selectedDoc)
  // ----------------------------
  const evaluatedAtRaw = unwrapDate(feedback?.meta?.evaluated_at || activeDoc?.ai?.evaluated_at);
  const evaluatedAtLabel =
    evaluatedAtRaw && !isNaN(new Date(evaluatedAtRaw).getTime())
      ? new Date(evaluatedAtRaw).toLocaleDateString()
      : null;

  const criteria = feedback?.criteria || [];
  const reviewSections = feedback?.review_sections || [];
  const strengths = feedback?.overall?.strengths || [];
  const weaknesses = feedback?.overall?.weaknesses || [];
  const oneLineSummary = feedback?.overall?.one_line_summary;
  const band = feedback?.overall?.band;

  const totalScore = feedback?.overall?.total_score || 0;
  const maxScore = feedback?.overall?.max_score || 0;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const wordCount = feedback?.meta?.word_count ?? feedback?.word_count;
  const wordCountReview =
    feedback?.meta?.word_count_review || feedback?.meta?.word_count_feedback;

  const isLocalEval = feedback?.local_eval === true;
  const feedbackStatus = feedback?.status;
  const feedbackMessage = feedback?.message;

  // ✅ NEW: Attempts count (scoped to date or quiz)
  const attemptsUsed = selectedDate
    ? filteredResults.length || "—"
    : quizAttempts.length || "—";

  // Derive email/quizName from activeDoc for display
  const displayEmail = activeDoc?.user?.email_address || email || "";
  const displayQuizName = activeDoc?.quiz_name || quizName || "";

  // ----------------------------
  // Main UI
  // ----------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-4 py-8">
      {/* No Data Modal */}
      <NoDataModal
        isOpen={showNoDataModal}
        onClose={() => setShowNoDataModal(false)}
        onClearFilter={() => {
          setSelectedDate(null);
          setShowNoDataModal(false);
        }}
      />

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Evaluation Results
            </h1>

            <p className="text-sm text-gray-500 mt-1 truncate">
              {displayEmail} • {displayQuizName}
            </p>
          </div>

          {/* ✅ NEW: Date picker + Avatar */}
          <div className="shrink-0 self-start flex items-center gap-3">
            <DateRangeFilter
              selectedDate={selectedDate}
              onChange={setSelectedDate}
              testTakenDates={testTakenDates}
            />
            <AvatarMenu />
          </div>
        </div>

        {/* ✅ NEW: KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Score</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalScore} / {maxScore}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Percentage</p>
              <p className="text-2xl font-bold text-gray-900">{percentage}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Band</p>
              <p className={`text-lg font-bold ${
                band?.includes("Above") ? "text-green-600" :
                band?.includes("Below") ? "text-red-600" : "text-yellow-600"
              }`}>
                {band || "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Attempts</p>
              <p className="text-2xl font-bold text-gray-900">{attemptsUsed}</p>
            </CardContent>
          </Card>
        </div>

        {/* Warning for local eval */}
        {isLocalEval && (feedbackStatus === "not_enough_response" || feedbackMessage) && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />

                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-orange-900 mb-2">
                    {feedbackStatus === "not_enough_response" ? "Insufficient Response" : "Evaluation Notice"}
                  </h3>

                  <p className="text-orange-800 mb-3">
                    {feedbackMessage ||
                      "Your response did not meet the minimum requirements for a full evaluation."}
                  </p>

                  {wordCount !== undefined && wordCount !== null && (
                    <p className="text-sm text-orange-700">
                      Word count: <span className="font-semibold">{wordCount}</span>
                      {wordCount < 20 && " (minimum ~20 words recommended for evaluation)"}
                    </p>
                  )}

                  <div className="mt-4 p-3 bg-white rounded border border-orange-200">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">💡 Tip: </span>
                      Please provide a more detailed response to receive comprehensive feedback on your writing.
                      Try expanding your ideas with examples, explanations, and supporting details.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overall Score */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Overall Performance</span>
              {activeDoc?.attempt && (
                <Badge
                  variant="secondary"
                  className="text-base px-4 py-1.5 bg-gray-200 text-gray-700 font-semibold"
                >
                  Attempt {activeDoc.attempt}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {evaluatedAtLabel ? `Evaluated on ${evaluatedAtLabel}` : "Evaluation details"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!isLocalEval && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Score</p>
                  <p className="text-4xl font-bold">
                    {totalScore} / {maxScore}
                  </p>
                  {band && (
                    <Badge
                      variant={
                        band.includes("Above")
                          ? "default"
                          : band.includes("Below")
                            ? "destructive"
                            : "secondary"
                      }
                      className="mt-2"
                    >
                      {band}
                    </Badge>
                  )}
                </div>

                <div className="text-center">
                  <Badge
                    variant={
                      percentage >= 70 ? "default" : percentage >= 50 ? "secondary" : "destructive"
                    }
                    className="text-2xl px-6 py-3"
                  >
                    {percentage}%
                  </Badge>
                </div>
              </div>
            )}

            {oneLineSummary && (
              <div className={!isLocalEval ? "pt-4 border-t" : ""}>
                <div className="flex items-start gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-900 font-semibold text-lg">{oneLineSummary}</p>
                </div>
              </div>
            )}

            {feedback?.overall?.summary && (
              <div className="pt-4 border-t">
                <p className="text-gray-700">{feedback.overall.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment Details */}
        {(!isLocalEval || feedback?.meta || feedback?.year_level) && (
          <Card>
            <CardHeader>
              <CardTitle>Assignment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Year Level</p>
                  <p className="font-medium">
                    {(feedback?.meta?.year_level || feedback?.year_level)
                      ? `Year ${feedback?.meta?.year_level || feedback?.year_level}`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Text Type</p>
                  <p className="font-medium">{feedback?.meta?.text_type || "-"}</p>
                </div>

                {!isLocalEval && (
                  <div>
                    <p className="text-sm text-gray-500">Valid Response</p>
                    <p className="font-medium">{feedback?.meta?.valid_response ? "✓ Yes" : "✗ No"}</p>
                  </div>
                )}

                {wordCount !== undefined && wordCount !== null && (
                  <div>
                    <p className="text-sm text-gray-500">Word Count</p>
                    <p className="font-medium">{wordCount}</p>
                  </div>
                )}
              </div>

              {!isLocalEval && (
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {feedback?.meta?.prompt_relevance && (
                    <div
                      className={`p-3 border-l-4 rounded ${
                        feedback.meta.prompt_relevance.verdict === "on_topic"
                          ? "bg-green-50 border-green-500"
                          : "bg-red-50 border-red-500"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">
                          Prompt Relevance: {" "}
                          {feedback.meta.prompt_relevance.verdict === "on_topic" ? "On Topic ✓" : "Off Topic ✗"}
                        </p>
                        <Badge
                          variant={
                            feedback.meta.prompt_relevance.verdict === "on_topic" ? "default" : "destructive"
                          }
                        >
                          {feedback.meta.prompt_relevance.score}%
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{feedback.meta.prompt_relevance.note}</p>
                      {feedback.meta.prompt_relevance.evidence && (
                        <p className="text-sm text-gray-600 italic">
                          Evidence: "{feedback.meta.prompt_relevance.evidence}"
                        </p>
                      )}
                    </div>
                  )}

                  {wordCountReview && (
                    <div
                      className={`p-3 border-l-4 rounded ${
                        wordCountReview.status === "below_recommended"
                          ? "bg-yellow-50 border-yellow-500"
                          : wordCountReview.status === "within_range"
                            ? "bg-green-50 border-green-500"
                            : "bg-blue-50 border-blue-500"
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <FileText className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm font-semibold">Word Count Review</p>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{wordCountReview.message}</p>
                      {wordCountReview.suggestion && (
                        <p className="text-sm text-gray-600 italic">{wordCountReview.suggestion}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Strengths / Weaknesses */}
        {!isLocalEval && (strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                {strengths.length === 0 ? (
                  <p className="text-sm text-gray-600">No strengths listed.</p>
                ) : (
                  <ul className="space-y-2">
                    {strengths.map((strength, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span className="text-sm text-gray-700">{strength}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weaknesses.length === 0 ? (
                  <p className="text-sm text-gray-600">No areas for improvement listed.</p>
                ) : (
                  <ul className="space-y-2">
                    {weaknesses.map((weakness, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-orange-600 mt-0.5">→</span>
                        <span className="text-sm text-gray-700">{weakness}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Review Sections */}
        {!isLocalEval && reviewSections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                Detailed Feedback & Suggestions
              </CardTitle>
              <CardDescription>Targeted recommendations to improve your writing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {reviewSections.map((section, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-white"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <h3 className="font-bold text-lg text-gray-900">{section?.title || "Feedback"}</h3>
                    </div>

                    {section?.items && section.items.length > 0 ? (
                      <ul className="space-y-2 ml-8">
                        {section.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-2">
                            <span className="text-blue-600 mt-1">•</span>
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : section?.feedback ? (
                      <p className="text-gray-700 ml-8 whitespace-pre-line">{section.feedback}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scores Breakdown */}
        {!isLocalEval && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed Scores by Criterion</CardTitle>
              <CardDescription>Breakdown of each assessment area</CardDescription>
            </CardHeader>
            <CardContent>
              {criteria.length === 0 ? (
                <p className="text-sm text-gray-600">No detailed score breakdown found.</p>
              ) : (
                <div className="space-y-6">
                  {criteria.map((criterion, index) => {
                    if (criterion?.score === null) return null;

                    const score = criterion?.score ?? 0;
                    const max = criterion?.max ?? 0;
                    const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;

                    return (
                      <div
                        key={`${criterion?.name || "c"}-${index}`}
                        className="border-b pb-4 last:border-b-0"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-semibold text-lg">{criterion?.name || "Unknown Criterion"}</p>
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-2xl font-bold">
                              {score} / {max}
                            </p>
                            <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 70 ? "bg-green-600" : pct >= 50 ? "bg-yellow-600" : "bg-red-600"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {criterion?.evidence_quote?.trim() ? (
                          <div className="mt-2 p-3 bg-gray-50 border-l-4 border-gray-400 rounded italic">
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold not-italic">Evidence: </span>"{criterion.evidence_quote}"
                            </p>
                          </div>
                        ) : null}

                        {criterion?.suggestion ? (
                          <div className="mt-2 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold">💡 Suggestion: </span>
                              {criterion.suggestion}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Student Writing */}
        {activeDoc?.qna?.[0]?.answer_text && (
          <Card>
            <CardHeader>
              <CardTitle>Your Writing</CardTitle>
              <CardDescription>The text you submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none bg-white p-6 rounded-lg border">
                <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">{activeDoc.qna[0].answer_text}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
