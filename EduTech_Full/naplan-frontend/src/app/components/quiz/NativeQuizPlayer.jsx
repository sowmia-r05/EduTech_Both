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
   PassagePanel — left-side reading text
   ═══════════════════════════════════════ */
function PassagePanel({ passage }) {
  if (!passage) return null;
  const passageText = passage.text || passage.question_text || "";
  return (
    <div className="h-full flex flex-col bg-blue-50/40 border-r border-blue-100">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-blue-100 bg-blue-50 flex-shrink-0">
        <span className="text-base">📖</span>
        <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Reading Passage</span>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {passageText.includes("<") ? (
          <div
            className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none mb-4"
            dangerouslySetInnerHTML={{ __html: passageText }}
          />
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-4">
            {passageText}
          </p>
        )}
        {passage.image_url && (
          <img src={passage.image_url} alt="Passage" className="w-full rounded-lg border border-blue-100" />
        )}
      </div>
    </div>
  );
}
/* Returns the last free_text question before currentIdx (the active passage) */
function getActivePassage(questions, currentIdx) {
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (questions[i]?.type === "free_text") return questions[i];
  }
  return null;
}
/* ═══════════════════════════════════════
   ReadingSplitLayout — desktop split / mobile tabs
   ═══════════════════════════════════════ */
function ReadingSplitLayout({ passage, voiceUrl, videoUrl, children }) {
  const [mobileTab, setMobileTab] = useState("passage");
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Mobile tab switcher — hidden on desktop */}
      <div className="flex md:hidden border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => setMobileTab("passage")}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            mobileTab === "passage" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"
          }`}
        >
          Passage
        </button>
        <button
          onClick={() => setMobileTab("question")}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            mobileTab === "question" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400"
          }`}
        >
          Question
        </button>
      </div>
      {/* Desktop: side by side | Mobile: one tab at a time */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`w-full md:w-1/2 overflow-y-auto ${mobileTab === "question" ? "hidden md:block" : ""}`}>
          <PassagePanel passage={passage} />
        </div>
        <div className={`w-full md:w-1/2 overflow-y-auto px-6 py-6 ${mobileTab === "passage" ? "hidden md:block" : ""}`}>
          {children}
        </div>
      </div>
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
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
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
        (qData.questions || []).forEach((q) => {
        if (!q.image_url) return;
        const url = q.image_url.startsWith("http")
          ? q.image_url
          : `${import.meta.env.VITE_API_BASE_URL || ""}${q.image_url}`;
        const img = new window.Image();
        img.src = url;
      });
        setVoiceUrl(qData.voice_url || null);
        setVideoUrl(qData.video_url || null);

        // ✅ RESUME: restore saved answers if this is a resumed attempt
        if (startData.resumed) {
          console.log("Resuming in-progress quiz attempt...");
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
                console.log(`Restored ${resumeData.saved_answers.length} saved answers`);
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

        // Jump past any opening passage(s) before starting
        const firstAnswerable = (qData.questions || []).findIndex(q => q.type !== "free_text");
        if (firstAnswerable > 0) setCurrentIdx(firstAnswerable);
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

  // ═══ PRELOAD NEXT QUESTION IMAGE ═══   ← ADD THIS BLOCK HERE
  useEffect(() => {
    if (!questions || questions.length === 0) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= questions.length) return;
    const nextQuestion = questions[nextIdx];
    if (!nextQuestion?.image_url) return;

    const url = nextQuestion.image_url.startsWith("http")
      ? nextQuestion.image_url
      : `${import.meta.env.VITE_API_BASE_URL || ""}${nextQuestion.image_url}`;

    const img = new window.Image();
    img.src = url;
  }, [currentIdx, questions]);

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
 // NEW — skips free_text (passage) items during navigation
