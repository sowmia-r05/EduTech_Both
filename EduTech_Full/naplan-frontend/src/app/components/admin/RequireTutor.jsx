/**
 * RequireTutor.jsx
 *
 * Cookie-based tutor guard. There is no tutor JWT in localStorage any more —
 * the session is the httpOnly `admin_token` cookie (tutors are issued admin-
 * signed tokens with role "tutor"). JavaScript cannot read that cookie, so
 * instead of decoding a token locally we ask the server via GET /api/tutor/me
 * (protected by requireTutor → requireAdmin, which reads the cookie). Children
 * render only if that call confirms a tutor.
 */

import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function RequireTutor({ children }) {
  // null = still checking, true = allowed, false = redirect
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/tutor/me`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const data = await res.json().catch(() => ({}));
        // Only role "tutor" may use the tutor dashboard.
        setAllowed(data?.tutor?.role === "tutor");
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Still verifying — render nothing so we don't flash-redirect a logged-in
  // tutor on a hard refresh.
  if (allowed === null) return null;

  if (!allowed) {
    // Clear any stale display cache a previous build left behind.
    try {
      localStorage.removeItem("tutor_token");
      localStorage.removeItem("tutor_info");
    } catch {}
    return <Navigate to={`${ADMIN_PATH}/tutor`} replace />;
  }

  return children;
}