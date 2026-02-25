import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

// ─── Token helpers ───

function getStoredToken() {
  try { return localStorage.getItem("edutech_token") || null; } catch { return null; }
}

function storeToken(token) {
  try { localStorage.setItem("edutech_token", token); } catch {}
}

function clearStoredToken() {
  try {
    localStorage.removeItem("edutech_token");
    localStorage.removeItem("edutech_parent");
  } catch {}
}

function parseJWT(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch { return null; }
}

function isTokenExpired(token) {
  const payload = parseJWT(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

// ─── API call helper ───

async function authFetch(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── Provider ───

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);
  const [parent, setParent] = useState(() => {
    try {
      const s = localStorage.getItem("edutech_parent");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!token && !isTokenExpired(token);
  const role = token ? parseJWT(token)?.role : null;

  useEffect(() => {
    if (parent) {
      try { localStorage.setItem("edutech_parent", JSON.stringify(parent)); } catch {}
    }
  }, [parent]);

  // Verify token on mount
  useEffect(() => {
    const verify = async () => {
      const stored = getStoredToken();
      if (!stored || isTokenExpired(stored)) {
        clearStoredToken();
        setToken(null);
        setParent(null);
        setLoading(false);
        return;
      }
      try {
        const data = await authFetch("/api/auth/me");
        setParent(data.parent);
      } catch {
        clearStoredToken();
        setToken(null);
        setParent(null);
      }
      setLoading(false);
    };
    verify();
  }, []);

  // ─── Auth methods ───

  // Step 1: Send OTP to email
  const sendOTP = useCallback(async (email) => {
    const data = await authFetch("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return data; // { ok, email_masked, is_existing }
  }, []);

  // Step 2: Verify OTP (login or register)
  const verifyOTP = useCallback(async ({ email, otp, first_name, last_name }) => {
    const data = await authFetch("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, first_name, last_name }),
    });
    storeToken(data.token);
    setToken(data.token);
    setParent(data.parent);
    return data; // { token, parent, is_new }
  }, []);

  // Google Sign-In
  const googleAuth = useCallback(async (credential) => {
    const data = await authFetch("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    storeToken(data.token);
    setToken(data.token);
    setParent(data.parent);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setParent(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await authFetch("/api/auth/me");
      setParent(data.parent);
    } catch {}
  }, []);

  const value = {
    token, parent, loading, isAuthenticated, role,
    sendOTP, verifyOTP, googleAuth, logout, refreshProfile,
    authFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { authFetch, API_BASE };
