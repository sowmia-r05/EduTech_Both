// src/app/components/pages/QuizPlayer.jsx
//
// Full-screen quiz player with exam mode (fullscreen + tab-switch detection).
// ✅ FIXED: Detects quiz completion by POLLING the backend for webhook-delivered results.
//          FlexiQuiz webhook (response.submitted) saves result to DB → frontend polls → detects it → exits fullscreen.
//          Also still listens for postMessage from /quiz-complete as a bonus signal (if redirect is configured).

import { useState, useEffect, useCallback, useRef } from "react";
import { getEstMinutes } from "@/app/utils/quiz-helpers";
import { useAuth } from "@/app/context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* ─── Subject styling ─── */
const SUBJECT_STYLE = {
  Reading: { icon: "📖", gradient: "from-sky-500 to-blue-600" },
  Writing: { icon: "✍️", gradient: "from-violet-500 to-purple-600" },
  Numeracy: { icon: "🔢", gradient: "from-amber-500 to-orange-600" },
  Language: { icon: "📝", gradient: "from-emerald-500 to-teal-600" },
  Other: { icon: "📚", gradient: "from-slate-500 to-slate-600" },
};

const DIFFICULTY_CONFIG = {
  Standard: { label: "Standard", icon: "📗" },
  Medium: { label: "Medium", icon: "📙" },
  Hard: { label: "Hard", icon: "📕" },
};

/* ─── Fullscreen Helpers ─── */
function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.reject("Fullscreen not supported");
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.resolve();
}

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

/* ═══════════════════════════════════════════════════════
   PRE-QUIZ LAUNCH SCREEN
   ═══════════════════════════════════════════════════════ */