const goTo = useCallback(
  (idx) => setCurrentIdx(Math.max(0, Math.min(idx, questions.length - 1))),
  [questions.length]
);
const goNext = useCallback(() => {
  let next = currentIdx + 1;
  while (next < questions.length && questions[next]?.type === "free_text") next++;
  if (next < questions.length) setCurrentIdx(next);
}, [currentIdx, questions]);
const goPrev = useCallback(() => {
  let prev = currentIdx - 1;
  while (prev >= 0 && questions[prev]?.type === "free_text") prev--;
  if (prev >= 0) setCurrentIdx(prev);
}, [currentIdx, questions]);
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
  // ── Skip past any opening free_text passage when quiz starts ──

  // ─── Stats ───
  const answeredCount = questions.filter((q) => {
    if (q.type === "free_text") return false; // ← exclude passages
    const a = answers[q.question_id];
    return a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
  }).length;

  const unansweredCount = questions.filter((q) => {
  if (q.type === "free_text") return false; // ← exclude passages
  const a = answers[q.question_id];
  return !(a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim())));
  }).length;

  const answerableQuestions = questions.filter((q) => q.type !== "free_text");
  // Position of current question among answerable (passage-free) questions
const currentAnswerableIdx = answerableQuestions.findIndex(
  (q) => q.question_id === questions[currentIdx]?.question_id
);
// Is this quiz a Reading quiz with a passage available?
const isReading = (quiz?.subject || "").toLowerCase().includes("reading");
const activePassage = isReading
  ? (getActivePassage(questions, currentIdx) || questions.find(q => q.type === "free_text") || null)
  : null;

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
    onClose?.(result);
    return null;
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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header — always shows answerable position, not raw index */}
      <QuizHeader
        quizName={quizMeta?.quiz_name || quiz.quiz_name}
        currentIdx={currentAnswerableIdx >= 0 ? currentAnswerableIdx : 0}
        totalQuestions={answerableQuestions.length}
        answeredCount={answeredCount}
        timeLeft={timeLeft}
        onCancel={handleCancel}
      />

      {/* Main content area */}
      {/* Main content area */}
      {isReading && activePassage ? (
        <ReadingSplitLayout passage={activePassage}>
          <QuizMediaPanel voiceUrl={voiceUrl} videoUrl={videoUrl} />
          {(currentQuestion.voice_url || currentQuestion.video_url) && (
            <QuizMediaPanel voiceUrl={currentQuestion.voice_url} videoUrl={currentQuestion.video_url} />
          )}
          <QuestionRenderer
            question={currentQuestion}
            questionNumber={currentAnswerableIdx + 1}
            answer={answers[currentQuestion.question_id] || {}}
            isFlagged={flagged.has(currentQuestion.question_id)}
            onAnswer={(data) => setAnswer(currentQuestion.question_id, data)}
            onToggleFlag={() => toggleFlag(currentQuestion.question_id)}
            yearLevel={quiz?.year_level}
            subject={quiz?.subject}
            onUploadingChange={setIsUploading}
          />
        </ReadingSplitLayout>
      ) : (
        <main className="flex-1 overflow-y-auto max-w-3xl mx-auto w-full px-4 py-8 md:px-8">
          <QuizMediaPanel voiceUrl={voiceUrl} videoUrl={videoUrl} />
          {(currentQuestion.voice_url || currentQuestion.video_url) && (
            <QuizMediaPanel voiceUrl={currentQuestion.voice_url} videoUrl={currentQuestion.video_url} />
          )}
          <QuestionRenderer
            question={currentQuestion}
            questionNumber={currentAnswerableIdx + 1}
            answer={answers[currentQuestion.question_id] || {}}
            isFlagged={flagged.has(currentQuestion.question_id)}
            onAnswer={(data) => setAnswer(currentQuestion.question_id, data)}
            onToggleFlag={() => toggleFlag(currentQuestion.question_id)}
            yearLevel={quiz?.year_level}
            subject={quiz?.subject}
            onUploadingChange={setIsUploading}
          />
        </main>
      )}
      {/* Nav */}
      <QuizNavigation
        currentIdx={currentAnswerableIdx >= 0 ? currentAnswerableIdx : 0}
        totalQuestions={answerableQuestions.length}
        questions={answerableQuestions}
        answers={answers}
        flagged={flagged}
        onPrev={goPrev}
        onNext={goNext}
        onGoTo={(answerableIdx) => {
          const target = answerableQuestions[answerableIdx];
          const rawIdx = questions.findIndex(q => q.question_id === target?.question_id);
          if (rawIdx >= 0) goTo(rawIdx);
        }}
        onReview={() => setPhase("review")}
        unansweredCount={unansweredCount}
      />
    </div>
  );
}
    return null;
  })();

  return (
    <>
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
    </>
  );
}