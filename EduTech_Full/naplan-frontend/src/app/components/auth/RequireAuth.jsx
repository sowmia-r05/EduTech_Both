import { Navigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

// ── Spinner shown while tokens rehydrate from localStorage on tab reopen ──
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Parent-only route guard
 * Waits for auth to initialize before deciding to redirect.
 */
export function RequireParent({ children }) {
 const { isParent, isInitializing } = useAuth();
 if (isInitializing) return <LoadingSpinner />;
 if (!isParent) return <Navigate to="/" replace />;
 return children;
}


/**
 * Child-only route guard
 * Waits for auth to initialize before deciding to redirect.
 */
// RequireChild — updated:
export function RequireChild({ children }) {
 const { isChild, isInitializing } = useAuth();
 if (isInitializing) return <LoadingSpinner />;
 if (!isChild) return <Navigate to="/child-login" replace />;
 return children;
}


/**
 * Generic authenticated guard
 * Waits for auth to initialize before deciding to redirect.
 */
// RequireAuth — updated:
export function RequireAuth({ children }) {
 const { isAuthenticated, isInitializing } = useAuth();
 if (isInitializing) return <LoadingSpinner />;
 if (!isAuthenticated) return <Navigate to="/" replace />;
 return children;
}
