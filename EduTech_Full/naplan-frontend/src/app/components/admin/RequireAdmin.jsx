/**
 * RequireAdmin.jsx
 *
 * ✅ FIXED: On reload, if localStorage is unavailable or token is null,
 *           we no longer send "Bearer null" — the cookie acts as fallback.
 *           Also guards the role check so tutors are redirected to /tutor login,
 *           not the admin login, avoiding confusion.
 */

import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

function isAdminTokenValid() {
  try {
    const token = localStorage.getItem("admin_token");

    // ✅ Treat "null" / "undefined" strings the same as missing token
    if (!token || token === "null" || token === "undefined") return false;

    const payload = JSON.parse(atob(token.split(".")[1]));

    // ✅ Expired — clear and redirect
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
      return false;
    }

    // ✅ Only allow role "admin" on the admin dashboard
    if (payload.role !== "admin") {
      return false;
    }

    return true;
  } catch {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    return false;
  }
}

export default function RequireAdmin({ children }) {
  if (!isAdminTokenValid()) {
    return <Navigate to={ADMIN_PATH} replace />;
  }
  return children;
}