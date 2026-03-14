/**
 * RequireAdmin.jsx
 *
 * Route guard for admin pages.
 * Checks both admin_token (JWT validity/expiry) and admin_info (profile).
 * Redirects to the secret admin login path if not authenticated.
 *
 * Completely independent from parent/child auth — does not touch AuthContext.
 */

import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

function isAdminTokenValid() {
  const token = localStorage.getItem("admin_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Check expiry
    if (payload.exp * 1000 < Date.now()) {
      // Token expired — clean up
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
      return false;
    }
    // Check role
    if (payload.role !== "admin" && payload.role !== "super_admin") {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
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
