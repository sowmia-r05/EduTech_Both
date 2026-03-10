/**
 * ChildAvatarMenu.jsx — UPDATED
 *
 * Renders a "Learning Progress" pill button BESIDE the avatar (not in dropdown).
 * The Learning Progress button is hidden when isOnAnalyticsPage={true}.
 *
 * Dropdown contents:
 *   Both roles   → [info row]
 *   Both roles   → [← Back to Child Dashboard]
 *   Parent only  → [← Back to Parent Dashboard]
 *   Both roles   → [🚪 Log Out]
 *
 * Props:
 *   displayName           string  — child's display name
 *   isParentViewing       bool    — true when parent JWT is active
 *   isOnAnalyticsPage     bool    — hides the Learning Progress button when true
 *   onViewAnalytics       fn      — opens the analytics / learning progress view
 *   onBackToParent        fn      — navigates to /parent-dashboard
 *   onBackToChildDashboard fn     — navigates back to child dashboard (closes analytics)
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
  isOnAnalyticsPage = false,
  hideBackToChild = false,
  onViewAnalytics,
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
    /* Outer wrapper: Learning Progress button + avatar pill side by side */
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

      {/* ── Learning Progress button — hidden when on analytics page ── */}
      {!isOnAnalyticsPage && (
        <button
          onClick={onViewAnalytics}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "999px",
            border: "1.5px solid #C7D2FE",
            background: "#EEF2FF",
            color: "#4F46E5",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            outline: "none",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#E0E7FF";
            e.currentTarget.style.borderColor = "#A5B4FC";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#EEF2FF";
            e.currentTarget.style.borderColor = "#C7D2FE";
          }}
        >
          {/* Bar-chart icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4F46E5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          Learning Progress
        </button>
      )}

      {/* ── Avatar pill + dropdown ── */}
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
            boxShadow: open ? "0 0 0 3px rgba(99,102,241,0.12)" : "none",
            transition: "all 0.15s",
          }}
        >
          {/* Initials circle */}
          <span
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              flexShrink: 0,
              background: isParentViewing
                ? "linear-gradient(135deg,#7C3AED,#4F46E5)"
                : "linear-gradient(135deg,#059669,#0891B2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.03em",
            }}
          >
            {initials}
          </span>

          {/* Name */}
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#374151",
              maxWidth: "110px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName || "Student"}
          </span>

          {/* Chevron */}
          <ChevronDown
            style={{
              width: "14px",
              height: "14px",
              color: "#9CA3AF",
              flexShrink: 0,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: "224px",
              background: "#fff",
              borderRadius: "14px",
              border: "1px solid #E5E7EB",
              boxShadow:
                "0 10px 30px -5px rgba(0,0,0,0.12), 0 4px 10px -2px rgba(0,0,0,0.06)",
              zIndex: 9999,
              overflow: "hidden",
            }}
          >
            {/* Info header */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #F3F4F6",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isParentViewing
                    ? "linear-gradient(135deg,#7C3AED,#4F46E5)"
                    : "linear-gradient(135deg,#059669,#0891B2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#111827",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName || "Student"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#9CA3AF" }}>
                  {isParentViewing ? "Viewing as parent" : "Student account"}
                </p>
              </div>
            </div>

            {/* Navigation items */}
            <div style={{ padding: "6px" }}>

              {/* ← Back to Child Dashboard — always (both parent & child) */}
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
    </div>
  );
}
