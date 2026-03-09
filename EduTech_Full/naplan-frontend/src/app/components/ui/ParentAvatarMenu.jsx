/**
 * ParentAvatarMenu.jsx
 *
 * Avatar dropdown for the Parent Dashboard header.
 * Shows initials avatar → click → dropdown with:
 *   • Parent name + email (read-only info row)
 *   • + Add Child  (calls onAddChild prop)
 *   • 🎒 Child Login (calls onChildLogin prop)
 *   • Logout
 *
 * Usage in ParentDashboard.jsx:
 *
 *   import ParentAvatarMenu from "@/app/components/ui/ParentAvatarMenu";
 *
 *   // Replace the entire <div className="flex gap-3"> in the <header> with:
 *   <ParentAvatarMenu
 *     onAddChild={() => setIsAddModalOpen(true)}
 *     onChildLogin={() => setIsChildLoginModalOpen(true)}
 *   />
 *
 * The component reads parentProfile + logout from AuthContext itself.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, LogOut, ChevronDown, LogIn } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";

/* ── helpers ─────────────────────────────────────────────── */

function getInitials(profile) {
  if (!profile) return "?";
  if (profile.firstName || profile.lastName) {
    const f = (profile.firstName || "").trim()[0] || "";
    const l = (profile.lastName  || "").trim()[0] || "";
    return (f + l).toUpperCase() || "?";
  }
  if (profile.name) {
    const parts = profile.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (profile.email) return profile.email[0].toUpperCase();
  return "?";
}

function getDisplayName(profile) {
  if (!profile) return "Parent";
  if (profile.firstName) return profile.firstName;
  if (profile.name) return profile.name.split(" ")[0];
  return "Parent";
}

/* ── component ───────────────────────────────────────────── */

export default function ParentAvatarMenu({ onAddChild, onChildLogin }) {
  const { parentProfile, logout } = useAuth();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef   = useRef(null);

  const initials    = getInitials(parentProfile);
  const displayName = getDisplayName(parentProfile);
  const email       = parentProfile?.email || "";

  /* close on outside click */
  const handleOutside = useCallback((e) => {
    if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
  }, []);

  useEffect(() => {
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, handleOutside]);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate("/");
  };

  const handleAddChild = () => {
    setOpen(false);
    onAddChild?.();
  };

  const handleChildLogin = () => {
    setOpen(false);
    onChildLogin?.();
  };

  return (
    <div ref={menuRef} className="relative">

      {/* ── Avatar trigger ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className={[
          "flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full",
          "border transition-all duration-150 select-none",
          open
            ? "border-indigo-300 bg-indigo-50 shadow-sm"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
        ].join(" ")}
      >
        {/* Initials circle */}
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold leading-none flex-shrink-0">
          {initials}
        </span>

        {/* Name — hidden on very small screens */}
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
          {displayName}
        </span>

        <ChevronDown
          className={[
            "w-3.5 h-3.5 text-slate-400 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className={[
            "absolute right-0 top-full mt-2 w-60 z-50",
            "bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/60",
            "py-1.5 overflow-hidden",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150",
          ].join(" ")}
          role="menu"
        >
          {/* ── Info row ── */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
                {email && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{email}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="py-1">

            {/* Add Child */}
            <button
              onClick={handleAddChild}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors group"
            >
              <span className="w-7 h-7 rounded-lg bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors flex-shrink-0">
                <UserPlus className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2} />
              </span>
              <span className="font-medium">Add Child</span>
            </button>

            {/* Child Login */}
            <button
              onClick={handleChildLogin}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors group"
            >
              <span className="w-7 h-7 rounded-lg bg-violet-50 group-hover:bg-violet-100 flex items-center justify-center transition-colors flex-shrink-0">
                <LogIn className="w-3.5 h-3.5 text-violet-600" strokeWidth={2} />
              </span>
              <span className="font-medium">Child Login</span>
            </button>
          </div>

          {/* ── Divider + Logout ── */}
          <div className="border-t border-slate-100 py-1">
            <button
              onClick={handleLogout}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors group"
            >
              <span className="w-7 h-7 rounded-lg bg-rose-50 group-hover:bg-rose-100 flex items-center justify-center transition-colors flex-shrink-0">
                <LogOut className="w-3.5 h-3.5 text-rose-600" strokeWidth={2} />
              </span>
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
