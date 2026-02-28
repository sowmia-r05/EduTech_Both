/**
 * ChildIdleTimeoutProvider.jsx
 * ✅ Issue #5: Idle timeout for child sessions (15 min, kid-friendly).
 * Place in: naplan-frontend/src/app/components/auth/ChildIdleTimeoutProvider.jsx
 *
 * Usage in App.jsx:
 *   <Route path="/child-dashboard" element={
 *     <RequireAuth>
 *       <ErrorBoundary variant="child">
 *         <ChildIdleTimeoutProvider>
 *           <WithFooter><ChildDashboard /></WithFooter>
 *         </ChildIdleTimeoutProvider>
 *       </ErrorBoundary>
 *     </RequireAuth>
 *   } />
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

const IDLE_MINUTES = 15;
const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
const THROTTLE_MS = 2000;

export default function ChildIdleTimeoutProvider({ children }) {
  const navigate = useNavigate();
  const { logoutChild, isChild } = useAuth();

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_SECONDS);

  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const throttleRef = useRef(false);

  const enabled = isChild;

  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const handleLogout = useCallback(() => {
    clearAllTimers();
    logoutChild();
    navigate("/child-login", { replace: true, state: { idleLogout: true } });
  }, [logoutChild, navigate, clearAllTimers]);

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setCountdown(WARNING_SECONDS);
    clearAllTimers();

    const idleMs = IDLE_MINUTES * 60 * 1000;
    const warningMs = WARNING_SECONDS * 1000;

    warningTimerRef.current = setTimeout(() => {
      // Don't show warning during fullscreen quiz
      if (document.fullscreenElement) { resetTimers(); return; }
      setShowWarning(true);
      setCountdown(WARNING_SECONDS);
      let secs = WARNING_SECONDS;
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) clearInterval(countdownRef.current);
      }, 1000);
    }, idleMs - warningMs);

    logoutTimerRef.current = setTimeout(handleLogout, idleMs);
  }, [clearAllTimers, handleLogout]);

  const handleActivity = useCallback(() => {
    if (throttleRef.current) return;
    throttleRef.current = true;
    setTimeout(() => { throttleRef.current = false; }, THROTTLE_MS);
    if (!showWarning) resetTimers();
  }, [showWarning, resetTimers]);

  useEffect(() => {
    if (!enabled) return;
    resetTimers();
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, handleActivity, { passive: true });
    return () => {
      clearAllTimers();
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, handleActivity);
    };
  }, [enabled, handleActivity, resetTimers, clearAllTimers]);

  if (!enabled) return children;

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden text-center">
            <div className="px-6 py-4 bg-gradient-to-r from-amber-400 to-orange-400">
              <div className="text-4xl">😴</div>
              <h2 className="text-lg font-bold text-white mt-1">Are you still there?</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600 text-sm">You haven't done anything for a while. You'll be logged out in:</p>
              <p className={`text-4xl font-bold tabular-nums ${countdown <= 15 ? "text-red-600 animate-pulse" : "text-amber-600"}`}>{countdown}s</p>
              <div className="flex gap-3">
                <button onClick={handleLogout} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">Log Out</button>
                <button onClick={() => { setShowWarning(false); resetTimers(); }} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 shadow-md">I'm still here!</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
