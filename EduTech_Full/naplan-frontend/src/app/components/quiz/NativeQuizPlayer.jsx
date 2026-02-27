/**
 * NativeQuizPlayer.jsx  (v2 — with Exam Proctoring)
 *
 * Complete native quiz-taking component with EXAM PROCTORING.
 * Handles: proctoring (fullscreen, tab detection, violation tracking),
 * question rendering, timer, navigation, auto-save, submission.
 *
 * Place in: src/app/components/quiz/NativeQuizPlayer.jsx
 *
 * Props:
 *   quiz       — { quiz_id, quiz_name, subject, year_level, time_limit_minutes, question_count, ... }
 *   onClose    — (result) => void
 *   proctored  — boolean (default true) — enable/disable exam mode
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";
import ExamProctor, { exitFullscreen } from "./ExamProctor";
import QuizHeader from "./QuizHeader";
import QuestionRenderer from "./QuestionRenderer";
import QuizNavigation from "./QuizNavigation";
import QuizReview from "./QuizReview";
import QuizResult from "./QuizResult";

const API = import.meta.env.VITE_API_URL || "";

export default function NativeQuizPlayer({ quiz, onClose, proctored = true }) {
  const { activeToken } = useAuth();

  // ─── Core state ───
  const [phase, setPhase] = useState("proctoring");
  // phases: proctoring → loading → taking → review → submitting → result | error
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});       // { [question_id]: { selected: [...], text: "" } }
  const [flagged, setFlagged] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(null);    // seconds; null = no limit
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [quizMeta, setQuizMeta] = useState(null);
  const [violations, setViolations] = useState(0);

  const autoSaveTimer = useRef(null);
  const violationsRef = useRef(0);
  const submitCalledRef = useRef(false);

  // ─── Skip proctoring if disabled ───
  useEffect(() => {
    if (!proctored && phase === "proctoring") {
      setPhase("loading");
    }
  }, [proctored, phase]);

  // ─── API helper ───
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

  // ═══════════════════════════════════════
  // PROCTORING CALLBACKS
  // ═══════════════════════════════════════

  /** Called when countdown finishes — transition to loading */
  const handleProctoringStart = useCallback(() => {
    setPhase("loading");
  }, []);

  /** Called on every tab-switch or fullscreen-exit */
  const handleViolation = useCallback(({ type, count }) => {
    violationsRef.current = count;
    setViolations(count);
  }, []);

  // ═══════════════════════════════════════
  // QUIZ INIT: start attempt + fetch questions
  // ═══════════════════════════════════════
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Start attempt
        const startRes = await apiFetch(`/api/quizzes/${quiz.quiz_id}/start`, { method: "POST" });
        if (!startRes.ok) {
          const d = await startRes.json();
          throw new Error(d.error || "Failed to start quiz");
        }
        const startData = await startRes.json();
        if (cancelled) return;
        setAttemptId(startData.attempt_id);
        setQuizMeta(startData.quiz);

        // 2. Fetch questions (correct answers stripped server-side)
        const qRes = await apiFetch(`/api/quizzes/${quiz.quiz_id}/questions`);
        if (!qRes.ok) throw new Error("Failed to load questions");
        const qData = await qRes.json();
        if (cancelled) return;

        setQuestions(qData.questions || []);

        // 3. Timer
        const limit = startData.quiz?.time_limit_minutes || quiz.time_limit_minutes;
        if (limit) setTimeLeft(limit * 60);

        setPhase("taking");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [phase, quiz, apiFetch]);

  // ═══════════════════════════════════════
  // COUNTDOWN TIMER
  // ═══════════════════════════════════════
  useEffect(() => {
    if (phase !== "taking" || timeLeft === null) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-submit when time's up
          if (!submitCalledRef.current) handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, timeLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════
  // AUTO-SAVE EVERY 30s
  // ═══════════════════════════════════════
  useEffect(() => {
    if (phase !== "taking" || !attemptId) return;

    autoSaveTimer.current = setInterval(() => {
      const payload = buildAnswersPayload();
      apiFetch(`/api/attempts/${attemptId}/autosave`, {
        method: "PATCH",
        body: JSON.stringify({ answers: payload }),
      }).catch(() => {}); // Silent fail
    }, 30000);

    return () => clearInterval(autoSaveTimer.current);
  }, [phase, attemptId, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════
  // BUILD ANSWERS PAYLOAD
  // ═══════════════════════════════════════
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

  // ═══════════════════════════════════════
  // ANSWER + FLAG HANDLERS
  // ═══════════════════════════════════════
  const setAnswer = useCallback((questionId, data) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] || {}), ...data },
    }));
  }, []);

  const toggleFlag = useCallback((questionId) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }, []);

  // ═══════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════
  const goTo = useCallback((idx) => setCurrentIdx(Math.max(0, Math.min(idx, questions.length - 1))), [questions.length]);
  const goNext = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const goPrev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  // ═══════════════════════════════════════
  // SUBMIT
  // ═══════════════════════════════════════
  const handleSubmit = useCallback(async () => {
    if (submitCalledRef.current) return;
    submitCalledRef.current = true;
    setPhase("submitting");
    clearInterval(autoSaveTimer.current);

    // Exit fullscreen before showing results
    exitFullscreen().catch(() => {});

    try {
      const payload = buildAnswersPayload();
      const res = await apiFetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: payload,
          proctoring: {
            violations: violationsRef.current,
            fullscreen_enforced: proctored,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submission failed");
      }
      const data = await res.json();
      setResult(data);
      setPhase("result");
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  }, [attemptId, buildAnswersPayload, apiFetch, proctored]);

  // ═══════════════════════════════════════
  // CANCEL
  // ═══════════════════════════════════════
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
    return a && ((a.selected?.length > 0) || (a.text?.trim()));
  }).length;
  const unansweredCount = questions.length - answeredCount;

  // ═══════════════════════════════════════
  // RENDER: ERROR (outside proctor)
  // ═══════════════════════════════════════
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
          <p className="text-slate-500 mt-2 text-sm">{error}</p>
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

  // ═══════════════════════════════════════
  // RENDER: RESULT (outside proctor)
  // ═══════════════════════════════════════
  if (phase === "result") {
    return (
      <QuizResult
        result={result}
        quizName={quizMeta?.quiz_name || quiz.quiz_name}
        violations={violations}
        onClose={() => onClose?.(result)}
      />
    );
  }

  // ═══════════════════════════════════════
  // RENDER: QUIZ CONTENT (inside proctor)
  // ═══════════════════════════════════════
  const quizContent = (() => {
    // Spinner for loading/submitting
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

    // Review screen
    if (phase === "review") {
      return (
        <QuizReview
          questions={questions}
          answers={answers}
          flagged={flagged}
          onGoToQuestion={(idx) => { setCurrentIdx(idx); setPhase("taking"); }}
          onSubmit={handleSubmit}
          onBack={() => setPhase("taking")}
        />
      );
    }

    // Active quiz-taking
    if (phase === "taking" && questions[currentIdx]) {
      const currentQuestion = questions[currentIdx];
      return (
        <div className="flex flex-col min-h-full">
          <QuizHeader
            quizName={quizMeta?.quiz_name || quiz.quiz_name}
            currentIdx={currentIdx}
            totalQuestions={questions.length}
            answeredCount={answeredCount}
            timeLeft={timeLeft}
            onCancel={handleCancel}
          />

          <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 md:px-8">
            <QuestionRenderer
              question={currentQuestion}
              questionNumber={currentIdx + 1}
              answer={answers[currentQuestion.question_id] || {}}
              isFlagged={flagged.has(currentQuestion.question_id)}
              onAnswer={(data) => setAnswer(currentQuestion.question_id, data)}
              onToggleFlag={() => toggleFlag(currentQuestion.question_id)}
            />
          </main>

          <QuizNavigation
            currentIdx={currentIdx}
            totalQuestions={questions.length}
            questions={questions}
            answers={answers}
            flagged={flagged}
            onPrev={goPrev}
            onNext={goNext}
            onGoTo={goTo}
            onReview={() => setPhase("review")}
            unansweredCount={unansweredCount}
          />
        </div>
      );
    }

    return null;
  })();

  // ─── Wrap in ExamProctor ───
  return (
    <ExamProctor
      quiz={quiz}
      enabled={proctored}
      onCancel={() => onClose?.({ completed: false })}
      onStart={handleProctoringStart}
      onViolation={handleViolation}
    >
      {quizContent}
    </ExamProctor>
  );
}
