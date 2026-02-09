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
import AvatarMenu from "@/app/components/dashboardComponents/AvatarMenu";

import { fetchLatestWritingByEmailAndQuiz, normalizeEmail } from "@/app/utils/api";

export default function ResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = normalizeEmail(searchParams.get("email"));
  const quizName = String(searchParams.get("quiz") || "").trim();

  const userName = useMemo(() => (email ? email.split("@")[0] : "User"), [email]);

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------
  // Fetch latest evaluation
  // ----------------------------
  useEffect(() => {
    if (!email || !quizName) {
      navigate("/");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchLatestWritingByEmailAndQuiz(email, quizName);
        if (cancelled) return;

        setDoc(data);
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
  }, [email, quizName, navigate]);

  // If doc returned but missing ai block, route back
  useEffect(() => {
    if (!loading && doc && !doc.ai) {
      navigate("/WritingLookupQuizResults");
    }
  }, [loading, doc, navigate]);

  // ----------------------------
  // AI state (robust)
  // ----------------------------
  const feedback = doc?.ai?.feedback;
  const aiStatus = doc?.ai?.status;      // expect: processing | done/completed | error
  const aiMessage = doc?.ai?.message;

  const isAiReady = aiStatus === "done" || aiStatus === "completed";
  const isAiError = aiStatus === "error";
  const isProcessing = loading || (!!doc && !isAiReady && !isAiError);
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
                Almost there, {userName}! Getting your feedback ready…
              </p>
              <p className="text-sm sm:text-base text-gray-600">
                Please wait a moment while we prepare your evaluation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------
  // Error / No doc
  // ----------------------------
  if (error || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="py-12 text-center">
            <p className="text-xl font-medium text-red-600 mb-4">
              {error || "No data found"}
            </p>
            <Button onClick={() => navigate("/WritingLookupQuizResults")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Input
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------
  // AI failed UI
  // ----------------------------
  if (hasAiFailed) {
    let errorTitle = "AI Evaluation Failed";
    let errorMessage = "The AI was unable to evaluate your writing.";
    let errorSuggestion =
      "Please ensure you have written a substantial response and try again.";

    // Show message details if provided (but don't rely on exact text)
    if (aiMessage) {
      errorMessage = "The AI encountered an error while processing your evaluation.";
      errorSuggestion = "Please try again later or contact support if the issue persists.";
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-600 mb-4">{errorTitle}</h2>
            <p className="text-gray-700 mb-2">{errorMessage}</p>

            {aiMessage && (
              <p className="text-sm text-gray-600 mb-6 italic">
                Error details: {aiMessage}
              </p>
            )}

            <p className="text-gray-600 mb-6">{errorSuggestion}</p>
            <Button onClick={() => navigate("/WritingLookupQuizResults")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Input
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------
  // Helpers
  // ----------------------------
  const getDateValue = (dateObj) => {
    if (!dateObj) return null;
    if (typeof dateObj === "string") return dateObj;
    if (typeof dateObj === "object" && "$date" in dateObj) return dateObj.$date;
    return dateObj;
  };

  const evaluatedAtRaw =
    getDateValue(doc?.ai?.evaluated_at) || getDateValue(doc?.submitted_at);

  const evaluatedAtLabel =
    evaluatedAtRaw && !Number.isNaN(new Date(evaluatedAtRaw).getTime())
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

  // ----------------------------
  // Main UI
  // ----------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Evaluation Results
            </h1>

            <p className="text-sm text-gray-500 mt-1 truncate">
              {email} • {quizName}
            </p>
          </div>

          <div className="shrink-0 self-start">
            <AvatarMenu />
          </div>
        </div>

        {/* Warning for local eval */}
        {isLocalEval && (feedbackStatus === "not_enough_response" || feedbackMessage) && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />

                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-orange-900 mb-2">
                    {feedbackStatus === "not_enough_response"
                      ? "Insufficient Response"
                      : "Evaluation Notice"}
                  </h3>

                  <p className="text-orange-800 mb-3">
                    {feedbackMessage ||
                      "Your response did not meet the minimum requirements for a full evaluation."}
                  </p>

                  {wordCount !== undefined && wordCount !== null && (
                    <p className="text-sm text-orange-700">
                      Word count: <span className="font-semibold">{wordCount}</span>
                      {wordCount < 20 &&
                        " (minimum ~20 words recommended for evaluation)"}
                    </p>
                  )}

                  <div className="mt-4 p-3 bg-white rounded border border-orange-200">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">💡 Tip: </span>
                      Please provide a more detailed response to receive comprehensive
                      feedback on your writing. Try expanding your ideas with examples,
                      explanations, and supporting details.
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
              {doc?.attempt && (
                <Badge
                  variant="secondary"
                  className="text-base px-4 py-1.5 bg-gray-200 text-gray-700 font-semibold"
                >
                  Attempt {doc.attempt}
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
                          Prompt Relevance:{" "}
                          {feedback.meta.prompt_relevance.verdict === "on_topic"
                            ? "On Topic ✓"
                            : "Off Topic ✗"}
                        </p>
                        <Badge
                          variant={
                            feedback.meta.prompt_relevance.verdict === "on_topic"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {feedback.meta.prompt_relevance.score}%
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">
                        {feedback.meta.prompt_relevance.note}
                      </p>
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
                      <h3 className="font-bold text-lg text-gray-900">
                        {section?.title || "Feedback"}
                      </h3>
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
                    const pct =
                      max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;

                    return (
                      <div
                        key={`${criterion?.name || "c"}-${index}`}
                        className="border-b pb-4 last:border-b-0"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-semibold text-lg">
                              {criterion?.name || "Unknown Criterion"}
                            </p>
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
                              <span className="font-semibold not-italic">Evidence: </span>"
                              {criterion.evidence_quote}"
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
        {doc?.qna?.[0]?.answer_text && (
          <Card>
            <CardHeader>
              <CardTitle>Your Writing</CardTitle>
              <CardDescription>The text you submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none bg-white p-6 rounded-lg border">
                <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {doc.qna[0].answer_text}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}