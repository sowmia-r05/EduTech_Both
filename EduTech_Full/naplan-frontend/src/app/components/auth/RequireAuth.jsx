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

  const hasParentToken =
    typeof window !== "undefined" && !!localStorage.getItem("parent_token");

  if (isInitializing) return <LoadingSpinner />;

  if (!isParent && !hasParentToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * Child-only route guard
 * Waits for auth to initialize before deciding to redirect.
 */
export function RequireChild({ children }) {
  const { isChild, isInitializing } = useAuth();

  const hasChildToken =
    typeof window !== "undefined" && !!localStorage.getItem("child_token");

  if (isInitializing) return <LoadingSpinner />;

  if (!isChild && !hasChildToken) {
    return <Navigate to="/child-login" replace />;
  }

  return children;
}

/**
 * Generic authenticated guard
 * Waits for auth to initialize before deciding to redirect.
 */
export function RequireAuth({ children }) {
  const { isAuthenticated, isParent, isChild, isInitializing } = useAuth();

  const hasAnyToken =
    typeof window !== "undefined" &&
    (!!localStorage.getItem("parent_token") ||
      !!localStorage.getItem("child_token") ||
      !!localStorage.getItem("token"));

  if (isInitializing) return <LoadingSpinner />;

  if (!isAuthenticated && !isParent && !isChild && !hasAnyToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}