// src/app/components/dashboardComponents/QuickChildLoginModal.jsx
//
// ✅ NEW FILE — Quick Child Login from Parent Dashboard
//
// Allows a parent to hand the device to their child without logging out.
// The child picks their profile, enters their PIN, and gets a child JWT
// layered on top of the existing parent session.
//
// When the child logs out (via logoutChild()), the parent session is
// automatically restored — no re-authentication needed.
//
// Place in: naplan-frontend/src/app/components/dashboardComponents/QuickChildLoginModal.jsx
//
// Usage in ParentDashboard.jsx:
//   import QuickChildLoginModal from "@/app/components/dashboardComponents/QuickChildLoginModal";
//
//   <QuickChildLoginModal
//     isOpen={isChildLoginModalOpen}
//     onClose={() => setIsChildLoginModalOpen(false)}
//     childrenList={children}
//   />

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function QuickChildLoginModal({ isOpen, onClose, childrenList = [] }) {
  const navigate = useNavigate();
  const { loginChild } = useAuth();
  const pinInputRef = useRef(null);

  // "pick" → select child | "pin" → enter PIN | "manual" → type username + PIN
  const [mode, setMode] = useState("pick");
  const [selectedChild, setSelectedChild] = useState(null);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setMode(childrenList.length > 0 ? "pick" : "manual");
      setSelectedChild(null);
      setUsername("");
      setPin("");
      setError("");
      setLoading(false);
    }
  }, [isOpen, childrenList.length]);

  // Auto-focus PIN input when entering PIN mode
  useEffect(() => {
    if (mode === "pin" && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [mode]);

  if (!isOpen) return null;

  const handlePickChild = (child) => {
    setSelectedChild(child);
    setUsername(child.username);
    setPin("");
    setError("");
    setMode("pin");
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError("");

    const cleanUsername = (username || "").trim().toLowerCase();
    const cleanPin = (pin || "").trim();

    if (!cleanUsername) {
      setError("Username is required");
      return;
    }
    if (!cleanPin || !/^\d{4,6}$/.test(cleanPin)) {
      setError("Enter a valid 4–6 digit PIN");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/child-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, pin: cleanPin }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Layer child token on top of existing parent session
      loginChild(data.token, data.child);
      onClose();
      navigate("/child-dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Check username and PIN.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const goBack = () => {
    setError("");
    setPin("");
    if (mode === "pin") {
      setMode(childrenList.length > 0 ? "pick" : "manual");
      setSelectedChild(null);
    } else if (mode === "manual" && childrenList.length > 0) {
      setMode("pick");
    } else {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">🎒</span> Child Login
          </h2>
          <button
            onClick={handleClose}
            className="text-white/70 hover:text-white text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {/* ═══════════════════════════════════
              MODE: PICK — Select a child card
             ═══════════════════════════════════ */}
          {mode === "pick" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Who's ready to learn? Pick a profile:
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {childrenList.map((child) => (
                  <button
                    key={child._id}
                    onClick={() => handlePickChild(child)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-slate-200
                               hover:border-violet-300 hover:bg-violet-50
                               focus:outline-none focus:ring-2 focus:ring-violet-400
                               transition-all duration-150 flex items-center gap-3"
                  >
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500
                                    flex items-center justify-center text-white font-bold text-lg
                                    shadow-sm flex-shrink-0">
                      {(child.display_name || child.username || "?")[0].toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {child.display_name || child.username}
                      </p>
                      <p className="text-xs text-slate-500">
                        @{child.username} · Year {child.year_level}
                      </p>
                    </div>
                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 text-slate-400 ml-auto flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>

              {/* Manual entry fallback */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setMode("manual");
                    setError("");
                  }}
                  className="text-sm text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                >
                  Or enter username manually →
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════
              MODE: PIN — Child selected, enter PIN
             ═══════════════════════════════════ */}
          {mode === "pin" && (
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Selected child avatar */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-violet-400 to-indigo-500
                                flex items-center justify-center text-white font-bold text-2xl shadow-md mb-2">
                  {(selectedChild?.display_name || selectedChild?.username || "?")[0].toUpperCase()}
                </div>
                <p className="font-semibold text-slate-900 text-lg">
                  {selectedChild?.display_name}
                </p>
                <p className="text-xs text-slate-500">@{selectedChild?.username}</p>
              </div>

              {/* PIN input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Enter your PIN
                </label>
                <input
                  ref={pinInputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl
                             text-center text-2xl tracking-[0.5em]
                             focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500
                             transition-all"
                  autoComplete="off"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm
                             text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading || pin.length < 6}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600
                             text-white rounded-xl text-sm font-semibold
                             hover:from-violet-700 hover:to-indigo-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all shadow-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Logging in…
                    </span>
                  ) : (
                    "Let's Go!"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ═══════════════════════════════════
              MODE: MANUAL — Type username + PIN
             ═══════════════════════════════════ */}
          {mode === "manual" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the child's username and PIN:
              </p>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="e.g. alex_2026"
                  maxLength={20}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500
                             transition-all text-sm"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              {/* PIN */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4–6 digit PIN"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl
                             text-center text-xl tracking-[0.4em]
                             focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500
                             transition-all"
                  autoComplete="off"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {childrenList.length > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm
                               text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    ← Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || !username.trim() || pin.length < 4}
                  className={`${childrenList.length > 0 ? "flex-1" : "w-full"} px-4 py-2.5
                             bg-gradient-to-r from-violet-600 to-indigo-600
                             text-white rounded-xl text-sm font-semibold
                             hover:from-violet-700 hover:to-indigo-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all shadow-sm`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Logging in…
                    </span>
                  ) : (
                    "Let's Go!"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Footer hint ── */}
        <div className="px-6 pb-4">
          <p className="text-xs text-slate-400 text-center">
            Parent session stays active. When your child logs out, you'll be back here automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
