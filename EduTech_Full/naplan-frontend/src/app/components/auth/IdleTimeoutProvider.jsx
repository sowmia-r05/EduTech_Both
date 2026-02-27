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
import IdleTimerBadge from "./IdleTimerBadge";
import IdleTimeoutWarning from "./IdleTimeoutWarning";

const IDLE_MINUTES = 5;
const WARNING_SECONDS = 60;

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
    enabled: isParent,
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
