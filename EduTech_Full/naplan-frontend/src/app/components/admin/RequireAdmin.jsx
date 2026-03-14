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
 // Admin session is also cookie-based now — check via a separate admin context
 // or add admin session to the /api/auth/session endpoint
 const adminInfo = localStorage.getItem("admin_info"); // profile only, not the token
 if (!adminInfo) return <Navigate to="/admin" replace />;
 return children;
}
// Note: admin_info (name, email, role) is NOT sensitive — it's fine in localStorage.
// Only the JWT (the actual credential) was moved to an httpOnly cookie.

