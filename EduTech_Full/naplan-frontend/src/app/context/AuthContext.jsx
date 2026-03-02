import { createContext, useContext, useState, useCallback, useMemo } from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : "";

function safeJsonParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // ─── Parent state ───
  const [parentToken, setParentToken] = useState(
    () => localStorage.getItem("parent_token") || null
  );
  const [parentProfile, setParentProfile] = useState(() => safeJsonParse("parent_profile"));

  // ─── Child state ───
  const [childToken, setChildToken] = useState(
    () => localStorage.getItem("child_token") || null
  );
  const [childProfile, setChildProfile] = useState(() => safeJsonParse("child_profile"));

  // ─── Derived ───
  const activeRole = childToken ? "child" : parentToken ? "parent" : null;
  const activeToken = childToken || parentToken || null;

  // ─── Actions ───
  const loginParent = useCallback((token, profile) => {
    localStorage.setItem("parent_token", token);
    if (profile) localStorage.setItem("parent_profile", JSON.stringify(profile));
    setParentToken(token);
    setParentProfile(profile || null);
  }, []);

  const loginChild = useCallback((token, profile) => {
    localStorage.setItem("child_token", token);
    if (profile) localStorage.setItem("child_profile", JSON.stringify(profile));
    setChildToken(token);
    setChildProfile(profile || null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("parent_token");
    localStorage.removeItem("child_token");
    localStorage.removeItem("parent_profile");
    localStorage.removeItem("child_profile");
    setParentToken(null);
    setChildToken(null);
    setParentProfile(null);
    setChildProfile(null);
  }, []);

  const logoutChild = useCallback(() => {
    localStorage.removeItem("child_token");
    localStorage.removeItem("child_profile");
    setChildToken(null);
    setChildProfile(null);
  }, []);

  // ─── Auth headers helper for API calls ───
  const authHeaders = useCallback(() => {
    if (!activeToken) return {};
    return { Authorization: `Bearer ${activeToken}` };
  }, [activeToken]);

  // ─── ✅ FIX: apiFetch helper — used by AnswersModal, FlashcardReview, etc. ───
  // Previously missing, causing "i is not a function" error when AnswersModal
  // destructured { apiFetch } from useAuth() and got undefined.
  const apiFetch = useCallback(
    (url, opts = {}) => {
      return fetch(`${API_BASE}${url}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          ...opts.headers,
        },
      });
    },
    [activeToken]
  );

  const value = useMemo(
    () => ({
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
      apiFetch,             // ✅ FIX: Now exposed in context
      isAuthenticated: !!activeToken,
      isParent: activeRole === "parent",
      isChild: activeRole === "child",
    }),
    [
      parentToken, childToken, parentProfile, childProfile,
      activeRole, activeToken,
      loginParent, loginChild, logout, logoutChild, authHeaders,
      apiFetch,             // ✅ FIX: Added to deps
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
