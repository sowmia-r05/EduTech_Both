import {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL : "";

// ─── Token store — MEMORY ONLY (never localStorage) ──────────────────────────
const _mem = {};
function saveToken(key, val) {
  if (val) _mem[key] = val;
  else delete _mem[key];
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
;(function cleanupLegacyTokens() {
  try {
    ["parent_token", "child_token",
     "sess_parent_token", "sess_child_token"].forEach((k) => localStorage.removeItem(k));
  } catch {}
})();

// ─── Per-role session probe ───────────────────────────────────────────────────
// Returns: profile object | "NO_SESSION" | "UNKNOWN"
//
// "UNKNOWN" is the load-bearing case. A 429 (rate limiter), 500 (cold Atlas
// query), or 502/503 (Render redeploy) is NOT a logout. The old code treated
// every !res.ok as "no session" and wiped both profiles — that is the random
// auto-logout on the parent and child dashboards.
async function probeRole(role) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me?role=${role}`, {
      credentials: "include",
    });
    if (res.ok) return await res.json();
    if (res.status === 401 || res.status === 403) return "NO_SESSION";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN"; // network blip — keep the cached profile
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {

  const [parentToken,   setParentToken]   = useState(null);
  const [childToken,    setChildToken]    = useState(null);

  const [parentProfile, setParentProfile] = useState(() => loadProfile("parent_profile"));
  const [childProfile,  setChildProfile]  = useState(() => loadProfile("child_profile"));

  const [isInitializing, setIsInitializing] = useState(true);

  // ─── Derived ────────────────────────────────────────────────────────────────
  // Tokens are memory-only and are ALWAYS null after a page refresh. Deriving
  // activeRole from tokens alone made every reload look like a logout to any
  // component switching on activeRole. Fall back to the rehydrated profile.
  const activeRole =
    (childToken  || childProfile)  ? "child"  :
    (parentToken || parentProfile) ? "parent" : null;

  const activeToken = childToken || parentToken || null;

  // ─── Cookie rehydrate on mount ──────────────────────────────────────────────
  // Probes BOTH roles independently. A device where the parent signed in and
  // then the child signed in holds both cookies; a single /me call could only
  // ever answer for one of them, so the other role silently went stale.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [parentRes, childRes] = await Promise.all([
        probeRole("parent"),
        probeRole("child"),
      ]);
      if (cancelled) return;

      if (parentRes === "NO_SESSION") {
        clearProfile("parent_profile");
        setParentProfile(null);
      } else if (parentRes && parentRes !== "UNKNOWN") {
        setParentProfile(parentRes);
        saveProfile("parent_profile", parentRes);
      }
      // "UNKNOWN" → leave the cached profile exactly as it is.

      if (childRes === "NO_SESSION") {
        clearProfile("child_profile");
        setChildProfile(null);
      } else if (childRes && childRes !== "UNKNOWN") {
        setChildProfile(childRes);
        saveProfile("child_profile", childRes);
      }

      setIsInitializing(false);
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
    // Both cookies must die. Clearing only the parent cookie left child_token
    // alive server-side, so the next rehydrate probe resurrected the child.
    try {
      await Promise.all([
        fetch(`${API_BASE}/api/parents/auth/logout`, {
          method: "POST", credentials: "include",
        }),
        fetch(`${API_BASE}/api/auth/child-logout`, {
          method: "POST", credentials: "include",
        }),
      ]);
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