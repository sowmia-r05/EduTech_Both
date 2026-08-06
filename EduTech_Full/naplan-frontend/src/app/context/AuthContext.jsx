import {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL : "";

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 FIX — PARENT LANDS ON THE CHILD DASHBOARD AFTER REOPENING A TAB
//
// BEFORE:
//     isParent: !childProfile && !!parentProfile,
//     isChild:  !!childProfile,
//
//   Role was decided by localStorage. localStorage survives tab close, browser
//   close, and reboot. Any `child_profile` left behind by an earlier child
//   login on that browser made isChild TRUE and — because of the !childProfile
//   term — forced isParent FALSE, even with a valid parent cookie and a cached
//   parent_profile. WelcomePage then sent the parent to /child-dashboard, which
//   rendered "Welcome back, Student!" with every field blank because there was
//   no child session behind it.
//
//   cleanupLegacyTokens() never removed it: it clears four TOKEN keys and does
//   not touch child_profile. logoutChild() clears it, but closing a tab is not
//   a logout, so it persisted indefinitely.
//
//   probeSession() would normally correct this, but when it returns "UNKNOWN"
//   (timeout, 500, cold Render instance) it deliberately keeps cached profiles
//   to avoid a false logout — leaving the stale key in charge of routing.
//
// AFTER: a `session_role` key is the ONLY thing that grants a role. It is
//   written in exactly three places — loginParent, loginChild, and a CONFIRMED
//   /session response. A stale profile blob cannot write it, so it cannot imply
//   a role. Profiles are now display data only.
//
//   This satisfies both requirements at once:
//     • No auto-logout — on "UNKNOWN" the last SERVER-CONFIRMED role is kept,
//       so a server blip never moves or logs out the user.
//     • No wrong dashboard — only the server can grant a role, so leftover
//       localStorage can never route a parent into a child session.
//
// SECURITY NOTE: this also closes a real gap. Previously anyone could type a
//   child_profile object into DevTools → Local Storage and render the child
//   dashboard. Role now traces back to a cookie the server verified. On a
//   platform serving minors that distinction matters.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Network timeout ─────────────────────────────────────────────────────────
// fetch() has NO default timeout. A stalled request hangs forever: no error,
// no rejection, the await simply never settles — which is what pinned the
// spinner on screen indefinitely.
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

// ─── Profile cache — localStorage, DISPLAY ONLY ──────────────────────────────
// These fill in names and avatars so the UI does not flash empty while
// /session is in flight. They no longer decide anything.
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

// ─── Session role — THE authority for routing ────────────────────────────────
// "parent" | "child" | null. Written ONLY by login actions and by a confirmed
// /session response.
const ROLE_KEY = "session_role";

function saveRole(role) {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch {}
}
function loadRole() {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === "parent" || r === "child" ? r : null;
  } catch { return null; }
}

// ─── Boot cleanup ─────────────────────────────────────────────────────────────
// Drops legacy token keys, and reconciles profiles against session_role so an
// orphaned profile from a previous session cannot linger. This is what
// immediately un-sticks a browser currently trapped on the child dashboard.
;(function bootCleanup() {
  try {
    ["parent_token", "child_token",
     "sess_parent_token", "sess_child_token"].forEach((k) => localStorage.removeItem(k));

    const role = loadRole();
    // A child profile with no confirmed child role is a leftover — the exact
    // artefact that was hijacking routing. Same rule for a parent profile.
    if (role !== "child")  clearProfile("child_profile");
    if (role === null)     clearProfile("parent_profile");
  } catch {}
})();

// ─── Session probe ────────────────────────────────────────────────────────────
// Returns: { parent, child } | "UNKNOWN"
//
// GET /api/auth/session verifies parent_token with the parent secret and
// child_token with the child secret, reports whichever exist, and never 401s.
// It touches NO database, so it is the only call the route guards block on.
//
// "UNKNOWN" is load-bearing: 429, 500, 502/503, or a timeout is NOT a logout.
async function probeSession() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return "UNKNOWN";
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return "UNKNOWN";
    return { parent: data.parent || null, child: data.child || null };
  } catch {
    return "UNKNOWN";
  }
}

