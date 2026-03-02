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
 * Place in: src/app/components/quiz/ExamProctor.jsx
 *
 * Props:
 *   quiz       — { quiz_id, quiz_name, subject, year_level, difficulty, time_limit_minutes, question_count }
 *   enabled    — boolean (if false, renders children directly — no proctoring)
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
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

/* ─── Subject styling ─── */
const SUBJECT_STYLE = {
  Reading: { icon: "📖", gradient: "from-sky-500 to-blue-600" },
  Writing: { icon: "✍️", gradient: "from-violet-500 to-purple-600" },
  Numeracy: { icon: "🔢", gradient: "from-amber-500 to-orange-600" },
  Maths: { icon: "🔢", gradient: "from-amber-500 to-orange-600" },
  Language: { icon: "📝", gradient: "from-emerald-500 to-teal-600" },
  Conventions: { icon: "📝", gradient: "from-emerald-500 to-teal-600" },
  Other: { icon: "📚", gradient: "from-slate-500 to-slate-600" },
};

/* ═══════════════════════════════════════════════════════
   PRE-QUIZ LAUNCH SCREEN
   ═══════════════════════════════════════════════════════ */
function LaunchScreen({ quiz, onStart, onCancel }) {
  const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
  const estMinutes = quiz.time_limit_minutes || Math.max(5, (quiz.question_count || 10) * 1.5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.7)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
        style={{ animation: "quizFadeIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}
      >
        {/* Header gradient */}
        <div className={`bg-gradient-to-r ${style.gradient} px-8 py-6 text-white`}>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <span className="text-2xl">{style.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
                {quiz.subject || "Quiz"}
              </p>
              <h2 className="text-lg font-bold leading-tight truncate">
                {quiz.quiz_name || quiz.name || "Practice Test"}
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {/* Info cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Questions", value: `📋 ${quiz.question_count || "—"}` },
              { label: "Year Level", value: `📚 Year ${quiz.year_level || "—"}` },
              { label: "Time Limit", value: quiz.time_limit_minutes ? `⏱ ${quiz.time_limit_minutes} min` : "⏱ No limit" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Exam mode notice */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-800 mb-2">🔒 Exam Mode</p>
            <p className="text-xs text-indigo-600 leading-relaxed">
              This quiz will open in <strong>full-screen exam mode</strong>. Your browser will go full-screen,
              and switching tabs will be detected and recorded. Please close all other tabs before starting.
            </p>
          </div>

          {/* Tips */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">💡 Before you begin:</p>
            <ul className="text-xs text-amber-700 space-y-1.5">
              {[
                "Read each question carefully before answering",
                "You can flag questions to review later",
                "Your progress is auto-saved every 30 seconds",
                "Do NOT press Escape or switch tabs during the quiz",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={onStart}
              className={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r ${style.gradient} text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]`}
            >
              🔒 Enter Exam Mode →
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes quizFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   3-2-1-GO COUNTDOWN
   ═══════════════════════════════════════════════════════ */
function CountdownScreen({ onDone }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onDone();
      return;
    }
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
export default function ExamProctor({ quiz, enabled = true, onCancel, onStart, onViolation, children }) {
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
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
      if (document.hidden) {
        recordViolation("tab_switch");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [phase, recordViolation]);

  // ─── Fullscreen-exit detection ───
  useEffect(() => {
    if (phase !== "active") return;
    const handler = () => {
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
  }, [phase, recordViolation]);

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

  // ─── Public method: call when quiz ends to exit fullscreen gracefully ───
  // (This is done by unmounting ExamProctor — cleanup effect handles it)

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
      {showFsWarning && <FullscreenWarning onReEnter={handleReEnter} />}
      <ViolationBadge count={violations} />
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Export helpers for external use
   ═══════════════════════════════════════════════════════ */
export { enterFullscreen, exitFullscreen, isFullscreen };
