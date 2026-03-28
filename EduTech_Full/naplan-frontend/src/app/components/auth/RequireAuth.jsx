import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

/**
 * Route guard: redirects to /login if not authenticated.
 * Optionally checks role ("parent" or "child").
 *
 * Usage:
 *   <Route path="/parent-dashboard" element={<RequireAuth role="parent"><ParentDashboard /></RequireAuth>} />
 */
export default function RequireAuth({ children, role }) {
  const { isAuthenticated, role: userRole, loading } = useAuth();
  const location = useLocation();

  // Show nothing while checking auth on mount
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && userRole !== role) {
    // Wrong role — redirect to appropriate dashboard
    if (userRole === "child") return <Navigate to="/child-dashboard" replace />;
    if (userRole === "parent") return <Navigate to="/parent-dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}
