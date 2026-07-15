import {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL : "";

// ─── Token store — MEMORY ONLY (never localStorage) ──────────────────────────
// The real session is the httpOnly cookie the server sets on login. It's sent
// automatically via credentials:"include" and cannot be read by JavaScript, so
// an XSS payload can't steal it. We keep the JWT string in memory only, because
// a few routes still read an Authorization: Bearer header. On page refresh this
// memory is empty, so we rehydrate from GET /api/auth/me (cookie-authenticated)
// instead of from storage.
const _mem = {};
function saveToken(key, val) {
  if (val) _mem[key] = val;
  else delete _mem[key];
  // Belt-and-braces: purge any legacy token a previous build persisted.
  try { localStorage.removeItem(key); } catch {}
}
function loadToken(key) {
  return _mem[key] || null;
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

// ─── One-time cleanup of legacy localStorage tokens ───────────────────────────
// Removes tokens any older build may have persisted, including the sess_* keys
// this version no longer writes.
;(function cleanupLegacyTokens() {
  try {
    ["parent_token", "child_token",
     "sess_parent_token", "sess_child_token"].forEach((k) => localStorage.removeItem(k));
  } catch {}
})();

// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {

  // Tokens start empty — memory only. They are populated on login, or on mount
  // by the cookie-rehydrate effect below.
  const [parentToken,   setParentToken]   = useState(null);
  const [childToken,    setChildToken]    = useState(null);

  // Profile display cache from localStorage (non-sensitive)
  const [parentProfile, setParentProfile] = useState(() => loadProfile("parent_profile"));
  const [childProfile,  setChildProfile]  = useState(() => loadProfile("child_profile"));

  // True until the cookie-rehydrate probe finishes, so guards can wait instead
  // of bouncing an authenticated user to /login on a hard refresh.
  const [isInitializing, setIsInitializing] = useState(true);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const activeRole  = childToken  ? "child"  : parentToken ? "parent" : null;
  const activeToken = childToken || parentToken || null;

  // ─── Cookie rehydrate on mount ────────────────────────────────────────────────
  // Memory is empty after a refresh, but the httpOnly cookie is still sent. Ask
  // the server who we are. /api/auth/me returns the PROFILE only (never a token),
  // which is fine — protected requests authenticate via the cookie, and any
  // route that still wants a Bearer header will get one again on next login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!cancelled && res.ok) {
          const me = await res.json();
          if (me?.role === "child") {
            setChildProfile(me);
            saveProfile("child_profile", me);
          } else if (me?.role === "parent") {
            setParentProfile(me);
            saveProfile("parent_profile", me);
          }
        } else if (!cancelled) {
          // No valid cookie session — clear any stale display cache.
          clearProfile("parent_profile");
          clearProfile("child_profile");
          setParentProfile(null);
          setChildProfile(null);
        }
      } catch {
        // Network error — leave cached profile as-is; don't force a logout.
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      isAuthenticated: !!(parentToken || childToken || parentProfile || childProfile),
      isParent:        !childToken && !!(parentToken || parentProfile),
      isChild:         !!(childToken || childProfile),
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