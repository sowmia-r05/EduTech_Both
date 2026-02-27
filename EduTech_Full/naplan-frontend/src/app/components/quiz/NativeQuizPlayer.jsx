/**
 * NativeQuizPlayer.jsx
 * 
 * Complete native quiz-taking component that replaces the FlexiQuiz iframe.
 * Handles: question rendering, timer, navigation, auto-save, submission.
 * 
 * Place in: src/app/components/quiz/NativeQuizPlayer.jsx
 * 
 * Props:
 *   quiz     — { quiz_id, quiz_name, ... } from child dashboard
 *   onClose  — (result) => void, called after submission or cancel
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";
import QuizHeader from "./QuizHeader";
import QuestionRenderer from "./QuestionRenderer";
import QuizNavigation from "./QuizNavigation";
import QuizReview from "./QuizReview";
import QuizResult from "./QuizResult";

const API = import.meta.env.VITE_API_URL || "";

export default function NativeQuizPlayer({ quiz, onClose }) {
  const { activeToken } = useAuth();

  // ─── State ───
  const [phase, setPhase] = useState("loading"); // loading | taking | review | submitting | result | error
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { [question_id]: { selected: [...], text: "" } }
  const [flagged, setFlagged] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(null); // seconds, null = no limit
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [quizMeta, setQuizMeta] = useState(null);
  const autoSaveTimer = useRef(null);

  // ─── API helpers ───
  const apiFetch = useCallback(
    (url, opts = {}) =>
      fetch(`${API}${url}`, {
        ...opts,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeToken}`, ...opts.headers },
      }),
    [activeToken]
  );

  // ─── Initialize: start attempt + fetch questions ───
  useEffect(() => {
    let cancelled = false;

    async function init() {
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

        // 2. Fetch questions (correct answers stripped by backend)
        const qRes = await apiFetch(`/api/quizzes/${quiz.quiz_id}/questions`);
        if (!qRes.ok) throw new Error("Failed to load questions");
        const qData = await qRes.json();
        if (cancelled) return;

        setQuestions(qData.questions || []);

        // 3. Set timer if time limit exists
        const limit = startData.quiz?.time_limit_minutes || quiz.time_limit_minutes;
        if (limit) setTimeLeft(limit * 60);

        setPhase("taking");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [quiz, apiFetch]);

  // ─── Timer countdown ───
  useEffect(() => {
    if (phase !== "taking" || timeLeft === null) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit(); // Auto-submit when time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, timeLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-save every 30 seconds ───
  useEffect(() => {
    if (phase !== "taking" || !attemptId) return;

    autoSaveTimer.current = setInterval(() => {
      const payload = buildAnswersPayload();
      apiFetch(`/api/attempts/${attemptId}/autosave`, {
        method: "PATCH",
        body: JSON.stringify({ answers: payload }),
      }).catch(() => {}); // Silent fail on auto-save
    }, 30000);

    return () => clearInterval(autoSaveTimer.current);
  }, [phase, attemptId, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Build answers payload ───
  const buildAnswersPayload = useCallback(() => {
    return questions.map((q) => {
      const ans = answers[q.question_id] || {};
      return {
        question_id: q.question_id,
        selected_option_ids: ans.selected || [],
        text_answer: ans.text || "",
      };
    });
  }, [questions, answers]);

  // ─── Answer handlers ───
  const setAnswer = useCallback((questionId, data) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] || {}), ...data },
    }));
  }, []);

  const toggleFlag = useCallback((questionId) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  // ─── Navigation ───
  const goTo = useCallback((idx) => {
    setCurrentIdx(Math.max(0, Math.min(idx, questions.length - 1)));
  }, [questions.length]);

  const goNext = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const goPrev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  // ─── Submit ───
  const handleSubmit = useCallback(async () => {
    if (phase === "submitting") return;
    setPhase("submitting");
    clearInterval(autoSaveTimer.current);

    try {
      const payload = buildAnswersPayload();
      const res = await apiFetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: payload }),
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
  }, [phase, attemptId, buildAnswersPayload, apiFetch]);

  // ─── Cancel / close ───
  const handleCancel = () => {
    if (phase === "taking" || phase === "review") {
      if (!confirm("Are you sure you want to leave? Your progress will be lost.")) return;
    }
    onClose?.(result);
  };

  // ─── Answer stats ───
  const answeredCount = questions.filter((q) => {
    const a = answers[q.question_id];
    return a && ((a.selected && a.selected.length > 0) || (a.text && a.text.trim()));
  }).length;
  const unansweredCount = questions.length - answeredCount;

  // ═══════════════════════════════════════
  // RENDER: ERROR
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
            onClick={() => onClose?.(null)}
            className="mt-6 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: LOADING
  // ═══════════════════════════════════════
  if (phase === "loading" || phase === "submitting") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500 text-sm">
            {phase === "loading" ? "Loading quiz..." : "Submitting your answers..."}
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: RESULT
  // ═══════════════════════════════════════
  if (phase === "result") {
    return <QuizResult result={result} quizName={quizMeta?.quiz_name || quiz.quiz_name} onClose={() => onClose?.(result)} />;
  }

  // ═══════════════════════════════════════
  // RENDER: REVIEW (before submit)
  // ═══════════════════════════════════════
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

  // ═══════════════════════════════════════
  // RENDER: QUIZ TAKING
  // ═══════════════════════════════════════
  const currentQuestion = questions[currentIdx];
  if (!currentQuestion) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Header */}
      <QuizHeader
        quizName={quizMeta?.quiz_name || quiz.quiz_name}
        currentIdx={currentIdx}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        timeLeft={timeLeft}
        onCancel={handleCancel}
      />

      {/* Question */}
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

      {/* Navigation */}
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
