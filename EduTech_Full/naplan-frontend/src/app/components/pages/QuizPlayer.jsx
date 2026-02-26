import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Subject styling ─── */
const SUBJECT_STYLE = {
  Reading:  { icon: "📖", gradient: "from-sky-500 to-blue-600" },
  Writing:  { icon: "✍️", gradient: "from-violet-500 to-purple-600" },
  Numeracy: { icon: "🔢", gradient: "from-amber-500 to-orange-600" },
  Language: { icon: "📝", gradient: "from-emerald-500 to-teal-600" },
  Other:    { icon: "📚", gradient: "from-slate-500 to-slate-600" },
};

const DIFFICULTY_CONFIG = {
  Standard: { label: "Standard", icon: "📗" },
  Medium:   { label: "Medium",   icon: "📙" },
  Hard:     { label: "Hard",     icon: "📕" },
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
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

/* ═══════════════════════════════════════════════════════
   PRE-QUIZ LAUNCH SCREEN
   ═══════════════════════════════════════════════════════ */
function QuizLaunchScreen({ quiz, onStart, onCancel }) {
  const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
  const diff = DIFFICULTY_CONFIG[quiz.difficulty] || DIFFICULTY_CONFIG.Standard;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.7)", backdropFilter: "blur(10px)" }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
        style={{ animation: "quizFadeIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}>

        {/* Header */}
        <div className={`bg-gradient-to-r ${style.gradient} px-8 py-6 text-white`}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"
              style={{ backdropFilter: "blur(8px)" }}>
              <span className="text-2xl">{style.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">{quiz.subject}</p>
              <h2 className="text-lg font-bold leading-tight truncate">{quiz.name}</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Difficulty", value: `${diff.icon} ${diff.label}` },
              { label: "Year Level", value: `📚 Year ${quiz.year_level}` },
              { label: "Est. Time",  value: "⏱ ~45 min" },
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
              {[
                "Read each question carefully before answering",
                "You can scroll down if the question is long",
                "Take your time — there's no rush!",
                "Do NOT press Escape or switch tabs during the quiz",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500">✓</span><span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Go Back
            </button>
            <button onClick={onStart}
              className={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r ${style.gradient} text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]`}>
              🔒 Enter Exam Mode →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes quizFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULL-PAGE COUNTDOWN (3-2-1-Go!)
   ═══════════════════════════════════════════════════════ */
function FullPageCountdown({ onComplete, quizName, subject }) {
  const [count, setCount] = useState(3);
  const style = SUBJECT_STYLE[subject] || SUBJECT_STYLE.Other;

  useEffect(() => {
    if (count === 0) {
      const t = setTimeout(() => onComplete(), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onComplete]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 text-center">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full mb-3"
            style={{ backdropFilter: "blur(8px)" }}>
            <span className="text-lg">{style.icon}</span>
            <span className="text-sm font-medium text-white/80">{quizName}</span>
          </div>
          <p className="text-white/40 text-sm">Get ready...</p>
        </div>

        {count > 0 ? (
          <div key={count} style={{ animation: "countPop 0.9s cubic-bezier(0.16,1,0.3,1) forwards" }}>
            <div className={`w-36 h-36 rounded-full bg-gradient-to-br ${style.gradient} flex items-center justify-center mx-auto shadow-2xl`}
              style={{ boxShadow: "0 0 80px rgba(99,102,241,0.3)" }}>
              <span className="text-7xl font-black text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </div>
          </div>
        ) : (
          <div style={{ animation: "countPop 0.5s cubic-bezier(0.16,1,0.3,1) forwards" }}>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto shadow-2xl"
              style={{ boxShadow: "0 0 80px rgba(16,185,129,0.3)" }}>
              <span className="text-5xl font-black text-white">GO!</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mt-10">
          {[3, 2, 1].map((n) => (
            <div key={n} className={`w-3 h-3 rounded-full transition-all duration-500 ${
              count < n ? "bg-white scale-100" : count === n ? "bg-white/80 scale-125" : "bg-white/20 scale-100"
            }`} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes countPop {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB-SWITCH WARNING MODAL
   ═══════════════════════════════════════════════════════ */
function TabSwitchWarning({ violations, onResume }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(15,23,42,0.9)", backdropFilter: "blur(12px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style={{ animation: "quizFadeIn 0.3s ease forwards" }}>
        <div className="bg-gradient-to-r from-rose-500 to-red-600 px-6 py-5 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold">Tab Switch Detected!</h3>
        </div>
        <div className="px-6 py-5 text-center space-y-3">
          <p className="text-slate-700 text-sm leading-relaxed">
            You left the quiz window. This activity has been <strong>recorded</strong>.
          </p>
          <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold px-4 py-2 rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Violations: {violations}
          </div>
          <p className="text-xs text-slate-400">Please stay on the quiz page. Multiple violations may be reported.</p>
          <button onClick={onResume}
            className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all">
            Return to Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN EXIT WARNING
   ═══════════════════════════════════════════════════════ */
function FullscreenExitWarning({ onReEnter }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(15,23,42,0.9)", backdropFilter: "blur(12px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style={{ animation: "quizFadeIn 0.3s ease forwards" }}>
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
          <h3 className="text-xl font-bold">Fullscreen Exited</h3>
        </div>
        <div className="px-6 py-5 text-center space-y-3">
          <p className="text-slate-700 text-sm leading-relaxed">
            You exited fullscreen mode. The quiz requires fullscreen to continue.
          </p>
          <p className="text-xs text-slate-400">This activity has been recorded. Please return to fullscreen to continue your quiz.</p>
          <button onClick={onReEnter}
            className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all">
            🔒 Re-enter Fullscreen
          </button>
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

   FlexiQuiz layout (from screenshot):
   ┌────────────────────────────────────────────────┐
   │  Year3 Numeracy          [Timer 0:44:58]       │  ← FlexiQuiz header
   │                                                 │
   │  Question content...                            │
   │                                                 │
   │  [Page: 1]  Answered 0 of 34   [Next Page >>]  │  ← FlexiQuiz footer
   └────────────────────────────────────────────────┘

   Our UI placement:
   - Top-center: small floating bar with exit + warnings
     (between FlexiQuiz title on left and timer on right)
   - Everything else: leave alone, zero overlap
   ═══════════════════════════════════════════════════════ */
export default function QuizPlayer({ quiz, onClose }) {
  const [phase, setPhase] = useState("launch");
  const [loaded, setLoaded] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [showFsWarning, setShowFsWarning] = useState(false);

  const violationCountRef = useRef(0);
  const phaseRef = useRef(phase);

  const style = SUBJECT_STYLE[quiz.subject] || SUBJECT_STYLE.Other;
  const embedUrl = `https://www.flexiquiz.com/SC/N/${quiz.embed_id}`;

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ─── Launch → Countdown ─── */
  const handleLaunchStart = useCallback(() => {
    enterFullscreen()
      .then(() => setPhase("countdown"))
      .catch(() => setPhase("countdown"));
  }, []);

  /* ─── Countdown → Playing ─── */
  const handleCountdownComplete = useCallback(() => {
    setPhase("playing");
  }, []);

  /* ─── Tab-switch detection (visibilitychange ONLY — no iframe false positives) ─── */
  useEffect(() => {
    if (phase !== "playing") return;
    const handleVisibility = () => {
      if (document.hidden && phaseRef.current === "playing") {
        violationCountRef.current += 1;
        setTabViolations(violationCountRef.current);
        setShowTabWarning(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase]);

  /* ─── Fullscreen exit detection ─── */
  useEffect(() => {
    if (phase !== "playing") return;
    const handleFsChange = () => {
      if (!isFullscreen() && phaseRef.current === "playing") {
        setShowFsWarning(true);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [phase]);

  /* ─── Block keyboard shortcuts & right-click ─── */
  useEffect(() => {
    if (phase !== "playing") return;
    const handleKeyDown = (e) => {
      const blocked = [
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d",
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i",
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "j",
        e.key === "F12",
        e.key === "F11",
        e.key === "F5",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r",
      ];
      if (blocked.some(Boolean)) { e.preventDefault(); e.stopPropagation(); }
    };
    const handleContextMenu = (e) => e.preventDefault();
    const handleCopyPaste = (e) => {
      if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") e.preventDefault();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("copy", handleCopyPaste, true);
    document.addEventListener("paste", handleCopyPaste, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("copy", handleCopyPaste, true);
      document.removeEventListener("paste", handleCopyPaste, true);
    };
  }, [phase]);

  /* ─── Prevent back/forward ─── */
  useEffect(() => {
    if (phase !== "playing") return;
    const h = () => window.history.pushState(null, "", window.location.href);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, [phase]);

  /* ─── Quiz completion from iframe ─── */
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === "quiz-complete") {
        setPhase("completing");
        exitFullscreen().catch(() => {});
        setTimeout(() => {
          onClose({
            completed: true,
            responseId: event.data.responseId,
            score: event.data.score,
            grade: event.data.grade,
            tabViolations: violationCountRef.current,
          });
        }, 2500);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onClose]);

  /* ─── Exit ─── */
  const handleExit = () => {
    if (window.confirm("Are you sure you want to exit this quiz?\n\nYour progress may not be saved.")) {
      exitFullscreen().catch(() => {});
      onClose({ completed: false, tabViolations: violationCountRef.current });
    }
  };

  /* ─── Re-enter fullscreen ─── */
  const handleReEnterFullscreen = () => {
    enterFullscreen()
      .then(() => setShowFsWarning(false))
      .catch(() => setShowFsWarning(false));
  };

  /* ─── Cleanup ─── */
  useEffect(() => {
    return () => { if (isFullscreen()) exitFullscreen().catch(() => {}); };
  }, []);

  /* ═══ RENDER ═══ */

  if (phase === "launch") {
    return <QuizLaunchScreen quiz={quiz} onStart={handleLaunchStart} onCancel={() => onClose({ completed: false })} />;
  }
  if (phase === "countdown") {
    return <FullPageCountdown onComplete={handleCountdownComplete} quizName={quiz.name} subject={quiz.subject} />;
  }
  if (phase === "completing") {
    return <QuizCompleteScreen />;
  }

  /* ─── Playing ─── */
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col"
      style={{ touchAction: "manipulation", userSelect: "none" }}>

      {/* Warning modals */}
      {showTabWarning && (
        <TabSwitchWarning
          violations={tabViolations}
          onResume={() => {
            setShowTabWarning(false);
            if (!isFullscreen()) enterFullscreen().catch(() => {});
          }}
        />
      )}
      {showFsWarning && !showTabWarning && (
        <FullscreenExitWarning onReEnter={handleReEnterFullscreen} />
      )}

      {/*
        ── TOP-CENTER FLOATING BAR ──
        Sits between FlexiQuiz's title (left) and timer (right).
        Contains: Exam mode badge + Warnings count + Exit button
        Uses pointer-events-none on wrapper so iframe clicks pass through,
        with pointer-events-auto on the bar itself.
      */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-center pointer-events-none"
        style={{ paddingTop: "6px" }}>
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/90 border border-slate-200/80 rounded-full px-1.5 py-1 shadow-sm"
          style={{ backdropFilter: "blur(8px)" }}>

          {/* Exam mode indicator */}
          <div className="flex items-center gap-1.5 pl-2.5 pr-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-semibold text-emerald-700">Exam Mode</span>
          </div>

          {/* Warnings count — only show if > 0 */}
          {tabViolations > 0 && (
            <>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-1 px-2">
                <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                </svg>
                <span className="text-[11px] font-semibold text-rose-600">
                  {tabViolations} warning{tabViolations !== 1 ? "s" : ""}
                </span>
              </div>
            </>
          )}

          {/* Divider */}
          <div className="w-px h-4 bg-slate-200" />

          {/* Exit button */}
          <button onClick={handleExit}
            className="flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Exit
          </button>
        </div>
      </div>

      {/* Loading overlay */}
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

      {/* FlexiQuiz iframe — full screen */}
      <iframe
        src={embedUrl}
        title={quiz.name}
        className="w-full h-full border-0 flex-1"
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          overflow: "hidden",
        }}
      />

      <style>{`
        @keyframes quizFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}