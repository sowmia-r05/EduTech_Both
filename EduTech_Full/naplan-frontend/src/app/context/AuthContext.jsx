/**
 * AuthContext.jsx
 *
 * FIX: loginChild no longer clears the parent token.
 *
 * WHAT WAS BROKEN:
 *   loginChild() was removing parent_token from localStorage before storing
 *   the child token. Combined with the backend not returning a token in the
 *   JSON body (fixed in childAuthRoutes.js), this caused:
 *
 *     loginChild(undefined, child)
 *       → parent token removed  ✗
 *       → child token NOT stored (token was undefined)  ✗
 *       → isAuthenticated = false
 *       → RequireAuth → redirect to "/"
 *       → Landing page shown instead of results
 *       → Refresh → no tokens → logout
 *
 * FIX:
 *   - loginChild now PRESERVES the parent token (overlay design).
 *     ChildDashboard already uses `childToken || parentToken` as activeToken,
 *     so the parent session is available as a fallback at all times.
 *   - logoutChild only removes the child token — parent session is restored
 *     automatically (already correct behavior).
 *   - isInitializing stays true until after the first render so RequireAuth
 *     never redirects during the initial token hydration from localStorage.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Read token from localStorage, clear it if expired
function readValidToken(key) {
  const token = localStorage.getItem(key);
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem(key);
    localStorage.removeItem(key.replace("_token", "_profile"));
    return null;
  }
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {

  // ── Synchronous init from localStorage — no logout flash on refresh ─────────
  const [parentToken,   setParentToken]   = useState(() => readValidToken("parent_token"));
  const [childToken,    setChildToken]    = useState(() => readValidToken("child_token"));
  const [parentProfile, setParentProfile] = useState(() => safeJsonParse("parent_profile"));
  const [childProfile,  setChildProfile]  = useState(() => safeJsonParse("child_profile"));

  // isInitializing: true on first render, false after mount
  // RequireAuth waits for this before redirecting
  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => { setIsInitializing(false); }, []);

  // ─── Derived ────────────────────────────────────────────────────────────────
  // If child is logged in, use child token. Otherwise use parent token.
  const activeRole  = childToken ? "child" : parentToken ? "parent" : null;
  const activeToken = childToken || parentToken || null;

  // ─── Actions ────────────────────────────────────────────────────────────────

  const loginParent = useCallback((token, profile) => {
    if (token) {
      localStorage.setItem("parent_token", token);
      setParentToken(token);
    }
    if (profile) {
      localStorage.setItem("parent_profile", JSON.stringify(profile));
      setParentProfile(profile);
    }
  }, []);

  /**
   * loginChild — stores child session ON TOP of the parent session.
   *
   * ✅ FIX: Parent token is NO LONGER cleared here.
   *
   * Design: Both parent_token and child_token can coexist in localStorage.
   * ChildDashboard uses `childToken || parentToken` as activeToken.
   * When logoutChild() is called, child_token is removed and the parent
   * session is automatically restored — no re-login needed.
   *
   * This is the "overlay" pattern described in QuickChildLoginModal's comment:
   * "Layer child token on top of existing parent session."
   */
  const loginChild = useCallback((token, profile) => {
    // ✅ FIX: Do NOT remove parent token — it's preserved for when child logs out
    if (token) {
      localStorage.setItem("child_token", token);
      setChildToken(token);
    }
    if (profile) {
      localStorage.setItem("child_profile", JSON.stringify(profile));
      setChildProfile(profile);
    }
  }, []);

  // Full logout — clears everything
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/parents/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    localStorage.removeItem("parent_token");
    localStorage.removeItem("child_token");
    localStorage.removeItem("parent_profile");
    localStorage.removeItem("child_profile");
    setParentToken(null);
    setChildToken(null);
    setParentProfile(null);
    setChildProfile(null);
  }, []);

  // Child logout — only removes child session, parent session stays
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
    // parentToken is still in localStorage — parent session automatically restored
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
