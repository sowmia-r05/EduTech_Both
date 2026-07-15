/**
 * RequireAdmin.jsx
 *
 * Cookie-based admin guard. There is no admin JWT in localStorage any more —
 * the session is the httpOnly `admin_token` cookie the server sets on login.
 * JavaScript cannot read that cookie, so instead of decoding a token locally we
 * ask the server who we are via GET /api/admin/me (which is protected by
 * requireAdmin and reads the cookie). The children render only if that call
 * confirms an active admin.
 *
 * Note: /api/admin/me admits both "admin" and "tutor" (requireAdmin allows
 * both), so we still check role === "admin" here to keep tutors off the admin
 * dashboard, matching the previous behaviour.
 */

import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function RequireAdmin({ children }) {
  // null = still checking, true = allowed, false = redirect
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/admin/me`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const data = await res.json().catch(() => ({}));
        // Only role "admin" may use the admin dashboard (tutors are redirected).
        setAllowed(data?.admin?.role === "admin");
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Still verifying the cookie session — render nothing (or a spinner) so we
  // don't flash-redirect an authenticated admin on a hard refresh.
  if (allowed === null) return null;

  if (!allowed) {
    // Clear any stale display cache a previous build left behind.
    try {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
    } catch {}
    return <Navigate to={ADMIN_PATH} replace />;
  }

  return children;
}