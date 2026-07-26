/**
 * AdminLogin.jsx
 *
 * Admin-only login. Uses the shared /api/admin/login endpoint (tutors use the
 * same route via Tutorlogin.jsx) and relies on the httpOnly `admin_token`
 * cookie the server sets — credentials:"include" is what makes that work
 * across the naplan → naplanapi subdomain hop.
 *
 * Role gate: /api/admin/login admits both "admin" and "tutor". Without the
 * check below, a tutor signing in here would be navigated to the admin
 * dashboard, then bounced straight back by RequireAdmin's own role check —
 * with no error shown. Mirrors the guard in Tutorlogin.jsx.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [wakingUp,     setWakingUp]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const wakeTimer = useRef(null);

  // Clear the cold-start timer if the component unmounts mid-request.
  useEffect(() => () => clearTimeout(wakeTimer.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setError("Enter your email");    return; }
    if (!password)      { setError("Enter your password"); return; }

    // Drop any profile left behind by a previous session before we try again.
    try { localStorage.removeItem("admin_info"); } catch {}

    try {
      setLoading(true);
      // Render free tier sleeps after ~15 min idle; the first request of the
      // day can take 30-60s. Say so rather than leaving a silent spinner.
      wakeTimer.current = setTimeout(() => setWakingUp(true), 6000);

      const res = await fetch(`${API}/api/admin/login`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",   // sends/receives the httpOnly cookie
        body:        JSON.stringify({ email: trimmedEmail, password }),
      });

      // Do NOT call res.json() directly. A cold start, proxy timeout or
      // rate-limit page returns HTML, and the SyntaxError from parsing it
      // would surface to the user as "Unexpected token '<'".
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Too many attempts. Please wait a few minutes and try again.");
        }
        throw new Error(data.error || `Login failed (${res.status})`);
      }

      // Admins only. Tutors have their own page and their own dashboard.
      if (data.admin?.role !== "admin") {
        throw new Error(
          "This login is for admins only. Tutors should use the tutor login page."
        );
      }

      // The session IS the httpOnly cookie. Keep only the non-sensitive
      // profile for display — never a token, which would be XSS-readable.
      localStorage.setItem("admin_info", JSON.stringify(data.admin));

      navigate(`${ADMIN_PATH}/dashboard`);
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      if (
        msg === "load failed" ||
        msg.includes("failed to fetch") ||
        msg.includes("networkerror")
      ) {
        setError("Couldn't reach the server. Check your connection and try again.");
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      clearTimeout(wakeTimer.current);
      setWakingUp(false);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Admin Access</h1>
          <p className="text-sm text-slate-400 mt-1">EduTech Quiz Management</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoFocus
              autoComplete="email"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 pr-10 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : "Sign In"}
          </button>

          {wakingUp && (
            <p className="text-xs text-slate-400 text-center">
              Waking up the server — this can take up to a minute on the first
              request of the day.
            </p>
          )}
        </form>

        <p className="text-xs text-slate-500 text-center mt-4">
          This panel is for internal use only.
        </p>
      </div>
    </div>
  );
}