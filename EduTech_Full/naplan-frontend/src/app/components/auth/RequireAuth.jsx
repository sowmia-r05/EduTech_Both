import { Navigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

/**
 * Parent-only route guard
 * Allows access if:
 * - React auth state says parent is logged in, OR
 * - parent token exists in localStorage (fallback after refresh / rehydrate delay)
 */
export function RequireParent({ children }) {
  const { isParent } = useAuth();

  const hasParentToken =
    typeof window !== "undefined" && !!localStorage.getItem("parent_token");

  if (!isParent && !hasParentToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * Child-only route guard
 * Allows access if:
 * - React auth state says child is logged in, OR
 * - child token exists in localStorage
 */
export function RequireChild({ children }) {
  const { isChild } = useAuth();

  const hasChildToken =
    typeof window !== "undefined" && !!localStorage.getItem("child_token");

  if (!isChild && !hasChildToken) {
    return <Navigate to="/child-login" replace />;
  }

  return children;
}

/**
 * Generic authenticated guard
 * Allows access if:
 * - isAuthenticated is true, OR
 * - parent/child flags are true, OR
 * - any auth token exists in localStorage
 */
export function RequireAuth({ children }) {
  const { isAuthenticated, isParent, isChild } = useAuth();

  const hasAnyToken =
    typeof window !== "undefined" &&
    (!!localStorage.getItem("parent_token") ||
      !!localStorage.getItem("child_token") ||
      !!localStorage.getItem("token")); // optional legacy fallback

  if (!isAuthenticated && !isParent && !isChild && !hasAnyToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}