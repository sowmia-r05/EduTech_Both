// src/app/components/auth/IdleTimeoutProvider.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Wrap around parent-protected routes. Shows:
//   1. A persistent timer badge (top-right) showing remaining idle time
//   2. A warning modal 60s before logout
//   3. Auto-logout → redirect to /parent-login
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import useIdleTimeout from "@/app/hooks/useIdleTimeout";

import IdleTimeoutWarning from "./IdleTimeoutWarning";

const IDLE_MINUTES = 5;
const WARNING_SECONDS = 60;

function IdleTimerBadge({ totalSecondsLeft }) {
  const minutes = Math.floor(totalSecondsLeft / 60);
  const seconds = totalSecondsLeft % 60;
  const isUrgent = totalSecondsLeft < 60;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm border
      ${isUrgent
        ? "bg-red-50 border-red-200 text-red-600"
        : "bg-white border-slate-200 text-slate-500"
      }`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {minutes}:{String(seconds).padStart(2, "0")}
    </div>
  );
}


export default function IdleTimeoutProvider({ children, idleMinutes, warningSeconds }) {
  const navigate = useNavigate();
  const { logout, isParent } = useAuth();

  const handleIdleLogout = useCallback(() => {
    logout();
    navigate("/parent-login", {
      replace: true,
      state: { idleLogout: true },
    });
  }, [logout, navigate]);

  const { showWarning, remainingSeconds, totalSecondsLeft, dismissWarning } = useIdleTimeout({
    idleMinutes: idleMinutes ?? IDLE_MINUTES,
    warningSeconds: warningSeconds ?? WARNING_SECONDS,
    onLogout: handleIdleLogout,
    enabled: true,
  });

  return (
    <>
      {/* ─── Floating idle timer badge (top-right, always visible) ─── */}
      {isParent && !showWarning && (
        <div className="fixed top-4 right-4 z-[100]">
          <IdleTimerBadge totalSecondsLeft={totalSecondsLeft} />
        </div>
      )}

      {children}

      {/* ─── Warning modal overlay ─── */}
      {showWarning && (
        <IdleTimeoutWarning
          remainingSeconds={remainingSeconds}
          onStayLoggedIn={dismissWarning}
          onLogoutNow={handleIdleLogout}
        />
      )}
    </>
  );
}
