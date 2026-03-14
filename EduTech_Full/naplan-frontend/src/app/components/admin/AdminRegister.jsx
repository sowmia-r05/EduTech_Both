/**
 * AdminRegister.jsx
 *
 * Admin registration via invite link.
 * The invite token comes from the URL (?invite=TOKEN) — never from env vars.
 *
 * Flow:
 *   1. super_admin generates invite → gets URL like /kai-ops-9281/register?invite=abc123...
 *   2. Sends URL to colleague
 *   3. Colleague opens URL → this page reads the token from the URL
 *   4. Fills in name/email/password → submits
 *   5. Backend validates token from MongoDB → creates pending account
 *   6. super_admin approves from admin panel
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function AdminRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ✅ Token comes from the URL — not from env var, not from localStorage
  const inviteToken = searchParams.get("invite") || "";

  const [form, setForm] = useState({
    name:            "",
    email:           "",
    password:        "",
    confirmPassword: "",
  });
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ── If no invite token in URL, show a clear message ──
  if (!inviteToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-600/20 mb-6">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Invite Link</h1>
          <p className="text-sm text-slate-400 mb-6">
            This page requires a valid invite link. Ask a super admin to generate one for you.
          </p>
          <button
            onClick={() => navigate(ADMIN_PATH)}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const name            = form.name.trim();
    const email           = form.email.trim().toLowerCase();
    const password        = form.password;
    const confirmPassword = form.confirmPassword;

    if (!name)  { setError("Name is required"); return; }
    if (!email) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email"); return; }
    if (!password || password.length < 12)  { setError("Password must be at least 12 characters"); return; }
    if (!/[A-Z]/.test(password))            { setError("Password must contain at least one uppercase letter"); return; }
    if (!/[0-9]/.test(password))            { setError("Password must contain at least one number"); return; }
    if (password !== confirmPassword)        { setError("Passwords do not match"); return; }

    try {
      setLoading(true);
      const res = await fetch(`${API}/api/admin/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name,
          email,
          password,
          invite_token: inviteToken, // ✅ from URL — not from env var
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──
  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600/20 mb-6">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Account Created</h1>
          <p className="text-sm text-slate-400 mb-6">
            Your account is pending approval from a super admin. You'll be able to log in once approved.
          </p>
          <button
            onClick={() => navigate(ADMIN_PATH)}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition"
          >
            ← Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Create Admin Account</h1>
          <p className="text-sm text-slate-400 mt-1">You were invited to join EduTech Admin</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
            <input type="text" value={form.name} onChange={update("name")}
              placeholder="John Doe" autoFocus autoComplete="name"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={update("email")}
              placeholder="you@company.com" autoComplete="email"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={form.password}
                onChange={update("password")} placeholder="Min 12 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 pr-10 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showPassword
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
            <input type="password" value={form.confirmPassword} onChange={update("confirmPassword")}
              placeholder="Repeat password" autoComplete="new-password"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-4">
          Your account will need approval before you can log in.
        </p>
      </div>
    </div>
  );
}
