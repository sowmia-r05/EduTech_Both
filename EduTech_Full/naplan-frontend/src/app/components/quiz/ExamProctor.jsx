/**
 * ExamProctor.jsx  (v2 — FIX: suppress violations during file upload)
 *
 * ✅ NEW: `uploading` prop — when true, fullscreen exits and tab switches
 *    are NOT recorded. This prevents false violations when the student
 *    opens the file picker to upload handwriting (file dialog briefly
 *    exits fullscreen on many browsers/devices).
 *
 * Place in: src/app/components/quiz/ExamProctor.jsx
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

export function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.resolve();
}

export function isFullscreen() {
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
        <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Exam Mode</h2>
          <p className="text-sm text-slate-500 mt-1">{quiz?.quiz_name || subject}</p>
        </div>

        <div className="space-y-3 text-left">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-indigo-100">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">Fullscreen required</p>
              <p className="text-xs text-slate-500">Your browser will enter fullscreen mode</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-indigo-100">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">Tab switches monitored</p>
              <p className="text-xs text-slate-500">Switching tabs will be recorded</p>
            </div>
          </div>
          {timeLimit && (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-indigo-100">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-slate-800">{timeLimit} minute time limit</p>
                <p className="text-xs text-slate-500">
                  {questionCount ? `${questionCount} questions` : "Complete all questions before time runs out"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={onStart}
            className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200"
          >
            Start Exam
          </button>
          <button
            onClick={onCancel}
            className="w-full px-6 py-2.5 text-slate-500 text-sm hover:text-slate-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COUNTDOWN SCREEN
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
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center z-50">
      {count > 0 ? (
        <div key={count} className="animate-ping-once">
          <span className="text-[120px] font-black text-white/90 drop-shadow-2xl">{count}</span>
        </div>
      ) : (
        <div className="animate-pulse">
          <span className="text-6xl font-black text-white">Go!</span>
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
          <h3 className="text-lg font-bold text-slate-900">Fullscreen Required</h3>
          <p className="text-sm text-slate-600 mt-1">The quiz requires fullscreen to continue.</p>
          <p className="text-xs text-slate-400">This activity has been recorded. Please return to fullscreen to continue your quiz.</p>
        </div>
        <button
          onClick={onReEnter}
          className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all"
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Re-enter Fullscreen
          </span>
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
   
   Props:
     quiz        — quiz metadata
     enabled     — if false, renders children with no proctoring
     submitting  — suppress violations during quiz submission
     uploading   — ✅ NEW: suppress violations during file upload (file picker exits fullscreen)
     onCancel    — called when student cancels
     onStart     — called when countdown finishes
     onViolation — called on each violation { type, count }
     children    — quiz UI
   ═══════════════════════════════════════════════════════ */
export default function ExamProctor({
  quiz,
  enabled = true,
  onCancel,
  onStart,
  onViolation,
  submitting = false,
  uploading = false,   // ✅ NEW
  children,
}) {
  const [phase, setPhase] = useState("launch");
  const [violations, setViolations] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);
  const violationsRef = useRef(0);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ─── If proctoring disabled, just render children ───
  if (!enabled) return <>{children}</>;

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
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
      if (submitting) return;
      if (uploading) return; // ✅ Don't count as violation — file picker opened
      if (document.hidden) recordViolation("tab_switch");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [phase, recordViolation, submitting, uploading]);

  // ─── Fullscreen-exit detection ───
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
      if (submitting) return;
      if (uploading) return; // ✅ Don't count as violation — file picker opens outside fullscreen
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
  }, [phase, recordViolation, submitting, uploading]);

  // ─── Hide warning when submitting or uploading ───
  useEffect(() => {
    if (submitting || uploading) setShowFsWarning(false);
  }, [submitting, uploading]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      if (isFullscreen()) exitFullscreen().catch(() => {});
    };
  }, []);

  // ─── Launch → Fullscreen → Countdown ───
  const handleLaunchStart = useCallback(() => {
    violationsRef.current = 0;
    setViolations(0);
    setShowFsWarning(false);
    enterFullscreen()
      .then(() => setPhase("countdown"))
      .catch(() => setPhase("countdown"));
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

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-auto">
      {/* Don't show fullscreen warning during submission or upload */}
      {showFsWarning && !submitting && !uploading && (
        <FullscreenWarning onReEnter={handleReEnter} />
      )}
      <ViolationBadge count={violations} />
      {children}
    </div>
  );
}