// src/app/hooks/useIdleTimeout.js
import { useState, useEffect, useRef, useCallback } from "react";

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "scroll",
  "touchstart", "click", "wheel",
];
const THROTTLE_MS = 1000;

export default function useIdleTimeout({
  idleMinutes = 5,
  warningSeconds = 60,
  onLogout,
  enabled = true,
}) {
  const idleMs = idleMinutes * 60 * 1000;
  const warningMs = warningSeconds * 1000;

  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(warningSeconds);
  // ─── NEW: total seconds left (for visible timer) ───
  const [totalSecondsLeft, setTotalSecondsLeft] = useState(idleMinutes * 60);

  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const tickRef = useRef(null);
  const throttleRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setRemainingSeconds(warningSeconds);
    setTotalSecondsLeft(idleMinutes * 60);
    clearAllTimers();

    // ─── Tick every second for the visible timer ───
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const left = Math.max(0, Math.ceil((idleMs - elapsed) / 1000));
      setTotalSecondsLeft(left);
    }, 1000);

    // ─── Warning fires warningSeconds before logout ───
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds(warningSeconds);
      let secs = warningSeconds;
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setRemainingSeconds(secs);
        if (secs <= 0) clearInterval(countdownRef.current);
      }, 1000);
    }, idleMs - warningMs);

    // ─── Logout fires at full idle time ───
    logoutTimerRef.current = setTimeout(() => {
      setShowWarning(false);
      clearAllTimers();
      onLogout?.();
    }, idleMs);
  }, [idleMs, warningMs, warningSeconds, idleMinutes, onLogout, clearAllTimers]);

  const handleActivity = useCallback(() => {
    if (throttleRef.current) return;
    throttleRef.current = true;
    setTimeout(() => { throttleRef.current = false; }, THROTTLE_MS);
    if (!showWarning) resetTimers();
  }, [resetTimers, showWarning]);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) return;
    resetTimers();

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handleActivity, { passive: true })
    );

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= idleMs) {
          onLogout?.();
        } else if (elapsed >= idleMs - warningMs) {
          setShowWarning(true);
          setRemainingSeconds(Math.max(0, Math.ceil((idleMs - elapsed) / 1000)));
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
      clearAllTimers();
    };
  }, [enabled, handleActivity, resetTimers, idleMs, warningMs, onLogout, clearAllTimers]);

  return { showWarning, remainingSeconds, totalSecondsLeft, dismissWarning };
}
