/**
 * ChildAvatarMenu.jsx
 *
 * Avatar pill + dropdown only — "Learning Progress" button removed.
 *
 * Dropdown contents:
 *   Both roles   → [info row]
 *   Both roles   → [← Back to Child Dashboard]
 *   Parent only  → [← Back to Parent Dashboard]
 *   Both roles   → [🚪 Log Out]
 *
 * Props:
 *   displayName            string  — child's display name
 *   isParentViewing        bool    — true when parent JWT is active
 *   isOnAnalyticsPage      bool    — kept for API compat, no longer controls a button
 *   hideBackToChild        bool    — hides the Back to Child Dashboard item
 *   onViewAnalytics        fn      — kept for API compat
 *   onBackToParent         fn      — navigates to /parent-dashboard
 *   onBackToChildDashboard fn      — navigates back to child dashboard
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim()[0]?.toUpperCase() || "?";
}

function MenuItem({ onClick, iconBg, icon, label, color = "#374151", hoverBg = "#F9FAFB" }) {
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
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 500, color }}>{label}</span>
    </button>
  );
}

export default function ChildAvatarMenu({
  displayName,
  isParentViewing = false,
  isOnAnalyticsPage = false, // kept for API compat
  hideBackToChild = false,
  onViewAnalytics,           // kept for API compat
  onBackToParent,
  onBackToChildDashboard,
}) {
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

  const close = () => setOpen(false);

  const handleLogout = () => {
    close();
    if (childToken) logoutChild();
    else logout();
    navigate("/");
  };

  const handleBackToChild = () => {
    close();
    onBackToChildDashboard?.();
  };

  const handleBackToParent = () => {
    close();
    onBackToParent?.();
  };

  return (
    /* Only the avatar pill — Learning Progress button removed */
    <div ref={ref} style={{ position: "relative" }}>

      {/* Trigger pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 10px 4px 4px",
          borderRadius: "999px",
          border: open ? "1.5px solid #A5B4FC" : "1.5px solid #E5E7EB",
          background: open ? "#EEF2FF" : "#FFFFFF",
          cursor: "pointer",
          outline: "none",
          boxShadow: open ? "0 0 0 3px rgba(165,180,252,0.25)" : "none",
          transition: "all 0.15s",
        }}
      >
        {/* Avatar circle */}
        <span
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "999px",
            background: "linear-gradient(135deg, #6366F1, #7C3AED)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </span>

        {/* Name */}
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>

        <ChevronDown
          style={{
            width: "14px",
            height: "14px",
            color: "#9CA3AF",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "220px",
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {/* Info row */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  width: "34px", height: "34px", borderRadius: "999px",
                  background: "linear-gradient(135deg, #6366F1, #7C3AED)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: "13px", fontWeight: 700, flexShrink: 0,
                }}
              >
                {initials}
              </span>
              <div>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#111827" }}>{displayName}</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#9CA3AF" }}>
                  {isParentViewing ? "Viewing as parent" : "Student account"}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation items */}
          <div style={{ padding: "6px" }}>
            {/* ← Back to Child Dashboard */}
            {!hideBackToChild && (
              <MenuItem
                onClick={handleBackToChild}
                iconBg="#F0F9FF"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                }
                label="Back to Child Dashboard"
                color="#0284C7"
                hoverBg="#F0F9FF"
              />
            )}

            {/* ← Back to Parent Dashboard — parent only */}
            {isParentViewing && (
              <MenuItem
                onClick={handleBackToParent}
                iconBg="#F0FDF4"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                }
                label="Back to Parent Dashboard"
                color="#16A34A"
                hoverBg="#F0FDF4"
              />
            )}
          </div>

          {/* Divider + Log Out */}
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