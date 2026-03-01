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
import DateRangeWritingFilter from "@/app/components/dashboardComponents/DateRangeWritingFilter";
import TrialGateOverlay from "@/app/components/common/TrialGateOverlay";
import { useAuth } from "@/app/context/AuthContext";

import {
  fetchLatestWritingByEmailAndQuiz,
  fetchWritingByResponseId,
  fetchWritingsByUsername,
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
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handleEsc); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="text-2xl">📅</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">No Results Found</h2>
            <p className="text-sm text-gray-600 mt-1">There are no writing attempts recorded for the selected date.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition">Close</button>
          <button onClick={onClearFilter} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">Clear Filter</button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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

  const responseId = String(searchParams.get("r") || "").trim();
  const usernameParam = String(searchParams.get("username") || "").trim();
  const email = normalizeEmail(searchParams.get("email"));
  const quizName = String(searchParams.get("quiz") || "").trim();
  const hasFallback = !!email && !!quizName;
  const userName = useMemo(() => (email ? email.split("@")[0] : "User"), [email]);

  const [doc, setDoc] = useState(null);
  const [writingsList, setWritingsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [selectedAttemptOverride, setSelectedAttemptOverride] = useState(null);

  const { childToken, childProfile, parentToken } = useAuth();
const isParentViewing = !childToken && !!parentToken;
const childStatus = childProfile?.status || "trial";
const yearLevel = childProfile?.yearLevel || null;

const viewerType = childToken && !isParentViewing
  ? "child"
  : isParentViewing
    ? "parent_viewing_child"
    : "parent";

  // --- Fetch ---
  useEffect(() => {
    if (!responseId && !hasFallback) { navigate("/"); return; }
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true); setError(null);
        const data = responseId
          ? await fetchWritingByResponseId(responseId)
          : await fetchLatestWritingByEmailAndQuiz(email, quizName);
        if (cancelled) return;
        if (!data) { setError("No writing document found."); setLoading(false); return; }
        setDoc(data);
        const effectiveUsername = usernameParam || data?.user?.user_name || "";
        if (effectiveUsername) {
          try { const all = await fetchWritingsByUsername(effectiveUsername); if (!cancelled) setWritingsList(all || []); }
          catch { if (!cancelled) setWritingsList([]); }
        }
        setLoading(false);
      } catch (err) { if (!cancelled) { setError(err?.message || "Failed to load writing evaluation."); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [responseId, hasFallback, email, quizName, usernameParam, navigate]);

  // AI polling
  useEffect(() => {
    if (!doc || !isAiPending(doc)) return;
    let cancelled = false; let timer; let pollCount = 0;
    const poll = async () => {
      pollCount++;
      if (pollCount > 60) { setError("AI evaluation timed out. Please try again in 1–2 minutes."); return; }
      try {
        const latest = responseId ? await fetchWritingByResponseId(responseId) : await fetchLatestWritingByEmailAndQuiz(email, quizName);
        if (cancelled) return; setDoc(latest);
        if (isAiPending(latest)) timer = setTimeout(poll, 4000);
      } catch { if (!cancelled) timer = setTimeout(poll, 6000); }
    };
    timer = setTimeout(poll, 2000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [responseId, hasFallback, email, quizName, doc]);

  useEffect(() => { if (!loading && doc && !doc.ai) navigate("https://www.flexiquiz.com/Dashboard/Index"); }, [loading, doc, navigate]);

  const quizAttempts = useMemo(() => {
    if (!doc) return [];
    const subjectParam = searchParams.get("subject") || "";
    if (subjectParam === "Writing" && usernameParam) return writingsList;
    return writingsList.filter((w) => w.quiz_name === doc.quiz_name);
  }, [writingsList, doc, searchParams, usernameParam]);

  const filteredResults = useMemo(() => {
    if (!selectedDate) return quizAttempts;
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
    return quizAttempts.filter((w) => {
      const raw = unwrapDate(w?.submitted_at || w?.date_submitted || w?.date_created || w?.createdAt);
      if (!raw) return false; const dt = new Date(raw); return dt >= start && dt <= end;
    });
  }, [quizAttempts, selectedDate]);

  useEffect(() => { if (selectedDate) setShowNoDataModal(filteredResults.length === 0); }, [selectedDate, filteredResults]);

  const selectedDoc = useMemo(() => {
    if (selectedAttemptOverride) return selectedAttemptOverride;
    if (!filteredResults.length) return doc;
    return [...filteredResults].sort((a, b) =>
      new Date(unwrapDate(b.submitted_at || b.date_submitted || b.createdAt)) - new Date(unwrapDate(a.submitted_at || a.date_submitted || a.createdAt))
    )[0];
  }, [filteredResults, doc, selectedAttemptOverride]);

  const testTakenDates = useMemo(() => {
    return quizAttempts.map((w) => {
      const raw = unwrapDate(w?.submitted_at || w?.date_submitted || w?.date_created || w?.createdAt);
      if (!raw) return null; const date = new Date(raw);
      if (isNaN(date.getTime())) return null; date.setHours(0, 0, 0, 0); return date;
    }).filter(Boolean);
  }, [quizAttempts]);

  const activeDoc = selectedDoc || doc;
  const feedback = activeDoc?.ai?.feedback;
  const aiStatus = activeDoc?.ai?.status;
  const aiMessage = activeDoc?.ai?.message;
  const isAiError = aiStatus === "error";
  const isProcessing = loading || (activeDoc && isAiPending(activeDoc));
  const hasAiFailed = isAiError;

  // --- Loading UI ---
  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-2 sm:p-3">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-6 px-4 sm:py-8 sm:px-6">
            <img src={waitingGif} alt="Loading animation" className="w-50 h-50 sm:w-56 sm:h-56 object-contain mb-4" />
            <div className="text-center space-y-2">
              <p className="text-xl sm:text-2xl font-semibold text-gray-900">Almost there, {userName}!</p>
              <p className="text-sm text-gray-500">{aiMessage || "We're analysing your writing — hang tight!"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Error UI ---
  if (error || hasAiFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-lg shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Evaluation Error</h2>
            <p className="text-sm text-gray-600 mb-6">{error || aiMessage || "Something went wrong during evaluation."}</p>
            <button onClick={() => navigate("/child-dashboard")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeDoc) return null;

  // --- Derived values ---
  const evaluatedAtRaw = unwrapDate(feedback?.meta?.evaluated_at || activeDoc?.ai?.evaluated_at);
  const evaluatedAtLabel = evaluatedAtRaw && !isNaN(new Date(evaluatedAtRaw).getTime()) ? new Date(evaluatedAtRaw).toLocaleDateString() : null;
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
  const wordCountReview = feedback?.meta?.word_count_review || feedback?.meta?.word_count_feedback;
  const isLocalEval = feedback?.local_eval === true;
  const feedbackStatus = feedback?.status;
  const feedbackMessage = feedback?.message;
  const attemptsUsed = selectedDate ? filteredResults.length || "—" : quizAttempts.length || "—";
  const displayEmail = activeDoc?.user?.email_address || email || "";
  const displayQuizName = activeDoc?.quiz_name || quizName || "";
  const displayName = `${activeDoc?.user?.first_name || ""} ${activeDoc?.user?.last_name || ""}`.trim() || userName || "Student";

  // --- Main UI ---
  return (
    <TrialGateOverlay
    isTrialUser={childStatus === "trial"}
    preset="writing"
    viewerType={viewerType}
    yearLevel={yearLevel}>
    <div className="relative min-h-screen bg-gray-100">
      <NoDataModal isOpen={showNoDataModal} onClose={() => setShowNoDataModal(false)}
        onClearFilter={() => { setSelectedDate(null); setSelectedAttemptOverride(null); setShowNoDataModal(false); }} />

      {/* ═══════════════ STICKY HEADER ═══════════════ */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-gray-200/70 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3 gap-2 sm:gap-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate max-w-[300px]">{displayQuizName || "Writing"}</p>
            <h1 className="text-lg sm:text-xl font-bold leading-tight truncate">
              <span className="text-blue-600">{displayName}</span>
              <span className="text-gray-400 font-normal mx-1.5">—</span>
              <span className="text-purple-600">Writing Evaluation</span>
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 mr-2">
              <span className="font-semibold text-gray-700">{attemptsUsed}</span>
              <span>attempt{attemptsUsed !== 1 && attemptsUsed !== "1" ? "s" : ""}</span>
            </div>
            <DateRangeWritingFilter
              selectedDate={selectedDate}
              onChange={(date) => { setSelectedDate(date); setSelectedAttemptOverride(null); }}
              testTakenDates={testTakenDates}
              quizAttempts={quizAttempts}
              onAttemptSelect={(attempt) => { setSelectedAttemptOverride(attempt); }}
            />
            <AvatarMenu />
          </div>
        </div>
      </header>

      {/* ═══════════════ DASHBOARD CONTENT ═══════════════ */}
      <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Score</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{totalScore}<span className="text-lg text-gray-400 font-normal"> / {maxScore}</span></p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Percentage</p>
            <p className={`text-3xl font-bold mt-1 ${percentage >= 70 ? "text-green-600" : percentage >= 50 ? "text-yellow-600" : "text-red-600"}`}>{percentage}%</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Band</p>
            <p className={`text-xl font-bold mt-1 ${band?.includes("Above") ? "text-green-600" : band?.includes("Below") ? "text-red-600" : "text-yellow-600"}`}>{band || "—"}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Attempts</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{attemptsUsed}</p>
          </div>
        </div>

        {/* Warning for local eval */}
        {isLocalEval && (feedbackStatus === "not_enough_response" || feedbackMessage) && (
          <div className="bg-orange-50 rounded-xl border border-orange-200 shadow-sm p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-orange-900 mb-2">{feedbackStatus === "not_enough_response" ? "Insufficient Response" : "Evaluation Notice"}</h3>
                <p className="text-orange-800 mb-3">{feedbackMessage || "Your response did not meet the minimum requirements for a full evaluation."}</p>
                {wordCount !== undefined && wordCount !== null && (
                  <p className="text-sm text-orange-700">Word count: <span className="font-semibold">{wordCount}</span>{wordCount < 20 && " (minimum ~20 words recommended for evaluation)"}</p>
                )}
                <div className="mt-4 p-3 bg-white rounded-lg border border-orange-200">
                  <p className="text-sm text-gray-700"><span className="font-semibold">💡 Tip: </span>Please provide a more detailed response to receive comprehensive feedback on your writing.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two-column: Overall Performance + Strengths/Weaknesses */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Overall Performance</span>
                {activeDoc?.attempt && (
                  <Badge variant="secondary" className="text-base px-4 py-1.5 bg-purple-100 text-purple-700 font-semibold">Attempt {activeDoc.attempt}</Badge>
                )}
              </CardTitle>
              <CardDescription>{evaluatedAtLabel ? `Evaluated on ${evaluatedAtLabel}` : "Evaluation details"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {oneLineSummary && <p className="text-gray-700 italic bg-gray-50 rounded-lg p-3 border border-gray-100">{oneLineSummary}</p>}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><p className="text-sm text-gray-500">Year Level</p><p className="font-medium">{feedback?.meta?.year_level || feedback?.year_level ? `Year ${feedback?.meta?.year_level || feedback?.year_level}` : "-"}</p></div>
                <div><p className="text-sm text-gray-500">Text Type</p><p className="font-medium">{feedback?.meta?.text_type || "-"}</p></div>
                {!isLocalEval && <div><p className="text-sm text-gray-500">Valid Response</p><p className="font-medium">{feedback?.meta?.valid_response ? "✓ Yes" : "✗ No"}</p></div>}
                {wordCount !== undefined && wordCount !== null && <div><p className="text-sm text-gray-500">Word Count</p><p className="font-medium">{wordCount}</p></div>}
              </div>

              {!isLocalEval && (
                <div className="grid md:grid-cols-2 gap-4">
                  {feedback?.meta?.prompt_relevance && (
                    <div className={`p-3 border-l-4 rounded-lg ${feedback.meta.prompt_relevance.verdict === "on_topic" ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">Prompt Relevance: {feedback.meta.prompt_relevance.verdict === "on_topic" ? "On Topic ✓" : "Off Topic ✗"}</p>
                        <Badge variant={feedback.meta.prompt_relevance.verdict === "on_topic" ? "default" : "destructive"}>{feedback.meta.prompt_relevance.score}%</Badge>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{feedback.meta.prompt_relevance.note}</p>
                      {feedback.meta.prompt_relevance.evidence && <p className="text-sm text-gray-600 italic">Evidence: "{feedback.meta.prompt_relevance.evidence}"</p>}
                    </div>
                  )}
                  {wordCountReview && (
                    <div className={`p-3 border-l-4 rounded-lg ${wordCountReview.status === "below_recommended" ? "bg-yellow-50 border-yellow-500" : wordCountReview.status === "within_range" ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"}`}>
                      <p className="text-sm font-semibold mb-1">Word Count Review</p>
                      <p className="text-sm text-gray-700">{wordCountReview.message}</p>
                      {wordCountReview.suggestion && <p className="text-sm text-gray-600 mt-1 italic">{wordCountReview.suggestion}</p>}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!isLocalEval && (strengths.length > 0 || weaknesses.length > 0) && (
            <div className="lg:col-span-5 flex flex-col gap-5">
              <Card className="border-green-200 shadow-sm hover:shadow-md transition-shadow flex-1">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-green-700 text-base"><CheckCircle2 className="w-5 h-5" />Strengths</CardTitle></CardHeader>
                <CardContent>
                  {strengths.length === 0 ? <p className="text-sm text-gray-600">No strengths listed.</p> : (
                    <ul className="space-y-2">{strengths.map((s, i) => <li key={i} className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span><span className="text-sm text-gray-700">{s}</span></li>)}</ul>
                  )}
                </CardContent>
              </Card>
              <Card className="border-orange-200 shadow-sm hover:shadow-md transition-shadow flex-1">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-orange-700 text-base"><AlertTriangle className="w-5 h-5" />Areas for Improvement</CardTitle></CardHeader>
                <CardContent>
                  {weaknesses.length === 0 ? <p className="text-sm text-gray-600">No areas for improvement listed.</p> : (
                    <ul className="space-y-2">{weaknesses.map((w, i) => <li key={i} className="flex items-start gap-2"><span className="text-orange-600 mt-0.5">→</span><span className="text-sm text-gray-700">{w}</span></li>)}</ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Review Sections */}
        {!isLocalEval && reviewSections.length > 0 && (
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-blue-600" />Detailed Feedback & Suggestions</CardTitle>
              <CardDescription>Targeted recommendations to improve your writing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {reviewSections.map((section, index) => (
                  <div key={index} className="border rounded-xl p-4 bg-gradient-to-r from-blue-50 to-white hover:from-blue-100/60 transition-colors">
                    <div className="flex items-start gap-3 mb-3">
                      <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <h3 className="font-bold text-base text-gray-900">{section?.title || "Feedback"}</h3>
                    </div>
                    {section?.items && section.items.length > 0 ? (
                      <ul className="space-y-2 ml-8">{section.items.map((item, i) => <li key={i} className="flex items-start gap-2"><span className="text-blue-600 mt-1 flex-shrink-0">•</span><span className="text-sm text-gray-700">{item}</span></li>)}</ul>
                    ) : section?.feedback ? <p className="text-gray-700 ml-8 whitespace-pre-line text-sm">{section.feedback}</p> : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scores Breakdown */}
        {!isLocalEval && (
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Detailed Scores by Criterion</CardTitle>
              <CardDescription>Breakdown of each assessment area</CardDescription>
            </CardHeader>
            <CardContent>
              {criteria.length === 0 ? <p className="text-sm text-gray-600">No detailed score breakdown found.</p> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                  {criteria.map((criterion, index) => {
                    if (criterion?.score === null) return null;
                    const score = criterion?.score ?? 0;
                    const max = criterion?.max ?? 0;
                    const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;
                    return (
                      <div key={`${criterion?.name || "c"}-${index}`} className="border rounded-xl p-4 hover:border-gray-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <p className="font-semibold text-base flex-1">{criterion?.name || "Unknown Criterion"}</p>
                          <p className="text-xl font-bold ml-4">{score} / {max}</p>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mb-3">
                          <div className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        {criterion?.evidence_quote?.trim() && (
                          <div className="p-2.5 bg-gray-50 border-l-4 border-gray-300 rounded italic mb-2">
                            <p className="text-xs text-gray-600"><span className="font-semibold not-italic">Evidence: </span>"{criterion.evidence_quote}"</p>
                          </div>
                        )}
                        {criterion?.suggestion && (
                          <div className="p-2.5 bg-blue-50 border-l-4 border-blue-400 rounded">
                            <p className="text-xs text-gray-700"><span className="font-semibold">💡 </span>{criterion.suggestion}</p>
                          </div>
                        )}
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
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-gray-600" />Your Writing</CardTitle>
              <CardDescription>The text you submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none bg-gray-50 p-6 rounded-xl border border-gray-200">
                <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">{activeDoc.qna[0].answer_text}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </TrialGateOverlay>
  );
}
