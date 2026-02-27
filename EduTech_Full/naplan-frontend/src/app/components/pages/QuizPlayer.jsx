// src/app/components/pages/QuizPlayer.jsx
//
// ✅ v7 FINAL — Correct flow:
//   1. User takes quiz in fullscreen
//   2. User clicks submit → FlexiQuiz shows its results page (still in fullscreen)
//   3. Polling detects NEW submission (matches by quiz_name + since timestamp)
//   4. Exits fullscreen → FlexiQuiz results stay visible in normal mode
//   5. Green banner appears: "Quiz Submitted!" + "Back to Dashboard" button
//   6. User reviews FlexiQuiz scores, clicks Back when ready
//   7. Returns to Child Dashboard → can click "View Details" for AI feedback

import { useState, useEffect, useCallback, useRef } from "react";
import { getEstMinutes } from "@/app/utils/quiz-helpers";
import { useAuth } from "@/app/context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";

const POLL_START_DELAY = 2000;
const POLL_INTERVAL = 2000;

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

async function exitFullscreenSafe() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) await document.webkitExitFullscreen();
    else if (document.msFullscreenElement) await document.msExitFullscreen();
  } catch { /* already exited */ }
  await new Promise((r) => setTimeout(r, 100));
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
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
  const estMinutes = getEstMinutes(quiz);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(15,23,42,0.7)", backdropFilter: "blur(10px)" }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden" style={{ animation: "quizFadeIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}>
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
              and switching tabs will be detected and recorded.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">💡 Before you begin:</p>
            <ul className="text-xs text-amber-700 space-y-1.5">
              {["Read each question carefully", "You can scroll if the question is long", "Take your time — no rush!", "Do NOT press Escape or switch tabs"].map((t) => (
                <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-amber-500">✓</span><span>{t}</span></li>
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
   COUNTDOWN (3-2-1-Go!)
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
          <div key={count} className="animate-ping-once"><span className="text-[120px] font-black text-white/90 drop-shadow-2xl">{count}</span></div>
        ) : (
          <div className="animate-pulse"><span className="text-6xl font-black text-white">Go! 🚀</span></div>
        )}
      </div>
      <style>{`@keyframes pingOnce { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } } .animate-ping-once { animation: pingOnce 0.6s ease-out; }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN WARNING OVERLAY
   ═══════════════════════════════════════════════════════ */
function FullscreenWarning({ onReEnter, onFinish, checking }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-3">
        {checking ? (
          <>
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-600 font-medium">Checking if quiz is submitted...</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto bg-rose-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">⚠️ Fullscreen Required</h3>
            <p className="text-sm text-slate-600">The quiz requires fullscreen to continue.</p>
            <p className="text-xs text-slate-400">This activity has been recorded.</p>
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={onReEnter} className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all">🔒 Re-enter Fullscreen</button>
              <button onClick={onFinish} className="w-full px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all">✅ I've Submitted — Finish Quiz</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN QUIZ PLAYER
   ═══════════════════════════════════════════════════════ */
export default function QuizPlayer({ quiz, onClose }) {
  const [phase, setPhase] = useState("launch");
  const [loaded, setLoaded] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);
  const [checkingCompletion, setCheckingCompletion] = useState(false);

  const { childProfile, childToken, parentToken } = useAuth();

  const iframeRef = useRef(null);
  const violationsRef = useRef(0);
  const phaseRef = useRef(phase);
  const completionTriggeredRef = useRef(false);
  const quizStartTimeRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const embedUrl = quiz.embed_id ? `https://www.flexiquiz.com/SC/N/${quiz.embed_id}` : null;
  const username = childProfile?.username || quiz?.username || "";
  const activeToken = childToken || parentToken;

  // ✅ The quiz name — used for precise matching in check-submission
  const quizName = quiz?.name || "";

  /* ─── Build the polling URL with quiz_name param ─── */
  const buildCheckUrl = useCallback((sinceISO) => {
    const params = new URLSearchParams();
    params.set("since", sinceISO);
    if (quizName) params.set("quiz_name", quizName);
    return `${API_BASE}/api/results/check-submission/${encodeURIComponent(username)}?${params.toString()}`;
  }, [username, quizName]);

  /* ─── One-shot backend check ─── */
  const checkForSubmission = useCallback(async () => {
    if (!username) return null;
    try {
      const headers = {};
      if (activeToken) headers["Authorization"] = `Bearer ${activeToken}`;
      const sinceISO = quizStartTimeRef.current || new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const res = await fetch(buildCheckUrl(sinceISO), { headers });
      if (!res.ok) return null;
      const data = await res.json();
      return data.submitted ? data.result : null;
    } catch { return null; }
  }, [username, activeToken, buildCheckUrl]);

  /* ─── Completion: exit fullscreen + show results phase ─── */
  const triggerCompletion = useCallback(async () => {
    if (completionTriggeredRef.current) return;
    completionTriggeredRef.current = true;
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    setShowFsWarning(false);
    setCheckingCompletion(false);
    await exitFullscreenSafe();
    setPhase("results");
  }, []);

  /* ─── Tab switch detection ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    const h = () => { if (document.hidden) { violationsRef.current += 1; setTabViolations(violationsRef.current); } };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [phase]);

  /* ─── Fullscreen exit detection ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    const handleFsChange = async () => {
      if (completionTriggeredRef.current || phaseRef.current !== "quiz") return;
      if (!isFullscreen()) {
        violationsRef.current += 1;
        setTabViolations(violationsRef.current);
        setCheckingCompletion(true);
        setShowFsWarning(true);
        const result = await checkForSubmission();
        if (result && !completionTriggeredRef.current) {
          triggerCompletion();
        } else {
          setCheckingCompletion(false);
        }
      } else {
        setShowFsWarning(false);
        setCheckingCompletion(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [phase, checkForSubmission, triggerCompletion]);

  /* ─── postMessage listener ─── */
  useEffect(() => {
    const h = (event) => {
      let ok = false;
      try { ok = new URL(event.origin).hostname === window.location.hostname; } catch {}
      if (event.data?.type === "quiz-complete" && ok) triggerCompletion();
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [triggerCompletion]);

  /* ─── iframe URL detection ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const h = () => {
      if (completionTriggeredRef.current) return;
      try {
        const url = iframe.contentWindow?.location?.href || "";
        if (url && url.includes(window.location.hostname)) triggerCompletion();
      } catch {}
    };
    iframe.addEventListener("load", h);
    return () => iframe.removeEventListener("load", h);
  }, [phase, triggerCompletion]);

  /* ─── PRIMARY: Poll backend every 2s ─── */
  useEffect(() => {
    if (phase !== "quiz") return;
    if (!username) return;

    const startDelay = setTimeout(() => {
      if (phaseRef.current !== "quiz" || completionTriggeredRef.current) return;
      const sinceISO = quizStartTimeRef.current || new Date().toISOString();

      pollIntervalRef.current = setInterval(async () => {
        if (completionTriggeredRef.current) return;
        try {
          const headers = {};
          if (activeToken) headers["Authorization"] = `Bearer ${activeToken}`;
          const res = await fetch(buildCheckUrl(sinceISO), { headers });
          if (!res.ok) return;
          const data = await res.json();
          if (data.submitted) triggerCompletion();
        } catch {}
      }, POLL_INTERVAL);
    }, POLL_START_DELAY);

    return () => {
      clearTimeout(startDelay);
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [phase, username, activeToken, buildCheckUrl, triggerCompletion]);

  /* ─── Manual finish ─── */
  const handleManualFinish = useCallback(() => triggerCompletion(), [triggerCompletion]);

  const handleIframeLoad = useCallback(() => { if (!loaded) setLoaded(true); }, [loaded]);

  const handleLaunchStart = useCallback(() => {
    setLoaded(false);
    violationsRef.current = 0;
    setTabViolations(0);
    completionTriggeredRef.current = false;
    quizStartTimeRef.current = new Date().toISOString();
    enterFullscreen().then(() => setPhase("countdown")).catch(() => setPhase("countdown"));
  }, []);

  const handleCountdownDone = useCallback(() => setPhase("quiz"), []);
  const handleReEnterFullscreen = useCallback(() => { enterFullscreen().then(() => setShowFsWarning(false)).catch(() => {}); }, []);

  const handleExit = useCallback(() => {
    if (window.confirm("Are you sure you want to exit? Your progress may be lost.")) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      exitFullscreenSafe().then(() => onClose?.({ completed: false }));
    }
  }, [onClose]);

  const handleBackToDashboard = useCallback(() => {
    onClose?.({ completed: true, tabViolations: violationsRef.current });
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (isFullscreen()) exitFullscreenSafe();
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

  /* ─── RESULTS: fullscreen exited, FlexiQuiz results visible + our banner ─── */
  if (phase === "results") {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-3 shadow-lg flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <p className="text-sm font-bold">Quiz Submitted! 🎉</p>
                <p className="text-xs text-white/70">Review your score below, then head back when ready.</p>
              </div>
            </div>
            <button onClick={handleBackToDashboard} className="px-5 py-2.5 bg-white text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back to Dashboard
            </button>
          </div>
        </div>
        <iframe ref={iframeRef} src={embedUrl} title={quiz.name} className="w-full flex-1 border-0" allow="fullscreen" style={{ border: "none" }} />
      </div>
    );
  }

  /* ─── QUIZ: fullscreen exam mode ─── */
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {showFsWarning && <FullscreenWarning onReEnter={handleReEnterFullscreen} onFinish={handleManualFinish} checking={checkingCompletion} />}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1.5 shadow-sm text-[11px]">
          {tabViolations > 0 && (
            <div className="flex items-center gap-1 text-rose-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="font-semibold">{tabViolations} violation{tabViolations !== 1 ? "s" : ""}</span>
            </div>
          )}
          <div className="w-px h-4 bg-slate-200" />
          <button onClick={handleExit} className="flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Exit
          </button>
        </div>
      </div>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-50 to-white z-10">
          <div className="text-center space-y-5">
            <div className="w-14 h-14 rounded-full border-4 border-indigo-100 border-t-indigo-500 mx-auto animate-spin" />
            <p className="text-slate-800 font-semibold">Entering exam mode...</p>
            <p className="text-sm text-slate-400 mt-1">Preparing your quiz in fullscreen</p>
          </div>
        </div>
      )}
      <iframe ref={iframeRef} src={embedUrl} title={quiz.name} className="w-full h-full border-0 flex-1" onLoad={handleIframeLoad} allow="fullscreen" style={{ width: "100%", height: "100vh", border: "none", overflow: "hidden" }} />
    </div>
  );
}
