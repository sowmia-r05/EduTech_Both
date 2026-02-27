/**
 * RequireAdmin.jsx
 * 
 * Route guard for admin-only pages. Checks for admin_token in localStorage.
 * Completely independent from parent/child auth.
 * 
 * Place in: src/app/components/admin/RequireAdmin.jsx
 */

import { Navigate } from "react-router-dom";

export default function RequireAdmin({ children }) {
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("admin_token");
  if (!hasToken) return <Navigate to="/admin" replace />;
  return children;
}
