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

// ─── Session probe ────────────────────────────────────────────────────────────
// Returns: { parent, child } | "UNKNOWN"
//
// 🔴 REPLACES probeRole(). The previous version called:
//        GET /api/auth/me?role=parent
//        GET /api/auth/me?role=child
//    …but routes/sessionRoutes.js `/me` NEVER READS req.query.role. It reads
//    req.user.role, set by verifyToken from whichever cookie it picked. Both
//    calls therefore hit the same endpoint and returned the SAME answer.
//
//    Consequence: on a parent-only device, probeRole("child") returned the
//    PARENT profile, and setChildProfile(parentProfile) ran. isChild went true
//    and the parent was routed to the child dashboard. Both profiles held the
//    same object. The ?role= param looked like it disambiguated the two roles;
//    it was never wired up server-side.
//
//    GET /api/auth/session is the endpoint that actually does this. It decodes
//    parent_token with the parent secret and child_token with the child secret
//    (verifyParent / verifyChild), reports whichever exist, and never 401s.
//
// "UNKNOWN" stays load-bearing: 429 (rate limiter), 500 (cold Atlas), or
// 502/503 (Render redeploy) is NOT a logout.
async function probeSession() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      credentials: "include",
    });
    if (!res.ok) return "UNKNOWN";   // /session never 401s — a failure is server-side
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return "UNKNOWN";
    return { parent: data.parent || null, child: data.child || null };
  } catch {
    return "UNKNOWN"; // network blip — keep the cached profile
  }
}

// Enriches the ACTIVE role with the fuller profile /me returns (displayName,
// status, entitled_quiz_ids) — fields /session deliberately omits.
// Never clears anything: /session is the authority on what exists.
async function fetchMe() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
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
  // Tokens are memory-only and are ALWAYS null after a page refresh — and the
  // login response body no longer carries one at all, so they are null even
  // immediately after a successful login. Profiles are the session evidence.
  const activeRole =
    (childToken  || childProfile)  ? "child"  :
    (parentToken || parentProfile) ? "parent" : null;

  const activeToken = childToken || parentToken || null;

  // ─── Cookie rehydrate on mount ──────────────────────────────────────────────
  // One /session call reports BOTH cookies correctly, then /me enriches the
  // active role.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sess = await probeSession();
      if (cancelled) return;

      if (sess === "UNKNOWN") {
        // Server unhealthy — this is NOT a logout. Keep both cached profiles.
        setIsInitializing(false);
        return;
      }

      if (sess.parent) {
        const next = { role: "parent", ...sess.parent };
        setParentProfile(next);
        saveProfile("parent_profile", next);
      } else {
        clearProfile("parent_profile");
        setParentProfile(null);
      }

      if (sess.child) {
        const next = { role: "child", ...sess.child };
        setChildProfile(next);
        saveProfile("child_profile", next);
      } else {
        clearProfile("child_profile");
        setChildProfile(null);
      }

      // Enrich whichever role is active. Merged, never replaced wholesale.
      if (sess.parent || sess.child) {
        const me = await fetchMe();
        if (cancelled) return;
        if (me?.role === "child") {
          setChildProfile((prev) => ({ ...(prev || {}), ...me }));
          saveProfile("child_profile", { ...(loadProfile("child_profile") || {}), ...me });
        } else if (me?.role === "parent") {
          setParentProfile((prev) => ({ ...(prev || {}), ...me }));
          saveProfile("parent_profile", { ...(loadProfile("parent_profile") || {}), ...me });
        }
      }

      setIsInitializing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────
  // `token` is optional — the server sets an httpOnly cookie and returns no
  // token in the body. Callers still pass res.token (undefined); that is fine.
  // The PROFILE is what establishes the session.

  const loginParent = useCallback((token, profile) => {
    if (profile === undefined && token && typeof token === "object") {
      profile = token; token = undefined;
    }
    if (token) {
      saveToken("sess_parent_token", token);
      setParentToken(token);
    }
    if (profile) {
      const next = { role: "parent", ...profile };
      setParentProfile(next);
      saveProfile("parent_profile", next);
    }
    // A fresh parent login supersedes any lingering child session in this tab.
    saveToken("sess_child_token", null);
    setChildToken(null);
    setChildProfile(null);
    clearProfile("child_profile");
  }, []);

  const loginChild = useCallback((token, profile) => {
    if (profile === undefined && token && typeof token === "object") {
      profile = token; token = undefined;
    }
    if (token) {
      saveToken("sess_child_token", token);
      setChildToken(token);
    }
    if (profile) {
      const next = { role: "child", ...profile };
      setChildProfile(next);
      saveProfile("child_profile", next);
    }
    // parentProfile stays — the parent cookie is untouched and logoutChild()
    // drops straight back to it without a re-login.
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
    // parentProfile survives — parent is active again immediately.
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

      // ── Role flags — profile-driven and MUTUALLY EXCLUSIVE ────────────────
      // 🔴 WAS: isParent: !childToken && !!(parentToken || parentProfile)
      //    childToken is always null, so !childToken was always true — a
      //    logged-in child reported isParent AND isChild at the same time.
      //    Guards that test parent first threw children at /parent-dashboard,
      //    which bounced them back. Keyed off childProfile, they can't collide.
      isAuthenticated: !!(parentProfile || childProfile),
      isParent:        !childProfile && !!parentProfile,
      isChild:         !!childProfile,

      // Child active while the parent cookie is still alive — lets the UI offer
      // "switch back to parent" without a re-login.
      hasParentBehindChild: !!(childProfile && parentProfile),

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