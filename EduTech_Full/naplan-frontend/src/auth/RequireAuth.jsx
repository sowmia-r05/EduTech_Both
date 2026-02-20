import { useAuth0 } from "@auth0/auth0-react";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth0();
  const location = useLocation();

  if (isLoading) return <div className="p-6">Loading…</div>;

  if (!isAuthenticated) {
    // Save where user wanted to go
    return <Navigate to="/login" state={{ from: window.location.hash || "#/" + location.pathname.replace(/^\//, "") }} replace />;
  }

  return children;
}