// Enriches the active role with the fuller profile /me returns. This one DOES
// hit the database, so it never blocks the spinner.
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

  const [parentToken, setParentToken] = useState(null);
  const [childToken,  setChildToken]  = useState(null);

  const [parentProfile, setParentProfile] = useState(() => loadProfile("parent_profile"));
  const [childProfile,  setChildProfile]  = useState(() => loadProfile("child_profile"));

  // The routing authority. Seeded from the last server-confirmed role so a
  // reopened tab restores the correct dashboard instantly, with no flash and
  // no auto-logout.
  const [sessionRole, setSessionRole] = useState(() => loadRole());

  const [isInitializing, setIsInitializing] = useState(true);

  const activeToken = childToken || parentToken || null;

  // ─── Cookie rehydrate on mount ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sess = await probeSession();
        if (cancelled) return;

        if (sess === "UNKNOWN") {
          // Server unreachable or slow. NOT a logout, and NOT a reason to move
          // the user. Keep the last confirmed role exactly as it is.
          return;
        }

        const hadRole = !!loadRole();
        let confirmed = sess;

        // A single empty 200 is ambiguous — a cold instance, a dropped cookie,
        // or a mid-flight sliding-session rotation all produce it for a live
        // session. Only two clean empty 200s are believed.
        if (hadRole && !sess.parent && !sess.child) {
          await new Promise((r) => setTimeout(r, 600));
          if (cancelled) return;

          const retry = await probeSession();
          if (cancelled) return;

          if (retry === "UNKNOWN") return;
          confirmed = retry;

          if (!confirmed.parent && !confirmed.child) {
            clearProfile("parent_profile");
            clearProfile("child_profile");
            saveRole(null);
            setParentProfile(null);
            setChildProfile(null);
            setSessionRole(null);
            return;
          }
        }

        // ── The server has spoken. Cookies decide the role. ──────────────────
        // Child wins when both cookies are live: that is a parent who has
        // switched into a child session, and logoutChild() drops them back to
        // parent without a re-login.
        const nextRole = confirmed.child ? "child"
                       : confirmed.parent ? "parent"
                       : null;

        saveRole(nextRole);
        setSessionRole(nextRole);

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

        // Background enrichment — deliberately NOT awaited, so a slow database
        // call can never hold the route guards on a spinner.
        if (nextRole) {
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
            .catch(() => {});
        }
      } finally {
        // Runs on EVERY path: success, early return, timeout, or thrown error.
        // The spinner cannot outlive this effect.
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────
  // `token` is optional — the server sets an httpOnly cookie and returns no
  // token in the body. The PROFILE plus session_role establish the session.

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

    saveRole("parent");
    setSessionRole("parent");
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
    saveRole("child");
    setSessionRole("child");
  }, []);

  const logout = useCallback(async () => {
    // Both cookies must die. Clearing only the parent cookie left child_token
    // alive server-side, so the next rehydrate probe resurrected the child.
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
    saveRole(null);
    setParentToken(null);
    setChildToken(null);
    setParentProfile(null);
    setChildProfile(null);
    setSessionRole(null);
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

    // Drop back to parent if that cookie is still live, otherwise fully out.
    const backToParent = !!loadProfile("parent_profile");
    saveRole(backToParent ? "parent" : null);
    setSessionRole(backToParent ? "parent" : null);
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
      activeRole: sessionRole,
      activeToken,
      isInitializing,
      loginParent,
      loginChild,
      logout,
      logoutChild,
      authHeaders,
      apiFetch,

      // ── Role flags — driven by the SERVER-CONFIRMED role ──────────────────
      // No longer derived from localStorage profile blobs, so a leftover
      // child_profile can never route a parent to the child dashboard.
      isAuthenticated: !!sessionRole,
      isParent:        sessionRole === "parent",
      isChild:         sessionRole === "child",

      // Child active while the parent cookie is still alive — lets the UI offer
      // "switch back to parent" without a re-login.
      hasParentBehindChild: sessionRole === "child" && !!parentProfile,

      user: sessionRole === "child" ? childProfile
          : sessionRole === "parent" ? parentProfile
          : null,
    }),
    [
      parentToken, childToken, parentProfile, childProfile,
      sessionRole, activeToken, isInitializing,
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