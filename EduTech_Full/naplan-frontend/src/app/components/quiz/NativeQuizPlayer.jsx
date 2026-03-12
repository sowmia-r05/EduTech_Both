/**
 * NativeQuizPlayer.jsx  (v5 — FASTER LOADING: parallel API calls)
 *
 * ✅ v5 changes:
 *   - start + questions fetched in PARALLEL (Promise.all) — saves ~500ms-1s
 *   - everything else unchanged from v4
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";
import ExamProctor, { exitFullscreen } from "./ExamProctor";
import QuizHeader from "./QuizHeader";
import QuestionRenderer from "./QuestionRenderer";
import QuizNavigation from "./QuizNavigation";
import QuizReview from "./QuizReview";
import QuizResult from "./QuizResult";

const API = import.meta.env.VITE_API_BASE_URL || "";

// ── Keep backend warm (prevents Render free-tier cold starts) ──
setInterval(() => { fetch(`${API}/`).catch(() => {}); }, 10 * 60 * 1000);

/* ═══════════════════════════════════════
   QuizMediaPanel — collapsible audio/video
   ═══════════════════════════════════════ */
function QuizMediaPanel({ voiceUrl, videoUrl }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!voiceUrl && !videoUrl) return null;

  const getEmbedUrl = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return null;
  };

  const embedUrl = getEmbedUrl(videoUrl);

  return (
    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          {videoUrl ? "🎬" : "🔊"} Quiz Resources
        </span>
        <svg className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {videoUrl && (
            <div>
              {embedUrl ? (
                <iframe src={embedUrl} className="w-full aspect-video rounded-lg"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen title="Quiz Video" />
              ) : (
                <video src={videoUrl} controls className="w-full rounded-lg max-h-64" preload="metadata">
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          )}
          {voiceUrl && (
            <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
              <span className="text-lg">🔊</span>
              <audio src={voiceUrl} controls className="flex-1 h-8" preload="metadata">
                Your browser does not support the audio tag.
              </audio>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function NativeQuizPlayer({ quiz, onClose, proctored = true, childId, onViewAnalytics, onViewAIFeedback, childStatus }) {
  const { activeToken } = useAuth();

  const [phase, setPhase] = useState("proctoring");
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [quizMeta, setQuizMeta] = useState(null);
  const [violations, setViolations] = useState(0);
  const [voiceUrl, setVoiceUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false); // ✅ suppress violations during file picker

  const autoSaveTimer = useRef(null);
  const violationsRef = useRef(0);
  const submitCalledRef = useRef(false);

  useEffect(() => {
    if (!proctored && phase === "proctoring") setPhase("loading");
  }, [proctored, phase]);

  const apiFetch = useCallback(
    (url, opts = {}) =>
      fetch(`${API}${url}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
          ...opts.headers,
        },
      }),
    [activeToken]
  );

  // ═══ PROCTORING CALLBACKS ═══
  const handleProctoringStart = useCallback(() => setPhase("loading"), []);
  const handleViolation = useCallback(({ type, count }) => {
    violationsRef.current = count;
    setViolations(count);
  }, []);

  // ═══════════════════════════════════════════════════════
  // QUIZ INIT — ✅ v5: start + questions fetched IN PARALLEL
  // Saves ~500ms–1s compared to sequential awaits
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        // ✅ Fire both requests at the same time
        const [startRes, qRes] = await Promise.all([
          apiFetch(`/api/quizzes/${quiz.quiz_id}/start`, {
            method: "POST",
            body: JSON.stringify({ childId: childId || undefined }),
          }),
          apiFetch(`/api/quizzes/${quiz.quiz_id}/questions`),
        ]);

        // Check for errors
        if (!startRes.ok) {
          const d = await startRes.json();
          throw new Error(d.error || "Failed to start quiz");
        }
        if (!qRes.ok) {
          throw new Error("Failed to load questions");
        }

        // Parse both responses in parallel too
        const [startData, qData] = await Promise.all([
          startRes.json(),
          qRes.json(),
        ]);

        if (cancelled) return;

        setAttemptId(startData.attempt_id);
        setQuizMeta(startData.quiz);
        setQuestions(qData.questions || []);
        setVoiceUrl(qData.voice_url || null);
        setVideoUrl(qData.video_url || null);

        // ✅ RESUME: restore saved answers if this is a resumed attempt
        if (startData.resumed) {
          console.log("🔄 Resuming in-progress quiz attempt...");
          try {
            const resumeRes = await apiFetch(
              `/api/quizzes/${quiz.quiz_id}/resume${childId ? `?childId=${childId}` : ""}`
            );
            if (resumeRes.ok) {
              const resumeData = await resumeRes.json();
              if (resumeData.saved_answers?.length > 0) {
                const restoredAnswers = {};
                for (const ans of resumeData.saved_answers) {
                  restoredAnswers[ans.question_id] = {
                    selected: ans.selected_option_ids || [],
                    text: ans.text_answer || "",
                  };
                }
                setAnswers(restoredAnswers);
                console.log(`✅ Restored ${resumeData.saved_answers.length} saved answers`);
              }
              if (
                resumeData.time_remaining_seconds !== null &&
                resumeData.time_remaining_seconds !== undefined
              ) {
                setTimeLeft(resumeData.time_remaining_seconds);
              }
            }
          } catch (resumeErr) {
            console.warn("⚠️ Could not restore saved answers:", resumeErr.message);
          }
        } else {
          const limit = startData.quiz?.time_limit_minutes || quiz.time_limit_minutes;
          if (limit) setTimeLeft(limit * 60);
        }

        setPhase("taking");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [phase, quiz, apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ COUNTDOWN TIMER ═══
  useEffect(() => {
    if (phase !== "taking" || timeLeft === null) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!submitCalledRef.current) handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timeLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ AUTO-SAVE EVERY 30s ═══
  useEffect(() => {
    if (phase !== "taking" || !attemptId) return;
    autoSaveTimer.current = setInterval(async () => {
      const payload = buildAnswersPayload();
      try {
        const res = await apiFetch(`/api/attempts/${attemptId}/autosave`, {
          method: "PATCH",
          body: JSON.stringify({ answers: payload }),
        });
        if (res.status === 410) {
          clearInterval(autoSaveTimer.current);
          if (!submitCalledRef.current) {
            console.log("Server says time expired — auto-submitting...");
            handleSubmit();
          }
        }
      } catch { /* Silent fail */ }
    }, 30000);
    return () => clearInterval(autoSaveTimer.current);
  }, [phase, attemptId, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ BUILD ANSWERS PAYLOAD ═══
  const buildAnswersPayload = useCallback(() => {
    return questions.map((q) => {
      const a = answers[q.question_id] || {};
      return {
        question_id: q.question_id,
        selected_option_ids: a.selected || [],
        text_answer: a.text || "",
      };
    });
  }, [questions, answers]);

  // ═══ ANSWER + FLAG HANDLERS ═══
  const setAnswer = useCallback((questionId, data) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] || {}), ...data } }));
  }, []);

  const toggleFlag = useCallback((questionId) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }, []);

  // ═══ NAVIGATION ═══
  const goTo = useCallback(
    (idx) => setCurrentIdx(Math.max(0, Math.min(idx, questions.length - 1))),
    [questions.length]
  );
  const goNext = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const goPrev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  // ═══ SUBMIT ═══
  const handleSubmit = useCallback(async () => {
    if (submitCalledRef.current) return;
    submitCalledRef.current = true;
    setPhase("submitting");
    clearInterval(autoSaveTimer.current);

    try {
      const payload = buildAnswersPayload();
      const res = await apiFetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: payload,
          proctoring: { violations: violationsRef.current, fullscreen_enforced: proctored },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submission failed");
      }
      const data = await res.json();
      setResult(data);
      setPhase("result");
      exitFullscreen().catch(() => {});
    } catch (err) {
      setError(err.message);
      setPhase("error");
      exitFullscreen().catch(() => {});
    }
  }, [attemptId, buildAnswersPayload, apiFetch, proctored]);

  // ═══ CANCEL ═══
  const handleCancel = () => {
    if (phase === "taking" || phase === "review") {
      if (!confirm("Are you sure you want to leave? Your progress will be lost.")) return;
    }
    exitFullscreen().catch(() => {});
    onClose?.(result);
  };

  // ─── Stats ───
  const answeredCount = questions.filter((q) => {
    const a = answers[q.question_id];
    return a && (a.selected?.length > 0 || a.text?.trim());
  }).length;
  const unansweredCount = questions.length - answeredCount;

  // ═══ RENDER: ERROR ═══
  if (phase === "error") {
    const isExpired = error?.includes("expired") || error?.includes("ATTEMPT_EXPIRED");
    const isMaxAttempts = error?.includes("Maximum attempts") || error?.includes("MAX_ATTEMPTS_REACHED");
    const isNotEntitled = error?.includes("don't have access") || error?.includes("NOT_ENTITLED");

    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isExpired ? "bg-amber-50" : isMaxAttempts ? "bg-blue-50" : isNotEntitled ? "bg-purple-50" : "bg-red-50"
          }`}>
            {isExpired ? (
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isMaxAttempts ? (
              <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isNotEntitled ? (
              <svg className="w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            {isExpired ? "Time's Up!" : isMaxAttempts ? "All Attempts Used" : isNotEntitled ? "Quiz Locked" : "Something went wrong"}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">
            {isExpired
              ? "Your time ran out for this quiz. Don't worry — your saved answers were submitted automatically."
              : isMaxAttempts
              ? "You've completed all available attempts for this quiz. Check your results to see how you did!"
              : isNotEntitled
              ? "Ask your parent to purchase a bundle to unlock this quiz."
              : error}
          </p>
          <button
            onClick={() => { exitFullscreen().catch(() => {}); onClose?.(null); }}
            className="mt-6 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ═══ RENDER: RESULT ═══
  if (phase === "result") {
  return (
    <QuizResult
      result={result}
      quizName={quizMeta?.quiz_name || quiz.quiz_name}
      violations={violations}
      childStatus={childStatus}
      onClose={() => onClose?.(result)}
      onViewAnalytics={onViewAnalytics}
      onViewAIFeedback={onViewAIFeedback}
    />
  );
}

  // ═══ RENDER: QUIZ CONTENT ═══
  const quizContent = (() => {
    if (phase === "loading" || phase === "submitting") {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-slate-500 text-sm">
              {phase === "loading" ? "Loading quiz..." : "Submitting your answers..."}
            </p>
          </div>
        </div>
      );
    }

    if (phase === "review") {
      return (
        <QuizReview
          questions={questions} answers={answers} flagged={flagged}
          onGoToQuestion={(idx) => { setCurrentIdx(idx); setPhase("taking"); }}
          onSubmit={handleSubmit} onBack={() => setPhase("taking")}
        />
      );
    }

    if (phase === "taking" && questions[currentIdx]) {
      const currentQuestion = questions[currentIdx];
      return (
        <div className="flex flex-col min-h-full">
          <QuizHeader
            quizName={quizMeta?.quiz_name || quiz.quiz_name}
            currentIdx={currentIdx} totalQuestions={questions.length}
            answeredCount={answeredCount} timeLeft={timeLeft} onCancel={handleCancel}
          />
          <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 md:px-8">
            {/* Quiz-level media (same for all questions) */}
            <QuizMediaPanel voiceUrl={voiceUrl} videoUrl={videoUrl} />
            {/* Per-question media */}
            {(questions[currentIdx]?.voice_url || questions[currentIdx]?.video_url) && (
              <QuizMediaPanel
                voiceUrl={questions[currentIdx].voice_url}
                videoUrl={questions[currentIdx].video_url}
              />
            )}
            <QuestionRenderer
              question={currentQuestion}
              questionNumber={currentIdx + 1}
              answer={answers[currentQuestion.question_id] || {}}
              isFlagged={flagged.has(currentQuestion.question_id)}
              onAnswer={(data) => setAnswer(currentQuestion.question_id, data)}
              onToggleFlag={() => toggleFlag(currentQuestion.question_id)}
              yearLevel={quiz?.year_level}
              subject={quiz?.subject}
              onUploadingChange={setIsUploading}
            />
          </main>
          <QuizNavigation
            currentIdx={currentIdx} totalQuestions={questions.length}
            questions={questions} answers={answers} flagged={flagged}
            onPrev={goPrev} onNext={goNext} onGoTo={goTo}
            onReview={() => setPhase("review")} unansweredCount={unansweredCount}
          />
        </div>
      );
    }
    return null;
  })();

  return (
    <ExamProctor
      quiz={quiz} enabled={proctored}
      onCancel={() => onClose?.({ completed: false })}
      onStart={handleProctoringStart}
      onViolation={handleViolation}
      submitting={phase === "submitting" || phase === "result"}
      uploading={isUploading}
    >
      {quizContent}
    </ExamProctor>
  );
}