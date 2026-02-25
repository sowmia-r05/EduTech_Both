import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

// ─── Token helpers ───

function getStoredToken() {
  try {
    return localStorage.getItem("edutech_token") || null;
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    localStorage.setItem("edutech_token", token);
  } catch {}
}

function clearStoredToken() {
  try {
    localStorage.removeItem("edutech_token");
    localStorage.removeItem("edutech_parent");
  } catch {}
}

function parseJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
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
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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
      const stored = localStorage.getItem("edutech_parent");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!token && !isTokenExpired(token);
  const role = token ? parseJWT(token)?.role : null;

  // Persist parent to localStorage when it changes
  useEffect(() => {
    if (parent) {
      try {
        localStorage.setItem("edutech_parent", JSON.stringify(parent));
      } catch {}
    }
  }, [parent]);

  // On mount, verify token is still valid by calling /api/auth/me
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
        // Token invalid or expired
        clearStoredToken();
        setToken(null);
        setParent(null);
      }
      setLoading(false);
    };

    verify();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeToken(data.token);
    setToken(data.token);
    setParent(data.parent);
    return data;
  }, []);

  const register = useCallback(async ({ email, password, first_name, last_name, phone }) => {
    const data = await authFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, first_name, last_name, phone }),
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
    token,
    parent,
    loading,
    isAuthenticated,
    role,
    login,
    register,
    logout,
    refreshProfile,
    authFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Export for direct use in API utils
export { authFetch, API_BASE };
