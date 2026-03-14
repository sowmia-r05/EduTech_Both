import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL !== undefined
  ? import.meta.env.VITE_API_BASE_URL
  : "";

function safeJsonParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

export function AuthProvider({ children }) {

  // ─── Parent state ───
  const [parentToken, setParentToken] = useState(() => {
    const token = localStorage.getItem("parent_token");
    if (isTokenExpired(token)) {
      localStorage.removeItem("parent_token");
      localStorage.removeItem("parent_profile");
      return null;
    }
    return token;
  });
  const [parentProfile, setParentProfile] = useState(
    () => safeJsonParse("parent_profile")
  );

  // ─── Child state ───
  const [childToken, setChildToken] = useState(() => {
    const token = localStorage.getItem("child_token");
    if (isTokenExpired(token)) {
      localStorage.removeItem("child_token");
      localStorage.removeItem("child_profile");
      return null;
    }
    return token;
  });
  const [childProfile, setChildProfile] = useState(
    () => safeJsonParse("child_profile")
  );

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setIsInitializing(false);
  }, []);

  // ─── Derived ───
  const activeRole  = childToken ? "child" : parentToken ? "parent" : null;
  const activeToken = childToken || parentToken || null;

  // ─── Actions ───
  // ✅ loginParent: stores token in BOTH localStorage (for existing components)
  //    AND the httpOnly cookie is already set by the server.
  //    This hybrid approach means no component breaks during migration.
  const loginParent = useCallback((token, profile) => {
    if (token) {
      localStorage.setItem("parent_token", token);
      setParentToken(token);
    }
    if (profile) localStorage.setItem("parent_profile", JSON.stringify(profile));
    setParentProfile(profile || null);
  }, []);

  const loginChild = useCallback((token, profile) => {
    // Clear parent session when child logs in directly
    localStorage.removeItem("parent_token");
    localStorage.removeItem("parent_profile");
    setParentToken(null);
    setParentProfile(null);

    if (token) {
      localStorage.setItem("child_token", token);
      setChildToken(token);
    }
    if (profile) localStorage.setItem("child_profile", JSON.stringify(profile));
    setChildProfile(profile || null);
  }, []);

  const logout = useCallback(async () => {
    // Clear cookies on backend
    try {
      await fetch(`${API_BASE}/api/parents/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    // Clear localStorage
    localStorage.removeItem("parent_token");
    localStorage.removeItem("child_token");
    localStorage.removeItem("parent_profile");
    localStorage.removeItem("child_profile");
    setParentToken(null);
    setChildToken(null);
    setParentProfile(null);
    setChildProfile(null);
  }, []);

  const logoutChild = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/child-logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    localStorage.removeItem("child_token");
    localStorage.removeItem("child_profile");
    setChildToken(null);
    setChildProfile(null);
  }, []);

  const authHeaders = useCallback(() => {
    if (!activeToken) return {};
    return { Authorization: `Bearer ${activeToken}` };
  }, [activeToken]);

  const apiFetch = useCallback(
    (url, opts = {}) => fetch(`${API_BASE}${url}`, {
      ...opts,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        ...opts.headers,
      },
    }),
    [activeToken]
  );

  const value = useMemo(() => ({
    parentToken,
    childToken,
    parentProfile,
    childProfile,
    activeRole,
    activeToken,
    loginParent,
    loginChild,
    logout,
    logoutChild,
    authHeaders,
    apiFetch,
    isAuthenticated: !!activeToken,
    isParent:        activeRole === "parent",
    isChild:         activeRole === "child",
    isInitializing,
  }), [
    parentToken, childToken, parentProfile, childProfile,
    activeRole, activeToken,
    loginParent, loginChild, logout, logoutChild,
    authHeaders, apiFetch, isInitializing,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

