// src/app/hooks/useOtpCountdown.js
import { useState, useEffect, useRef, useCallback } from "react";

export default function useOtpCountdown({
  durationSeconds = 300, // 5 min — matches backend OTP_TTL_MS
  onExpire,
  enabled = true,
}) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const restart = useCallback(() => {
    clear();
    setSecondsLeft(durationSeconds);
    setIsExpired(false);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsExpired(true);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [durationSeconds, clear]);

  useEffect(() => {
    if (enabled) restart();
    else clear();
    return clear;
  }, [enabled, restart, clear]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return { secondsLeft, isExpired, display, restart, stop: clear };
}
