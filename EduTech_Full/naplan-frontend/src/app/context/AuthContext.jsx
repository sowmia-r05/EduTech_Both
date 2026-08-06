import {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL : "";

// ─── Network timeout ─────────────────────────────────────────────────────────
// 🔴 INFINITE-SPINNER FIX
//    fetch() has NO default timeout. /api/auth/me calls connectDB() then
//    Parent.findById() — against an Atlas cluster in a different region than
//    Render. When that connection stalls, the request hangs FOREVER: no error,
//    no rejection, the await simply never settles.
//
//    The old rehydrate effect awaited fetchMe() BEFORE setIsInitializing(false),
//    so a hung /me meant isInitializing stayed true permanently and
//    RequireParent rendered <LoadingSpinner /> with nothing to break the cycle.
//
//    Every fetch below now aborts after REQUEST_TIMEOUT_MS. An abort throws,
//    the catch returns "UNKNOWN"/null, and the flow continues normally.
const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
// GET /api/auth/session decodes parent_token with the parent secret and
// child_token with the child secret (verifyParent / verifyChild), reports
// whichever exist, and never 401s. It touches NO database, which is why it is
// the only call the spinner is allowed to block on.
//
// "UNKNOWN" is load-bearing: 429 (rate limiter), 500 (cold Atlas), or
// 502/503 (Render redeploy) is NOT a logout. A timeout is not a logout either.
async function probeSession() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return "UNKNOWN";   // /session never 401s — a failure is server-side
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return "UNKNOWN";
    return { parent: data.parent || null, child: data.child || null };
  } catch {
    return "UNKNOWN"; // network blip, or aborted timeout — keep the cached profile
  }
}

// Enriches the ACTIVE role with the fuller profile /me returns (displayName,
// status, entitled_quiz_ids) — fields /session deliberately omits.
// Never clears anything: /session is the authority on what exists.
//
// This hits the DATABASE. It must never block the spinner.
async function fetchMe() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    });
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
  //
  // 🔴 FIX 1 — try/finally. setIsInitializing(false) is now UNCONDITIONAL.
  //    Previously six separate early-returns each had to remember to call it,
  //    and the post-fetchMe path could skip it entirely. The spinner can no
  //    longer outlive this effect no matter which branch is taken or what
  //    throws.
  //
  // 🔴 FIX 2 — fetchMe() is fire-and-forget. /session already returns
  //    parentId, email and role, which is everything RequireParent needs to
  //    let the user through. /me only ADDS display fields, so it now runs in
  //    the background and merges when it lands. The dashboard paints as soon
  //    as /session answers instead of waiting on a DB round trip.
  //
  // RETAINED — the two-empty-200s rule. /api/auth/session returns 200 {} when
  //    it cannot read a cookie, and a single empty 200 is AMBIGUOUS, not proof
  //    of logout: a cold Render instance, a dropped cookie on one request, or a
  //    mid-flight sliding-session rotation all produce it for a live session.
  //    Only two clean empty 200s are believed.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sess = await probeSession();
        if (cancelled) return;

        if (sess === "UNKNOWN") {
          // Server unhealthy or timed out — NOT a logout. Keep cached profiles.
          return;
        }

        const hadCache = !!(loadProfile("parent_profile") || loadProfile("child_profile"));
        let confirmed = sess;

        if (hadCache && !sess.parent && !sess.child) {
          await new Promise((r) => setTimeout(r, 600));
          if (cancelled) return;

          const retry = await probeSession();
          if (cancelled) return;

          if (retry === "UNKNOWN") {
            // Still can't tell — keep the cached profiles rather than logging out.
            return;
          }

          confirmed = retry;

          if (!confirmed.parent && !confirmed.child) {
            // Two clean 200s with no session. Now we believe it.
            clearProfile("parent_profile");
            clearProfile("child_profile");
            setParentProfile(null);
            setChildProfile(null);
            return;
          }
        }

        if (confirmed.parent) {
          const next = { role: "parent", ...confirmed.parent };
          setParentProfile(next);
          saveProfile("parent_profile", next);
        } else {
          clearProfile("parent_profile");
          setParentProfile(null);
        }

        if (confirmed.child) {
          const next = { role: "child", ...confirmed.child };
          setChildProfile(next);
          saveProfile("child_profile", next);
        } else {
          clearProfile("child_profile");
          setChildProfile(null);
        }

        // ── Background enrichment — deliberately NOT awaited ──────────────────
        // A hung or slow /me can no longer hold the spinner hostage. If it
        // never returns, the user simply keeps the /session-derived profile.
        if (confirmed.parent || confirmed.child) {
          fetchMe()
            .then((me) => {
              if (cancelled || !me) return;
              if (me.role === "child") {
                setChildProfile((prev) => ({ ...(prev || {}), ...me }));
                saveProfile("child_profile", { ...(loadProfile("child_profile") || {}), ...me });
              } else if (me.role === "parent") {
                setParentProfile((prev) => ({ ...(prev || {}), ...me }));
                saveProfile("parent_profile", { ...(loadProfile("parent_profile") || {}), ...me });
              }
            })
            .catch(() => {}); // enrichment is optional — never fatal
        }
      } finally {
        // Runs on EVERY path: success, early return, timeout, or thrown error.
        if (!cancelled) setIsInitializing(false);
      }
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
    //
    // Timeout-wrapped: a hung logout request used to leave the button spinning
    // and the local state uncleared. Local cleanup now always runs.
    try {
      await Promise.all([
        fetchWithTimeout(`${API_BASE}/api/parents/auth/logout`, {
          method: "POST", credentials: "include",
        }),
        fetchWithTimeout(`${API_BASE}/api/auth/child-logout`, {
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
      await fetchWithTimeout(`${API_BASE}/api/auth/child-logout`, {
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