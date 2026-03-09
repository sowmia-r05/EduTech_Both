/**
 * ChildAvatarMenu.jsx
 *
 * Avatar dropdown for the Child Dashboard header.
 * Matches ParentDashboard UserMenu pill style exactly.
 *
 * Shows:  initials circle + name + chevron → dropdown with:
 *   • Child name (info row)
 *   • View Analytics
 *   • Log Out
 *
 * Usage inside <DashboardHeader>:
 *   <ChildAvatarMenu
 *     displayName={displayName}
 *     onViewAnalytics={() => setShowAnalytics(true)}
 *   />
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim()[0]?.toUpperCase() || "?";
}

export default function ChildAvatarMenu({ displayName, onViewAnalytics }) {
  const { logoutChild, logout, childToken } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const initials = getInitials(displayName);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    if (childToken) logoutChild();
    else logout();
    navigate("/");
  };

  const handleViewAnalytics = () => {
    setOpen(false);
    onViewAnalytics?.();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* ── Pill trigger — same style as ParentDashboard UserMenu ── */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#F9FAFB",
          borderRadius: "24px",
          padding: "4px 12px 4px 4px",
          border: "1px solid #E5E7EB",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Initials circle — teal/cyan for child, distinct from parent's purple/blue */}
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#059669,#0891B2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          {initials}
        </div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
          {displayName ? displayName.split(" ")[0] : "Student"}
        </span>
        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="#9CA3AF" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "220px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
            overflow: "hidden",
            zIndex: 200,
          }}
        >
          {/* Info row */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "34px", height: "34px", borderRadius: "50%",
                  background: "linear-gradient(135deg,#059669,#0891B2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: "13px", fontWeight: 700, flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName || "Student"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#9CA3AF" }}>
                  Student account
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "6px" }}>
            {/* View Analytics */}
            {onViewAnalytics && (
              <MenuItem
                onClick={handleViewAnalytics}
                iconBg="#EEF2FF"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                }
                label="View Analytics"
                color="#374151"
                hoverBg="#F9FAFB"
              />
            )}
          </div>

          {/* Divider + Logout */}
          <div style={{ borderTop: "1px solid #F3F4F6", padding: "6px" }}>
            <MenuItem
              onClick={handleLogout}
              iconBg="#FEF2F2"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              }
              label="Log Out"
              color="#DC2626"
              hoverBg="#FEF2F2"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable menu item ── */
function MenuItem({ onClick, iconBg, icon, label, color, hoverBg }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "8px",
        border: "none",
        background: hovered ? hoverBg : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      <span
        style={{
          width: "26px", height: "26px", borderRadius: "7px",
          background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 600, color }}>{label}</span>
    </button>
  );
}
