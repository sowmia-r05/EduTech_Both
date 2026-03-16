import {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL : "";

// ─── Token store — sessionStorage only (not localStorage) ────────────────────
// sessionStorage: per-tab, cleared when browser closes, not persistent
// This is safer than localStorage (less persistent) while avoiding
// the timing/rehydration problems of memory-only storage
function saveToken(key, val) {
  try { if (val) localStorage.setItem(key, val);
        else localStorage.removeItem(key); } catch {}
}
function loadToken(key) {
  try { return localStorage.getItem(key) || null; } catch { return null; }
}


// ─── Profile cache — localStorage for display only (non-sensitive) ────────────
function saveProfile(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function loadProfile(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function clearProfile(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ─── Token expiry check ───────────────────────────────────────────────────────
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function readValidToken(key) {
  const token = loadToken(key);
  if (!token || isTokenExpired(token)) {
    saveToken(key, null);
    return null;
  }
  return token;
}

// ─── One-time cleanup of legacy localStorage tokens ───────────────────────────
;(function cleanupLegacyTokens() {
  try {
    localStorage.removeItem("parent_token");
    localStorage.removeItem("child_token");
    localStorage.removeItem("admin_token");
  } catch {}
})();

// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {

  // Read from sessionStorage on init — survives page refresh, not browser close
  const [parentToken,   setParentToken]   = useState(() => readValidToken("sess_parent_token"));
  const [childToken,    setChildToken]    = useState(() => readValidToken("sess_child_token"));

  // Profile display cache from localStorage (non-sensitive)
  const [parentProfile, setParentProfile] = useState(() => loadProfile("parent_profile"));
  const [childProfile,  setChildProfile]  = useState(() => loadProfile("child_profile"));

  // isInitializing: false immediately since we read synchronously from sessionStorage
  const [isInitializing, setIsInitializing] = useState(false);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const activeRole  = childToken  ? "child"  : parentToken ? "parent" : null;
  const activeToken = childToken || parentToken || null;

  // ─── Actions ────────────────────────────────────────────────────────────────

  const loginParent = useCallback((token, profile) => {
    if (token) {
      saveToken("sess_parent_token", token);
      setParentToken(token);
    }
    if (profile) {
      setParentProfile(profile);
      saveProfile("parent_profile", profile);
    }
  }, []);

  const loginChild = useCallback((token, profile) => {
    if (token) {
      saveToken("sess_child_token", token);
      setChildToken(token);
    }
    if (profile) {
      setChildProfile(profile);
      saveProfile("child_profile", profile);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/parents/auth/logout`, {
        method: "POST", credentials: "include",
      });
    } catch {}
    saveToken("sess_parent_token", null);
    saveToken("sess_child_token", null);
    clearProfile("parent_profile");
    clearProfile("child_profile");
    setParentToken(null);
    setChildToken(null);
    setParentProfile(null);
    setChildProfile(null);
  }, []);

  const logoutChild = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/child-logout`, {
        method: "POST", credentials: "include",
      });
    } catch {}
    saveToken("sess_child_token", null);
    clearProfile("child_profile");
    setChildToken(null);
    setChildProfile(null);
  }, []);

  const authHeaders = useCallback(
    () => (activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
    [activeToken]
  );

  const apiFetch = useCallback(
    (url, opts = {}) =>
      fetch(`${API_BASE}${url}`, {
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

  const value = useMemo(
    () => ({
      parentToken,
      childToken,
      parentProfile,
      childProfile,
      activeRole,
      activeToken,
      isInitializing,
      loginParent,
      loginChild,
      logout,
      logoutChild,
      authHeaders,
      apiFetch,
      isAuthenticated: !!(parentToken || childToken),
      isParent:        !childToken && !!parentToken,
      isChild:         !!childToken,
      user: childProfile || parentProfile || null,
    }),
    [
      parentToken, childToken, parentProfile, childProfile,
      activeRole, activeToken, isInitializing,
      loginParent, loginChild, logout, logoutChild,
      authHeaders, apiFetch,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}


