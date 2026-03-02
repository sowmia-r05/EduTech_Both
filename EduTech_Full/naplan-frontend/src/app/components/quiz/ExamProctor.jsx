/**
 * ExamProctor.jsx
 *
 * Exam proctoring wrapper that provides:
 *   - Pre-quiz launch screen with exam mode info
 *   - 3-2-1 countdown
 *   - Fullscreen enforcement
 *   - Tab-switch detection (visibilitychange)
 *   - Fullscreen-exit detection
 *   - Re-enter fullscreen warning overlay
 *   - Violation counter
 *
 * Wraps around any quiz content (NativeQuizPlayer).
 * Does NOT touch quiz logic — purely a proctoring shell.
 *
 * ✅ FIX: Added `submitting` prop to suppress violation recording
 *    during quiz submission. When the quiz is being submitted,
 *    exitFullscreen() is called intentionally — this should NOT
 *    count as a violation.
 *
 * Place in: src/app/components/quiz/ExamProctor.jsx
 *
 * Props:
 *   quiz       — { quiz_id, quiz_name, subject, year_level, difficulty, time_limit_minutes, question_count }
 *   enabled    — boolean (if false, renders children directly — no proctoring)
 *   submitting — boolean (if true, suppresses violation recording) ← NEW
 *   onCancel   — () => void
 *   onStart    — () => void (called when countdown finishes and quiz begins)
 *   onViolation — ({ type, count }) => void (optional callback on each violation)
 *   children   — the quiz-taking UI to render inside the proctored shell
 */

import { useState, useEffect, useCallback, useRef } from "react";

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
   LAUNCH SCREEN
   ═══════════════════════════════════════════════════════ */
function LaunchScreen({ quiz, onStart, onCancel }) {
  const subject = quiz?.subject || "Quiz";
  const timeLimit = quiz?.time_limit_minutes;
  const questionCount = quiz?.question_count;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Exam Mode</h2>
          <p className="text-sm text-slate-500 mt-1">{quiz?.quiz_name || subject}</p>
        </div>

        {/* Info cards */}
        <div className="space-y-3 text-left">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <span className="text-lg">🖥️</span>
            <div>
              <p className="text-sm font-medium text-slate-800">Fullscreen required</p>
              <p className="text-xs text-slate-500">Your browser will enter fullscreen mode</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <span className="text-lg">👁️</span>
            <div>
              <p className="text-sm font-medium text-slate-800">Tab switches monitored</p>
              <p className="text-xs text-slate-500">Switching tabs will be recorded</p>
            </div>
          </div>
          {timeLimit && (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <span className="text-lg">⏱️</span>
              <div>
                <p className="text-sm font-medium text-slate-800">{timeLimit} minute time limit</p>
                <p className="text-xs text-slate-500">{questionCount ? `${questionCount} questions` : "Complete all questions"}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onStart}
            className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200"
          >
            🚀 Start Exam
          </button>
          <button
            onClick={onCancel}
            className="w-full px-6 py-2.5 text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COUNTDOWN (3-2-1-Go)
   ═══════════════════════════════════════════════════════ */
function CountdownScreen({ onDone }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count === 0) {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center">
      {count > 0 ? (
        <div key={count} className="animate-ping-once">
          <span className="text-[120px] font-black text-white/90 drop-shadow-2xl">{count}</span>
        </div>
      ) : (
        <div className="animate-pulse">
          <span className="text-6xl font-black text-white">Go! 🚀</span>
        </div>
      )}
      <style>{`@keyframes pingOnce { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } } .animate-ping-once { animation: pingOnce 0.6s ease-out; }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN EXIT WARNING
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
        </div>
        <button
          onClick={onReEnter}
          className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all"
        >
          🔒 Re-enter Fullscreen
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   VIOLATION BADGE (floating indicator)
   ═══════════════════════════════════════════════════════ */
function ViolationBadge({ count }) {
  if (count === 0) return null;
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60]">
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1.5 shadow-sm text-[11px]">
        <div className="flex items-center gap-1 text-rose-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold">
            {count} violation{count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN: ExamProctor
   ═══════════════════════════════════════════════════════ */
export default function ExamProctor({ quiz, enabled = true, onCancel, onStart, onViolation, submitting = false, children }) {
  const [phase, setPhase] = useState("launch"); // launch | countdown | active | finished
  const [violations, setViolations] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);
  const violationsRef = useRef(0);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ─── If proctoring disabled, just render children ───
  if (!enabled) {
    return <>{children}</>;
  }

  // ─── Record a violation ───
  const recordViolation = useCallback(
    (type) => {
      violationsRef.current += 1;
      setViolations(violationsRef.current);
      onViolation?.({ type, count: violationsRef.current });
    },
    [onViolation]
  );

  // ─── Tab-switch detection ───
  // ✅ FIX: Skip recording when `submitting` is true (quiz is being submitted intentionally)
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
      if (submitting) return; // ✅ FIX: Don't record during submission
      if (document.hidden) {
        recordViolation("tab_switch");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [phase, recordViolation, submitting]); // ✅ FIX: Added submitting to deps

  // ─── Fullscreen-exit detection ───
  // ✅ FIX: Skip recording when `submitting` is true (exitFullscreen is called intentionally on submit)
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
      if (submitting) return; // ✅ FIX: Don't record during submission
      if (!isFullscreen()) {
        setShowFsWarning(true);
        recordViolation("fullscreen_exit");
      } else {
        setShowFsWarning(false);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, [phase, recordViolation, submitting]); // ✅ FIX: Added submitting to deps

  // ✅ FIX: Hide fullscreen warning when submitting starts
  useEffect(() => {
    if (submitting) {
      setShowFsWarning(false);
    }
  }, [submitting]);

  // ─── Cleanup: exit fullscreen on unmount ───
  useEffect(() => {
    return () => {
      if (isFullscreen()) exitFullscreen().catch(() => {});
    };
  }, []);

  // ─── Launch → Enter fullscreen → Countdown ───
  const handleLaunchStart = useCallback(() => {
    violationsRef.current = 0;
    setViolations(0);
    setShowFsWarning(false);
    enterFullscreen()
      .then(() => setPhase("countdown"))
      .catch(() => setPhase("countdown")); // Still proceed if fullscreen fails (mobile, permissions)
  }, []);

  // ─── Countdown → Active ───
  const handleCountdownDone = useCallback(() => {
    setPhase("active");
    onStart?.();
  }, [onStart]);

  // ─── Re-enter fullscreen ───
  const handleReEnter = useCallback(() => {
    enterFullscreen()
      .then(() => setShowFsWarning(false))
      .catch(() => {});
  }, []);

  /* ═══ RENDER ═══ */

  if (phase === "launch") {
    return <LaunchScreen quiz={quiz} onStart={handleLaunchStart} onCancel={onCancel} />;
  }

  if (phase === "countdown") {
    return <CountdownScreen onDone={handleCountdownDone} />;
  }

  // ─── Active phase: fullscreen proctored shell ───
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-auto">
      {/* ✅ FIX: Don't show fullscreen warning during submission */}
      {showFsWarning && !submitting && <FullscreenWarning onReEnter={handleReEnter} />}
      <ViolationBadge count={violations} />
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Export helpers for external use
   ═══════════════════════════════════════════════════════ */
export { enterFullscreen, exitFullscreen, isFullscreen };