function QuizLaunchScreen({ quiz, onStart, onCancel }) {
  const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
  const diff = DIFFICULTY_CONFIG[quiz.difficulty] || DIFFICULTY_CONFIG.Standard;
  const estMinutes = getEstMinutes(quiz);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.7)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
        style={{ animation: "quizFadeIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}
      >
        <div className={`bg-gradient-to-r ${style.gradient} px-8 py-6 text-white`}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center" style={{ backdropFilter: "blur(8px)" }}>
              <span className="text-2xl">{style.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">{quiz.subject}</p>
              <h2 className="text-lg font-bold leading-tight truncate">{quiz.name}</h2>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Difficulty", value: `${diff.icon} ${diff.label}` },
              { label: "Year Level", value: `📚 Year ${quiz.year_level}` },
              { label: "Est. Time", value: `⏱ ~${estMinutes} min` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-800 mb-2">🔒 Exam Mode</p>
            <p className="text-xs text-indigo-600 leading-relaxed">
              This quiz will open in <strong>full-screen exam mode</strong>. Your browser will go full-screen,
              and switching tabs will be detected and recorded. Please close all other tabs before starting.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">💡 Before you begin:</p>
            <ul className="text-xs text-amber-700 space-y-1.5">
              {["Read each question carefully before answering", "You can scroll down if the question is long", "Take your time — there's no rush!", "Do NOT press Escape or switch tabs during the quiz"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">Go Back</button>
            <button onClick={onStart} className={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r ${style.gradient} text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]`}>🔒 Enter Exam Mode →</button>
          </div>
        </div>
      </div>

      <style>{`@keyframes quizFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULL-PAGE COUNTDOWN (3-2-1-Go!)
   ═══════════════════════════════════════════════════════ */
function CountdownScreen({ onDone }) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-indigo-600 to-violet-700 flex items-center justify-center">
      <div className="text-center">
        {count > 0 ? (
          <div key={count} className="animate-ping-once">
            <span className="text-[120px] font-black text-white/90 drop-shadow-2xl">{count}</span>
          </div>
        ) : (
          <div className="animate-pulse">
            <span className="text-6xl font-black text-white">Go! 🚀</span>
          </div>
        )}
      </div>
      <style>{`@keyframes pingOnce { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } } .animate-ping-once { animation: pingOnce 0.6s ease-out; }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN EXIT WARNING OVERLAY
   ═══════════════════════════════════════════════════════ */
function FullscreenWarning({ onReEnter }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto bg-rose-100 rounded-full flex items-center justify-center">
          <svg className="w-7 h-7 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">⚠️ Fullscreen Required</h3>
          <p className="text-sm text-slate-600 mt-1">The quiz requires fullscreen to continue.</p>
          <p className="text-xs text-slate-400">This activity has been recorded. Please return to fullscreen to continue your quiz.</p>
          <button onClick={onReEnter} className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all">🔒 Re-enter Fullscreen</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   QUIZ COMPLETION SCREEN
   ═══════════════════════════════════════════════════════ */
function QuizCompleteScreen() {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-indigo-50 via-white to-violet-50 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 animate-ping opacity-25" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Quiz Complete! 🎉</h2>
          <p className="text-slate-500 mt-2">Generating your personalised feedback...</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN QUIZ PLAYER

   COMPLETION DETECTION STRATEGY:
   ─────────────────────────────────────────────────────
   Problem: FlexiQuiz shows its own results page after submit.
   No redirect fires. postMessage never arrives. iframe onLoad
   fires on Start/Next/Prev too, so can't use load count.

   Solution: POLL THE BACKEND.
   ─────────────────────────────────────────────────────
   1. When quiz starts, record the timestamp.
   2. Every 3 seconds, call GET /api/results/check-submission/:username?since=<timestamp>
   3. Backend checks if a new Result/Writing doc was created since that timestamp
      (created by the FlexiQuiz response.submitted webhook)
   4. If found → exit fullscreen → show completion screen
   5. postMessage from /quiz-complete also works as a bonus (if redirect is configured)
   ═══════════════════════════════════════════════════════ */
export default function QuizPlayer({ quiz, onClose }) {
  const [phase, setPhase] = useState("launch");
  const [loaded, setLoaded] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);

  const { childProfile, childToken, parentToken } = useAuth();

  const iframeRef = useRef(null);
  const violationsRef = useRef(0);
  const phaseRef = useRef(phase);
  const completionTriggeredRef = useRef(false);
  const quizStartTimeRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const embedUrl = quiz.embed_id ? `https://www.flexiquiz.com/SC/N/${quiz.embed_id}` : null;

  // Get the child's username for polling
  const username = childProfile?.username || quiz?.username || "";
  const activeToken = childToken || parentToken;

  /* ─── Shared completion handler (safe to call multiple times) ─── */
  const triggerCompletion = useCallback(
    (overrideData = {}) => {
      if (completionTriggeredRef.current) return;
      completionTriggeredRef.current = true;

      // Stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      exitFullscreen().catch(() => {});
      setShowFsWarning(false);
      setPhase("complete");

      setTimeout(() => {
        onClose?.({
          completed: true,
          tabViolations: violationsRef.current,
          ...overrideData,
        });
      }, 3000);
    },
    [onClose]
  );

  /* ─── Tab switch detection ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    const handleVisibility = () => {
      if (document.hidden) {
        violationsRef.current += 1;
        setTabViolations(violationsRef.current);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase]);

  /* ─── Fullscreen exit detection (skip after completion) ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    const handleFsChange = () => {
      if (completionTriggeredRef.current) return;
      if (!isFullscreen()) {
        setShowFsWarning(true);
        violationsRef.current += 1;
        setTabViolations(violationsRef.current);
      } else {
        setShowFsWarning(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [phase]);

  /* ─── postMessage listener (bonus — works if /quiz-complete redirect is configured) ─── */
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === "quiz-complete") {
        triggerCompletion({
          responseId: event.data.responseId,
          score: event.data.score,
          grade: event.data.grade,
          childId: event.data.childId,
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [triggerCompletion]);

  /* ═══════════════════════════════════════════════════════
     PRIMARY DETECTION: Poll backend for webhook-delivered results
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== "quiz") return;
    if (!username) return;

    // Start polling 15 seconds after quiz starts
    // (gives child time to actually start answering, avoids picking up old results)
    const startDelay = setTimeout(() => {
      if (phaseRef.current !== "quiz") return;

      const sinceISO = quizStartTimeRef.current || new Date().toISOString();

      pollIntervalRef.current = setInterval(async () => {
        if (completionTriggeredRef.current) return;

        try {
          const headers = {};
          if (activeToken) headers["Authorization"] = `Bearer ${activeToken}`;

          const res = await fetch(
            `${API_BASE}/api/results/check-submission/${encodeURIComponent(username)}?since=${encodeURIComponent(sinceISO)}`,
            { headers }
          );

          if (!res.ok) return;

          const data = await res.json();

          if (data.submitted) {
            console.log("✅ Webhook result detected via polling! Exiting fullscreen...");
            triggerCompletion({
              responseId: data.result?.response_id,
              score: data.result?.score?.percentage,
              grade: data.result?.grade,
            });
          }
        } catch (err) {
          // Network error — ignore, will retry on next interval
          console.warn("Poll check-submission error:", err.message);
        }
      }, 3000); // Poll every 3 seconds
    }, 15000); // Wait 15s before starting to poll

    return () => {
      clearTimeout(startDelay);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [phase, username, activeToken, triggerCompletion]);

  /* ─── iframe onLoad: just hide spinner ─── */
  const handleIframeLoad = useCallback(() => {
    if (!loaded) setLoaded(true);
  }, [loaded]);

  /* ─── Launch ─── */
  const handleLaunchStart = useCallback(() => {
    setLoaded(false);
    violationsRef.current = 0;
    setTabViolations(0);
    completionTriggeredRef.current = false;
    quizStartTimeRef.current = new Date().toISOString();

    enterFullscreen()
      .then(() => setPhase("countdown"))
      .catch(() => setPhase("countdown"));
  }, []);

  const handleCountdownDone = useCallback(() => {
    setPhase("quiz");
  }, []);

  const handleReEnterFullscreen = useCallback(() => {
    enterFullscreen().then(() => setShowFsWarning(false)).catch(() => {});
  }, []);

  const handleExit = useCallback(() => {
    if (window.confirm("Are you sure you want to exit the quiz? Your progress may be lost.")) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      exitFullscreen().catch(() => {});
      onClose?.({ completed: false });
    }
  }, [onClose]);

  /* ─── Cleanup ─── */
  useEffect(() => {
    return () => {
      if (isFullscreen()) exitFullscreen().catch(() => {});
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  /* ═══ RENDER ═══ */

  if (phase === "launch") {
    return <QuizLaunchScreen quiz={quiz} onStart={handleLaunchStart} onCancel={() => onClose?.({ completed: false })} />;
  }
  if (phase === "countdown") {
    return <CountdownScreen onDone={handleCountdownDone} />;
  }
  if (phase === "complete") {
    return <QuizCompleteScreen />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {showFsWarning && <FullscreenWarning onReEnter={handleReEnterFullscreen} />}

      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1.5 shadow-sm text-[11px]">
          {tabViolations > 0 && (
            <div className="flex items-center gap-1 text-rose-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">{tabViolations} violation{tabViolations !== 1 ? "s" : ""}</span>
            </div>
          )}
          <div className="w-px h-4 bg-slate-200" />
          <button onClick={handleExit} className="flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Exit
          </button>
        </div>
      </div>

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-50 to-white z-10">
          <div className="text-center space-y-5">
            <div className="w-14 h-14 rounded-full border-4 border-indigo-100 border-t-indigo-500 mx-auto animate-spin" />
            <div>
              <p className="text-slate-800 font-semibold">Entering exam mode...</p>
              <p className="text-sm text-slate-400 mt-1">Preparing your quiz in fullscreen</p>
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={embedUrl}
        title={quiz.name}
        className="w-full h-full border-0 flex-1"
        onLoad={handleIframeLoad}
        allow="fullscreen"
        style={{ width: "100%", height: "100vh", border: "none", overflow: "hidden" }}
      />

      <style>{`@keyframes quizFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}