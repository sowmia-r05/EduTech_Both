/**
 * ParentDashboard.jsx — Purple Theme + UX Fixes
 *
 * ✅ All 4 stat cards unified in purple (#7C3AED)
 * ✅ "Open Dashboard" button with dashboard grid icon + purple gradient
 * ✅ EditChildModal: consent removed, only email notifications checkbox
 * ✅ AddChildModal: two checkboxes in a side-by-side grid (aligned)
 * ✅ Purple accent throughout (buttons, bars, badges, links, spinner)
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchChildrenSummaries,
  createChild,
  updateChild,
  deleteChild,
  checkUsername,
  fetchChildResults,
  fetchChildWriting,
  fetchAvailableQuizzes,
} from "@/app/utils/api-children";

import {
  createCheckout,
  fetchPurchaseHistory,
  retryPayment,
} from "@/app/utils/api-payments";
import { BUNDLE_CATALOG } from "@/app/data/bundleCatalog";
import PaymentSuccessModal from "@/app/components/payments/PaymentSuccessModal";
import QuickChildLoginModal from "@/app/components/dashboardComponents/QuickChildLoginModal";
import FreeTrialOnboarding from "@/app/components/dashboardComponents/FreeTrialOnboarding";
import ChildDataConsentPolicy from "@/app/components/ChildDataConsentPolicy";
import DashboardHeader from "@/app/components/layout/DashboardHeader";

// ═══════════════════════════════════════════════════════════════
//  PURPLE DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════
const PURPLE = {
  900: "#4C1D95",
  700: "#6D28D9",
  600: "#7C3AED",
  500: "#8B5CF6",
  400: "#A78BFA",
  200: "#DDD6FE",
  100: "#EDE9FE",
  50:  "#F5F3FF",
};

const AVATAR_COLORS = [
  "#F43F5E", // rose
  "#F97316", // orange
  "#EAB308", // amber
  "#10B981", // emerald
  "#06B6D4", // cyan
  "#6366F1", // indigo
  "#EC4899", // pink
  "#14B8A6", // teal
];

// ═══════════════════════════════════════════════════════════════
//  DATA HELPERS
// ═══════════════════════════════════════════════════════════════
const formatAUD = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)} AUD`;

function computeLastActiveDays(lastActivity) {
  if (!lastActivity) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000));
}

function mapChild(c) {
  return {
    id:                 c._id,
    name:               c.display_name || c.username || "Unknown",
    yearLevel:          c.year_level ? `Year ${c.year_level}` : "—",
    username:           c.username || "",
    status:             c.status === "active" ? "active" : "trial",
    quizzes:            c.quizCount || 0,
    score:              c.averageScore != null ? Math.round(c.averageScore) : null,
    lastActiveDays:     computeLastActiveDays(c.lastActivity),
    _id:                c._id,
    display_name:       c.display_name,
    year_level:         c.year_level,
    email_notifications: c.email_notifications ?? false,
    entitled_bundle_ids: c.entitled_bundle_ids || [],
    entitled_quiz_ids:   c.entitled_quiz_ids || [],
  };
}

function mapPayment(p) {
  let childName = "—";
  if (Array.isArray(p.child_ids) && p.child_ids.length) {
    const names = p.child_ids.map((c) => typeof c === "object" ? c.display_name || c.username || "?" : "?").filter(Boolean);
    if (names.length) childName = names.join(", ");
  }
  const isDeletedChild = Array.isArray(p.child_ids) && p.child_ids.length > 0 && p.child_ids.every((c) => typeof c === "string");
  return {
    _id:         p._id,
    description: p.bundle_name || p.description || "Bundle Purchase",
    amount:      formatAUD(p.amount_cents ?? p.price_cents),
    status:      p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "Pending",
    date:        p.created_at ? new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—",
    child:       childName,
    isDeletedChild,
  };
}

const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const ini = (name = "") => name.split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
const lastActiveLabel = (days) => {
  if (days === null || days === undefined) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
};

// ═══════════════════════════════════════════════════════════════
//  SHARED CARD — purple top accent border
// ═══════════════════════════════════════════════════════════════
function Card({ children }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "14px",
      border: `1px solid ${PURPLE[200]}`,
      borderTop: `3px solid ${PURPLE[600]}`,
      padding: "20px 22px",
      flex: "1 1 220px",
      minWidth: "200px",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 2px 12px rgba(124,58,237,0.08)",
    }}>
      {children}
    </div>
  );
}

function CardTop({ icon, label, subLabel, bigNum, bigNumPrefix, bigNumSub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: PURPLE[100], display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: PURPLE[600], letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>{subLabel}</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {bigNumPrefix && <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "1px" }}>{bigNumPrefix}</div>}
        <span style={{ fontSize: "36px", fontWeight: 900, color: "#111827", lineHeight: 1 }}>{bigNum}</span>
        {bigNumSub && <span style={{ fontSize: "14px", color: "#9CA3AF", marginLeft: "2px" }}>{bigNumSub}</span>}
      </div>
    </div>
  );
}

const EmptyRow = ({ message }) => (
  <div style={{ padding: "20px 0", textAlign: "center", color: "#D1D5DB", fontSize: "13px" }}>{message}</div>
);

// ─── 4 Stat Cards — all purple ──────────────────────────────────

function ChildrenCard({ childList }) {
  const active = childList.filter((c) => c.status === "active").length;
  const trial  = childList.filter((c) => c.status === "trial").length;
  return (
    <Card>
      <CardTop
        label="Children" subLabel="Profiles registered" bigNum={childList.length}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
      />
      {childList.length === 0 ? <EmptyRow message="No children yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {active > 0 && (
            <div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: PURPLE[700], marginBottom: "5px", display: "block" }}>{active} Active</span>
              {childList.filter((c) => c.status === "active").map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: AVATAR_COLORS[childList.indexOf(c) % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9px", fontWeight: 700, flexShrink: 0 }}>{ini(c.name)}</div>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{cap(c.name)}</span>
                </div>
              ))}
            </div>
          )}
          {trial > 0 && (
            <div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: PURPLE[400], marginBottom: "5px", display: "block" }}>{trial} Free</span>
              {childList.filter((c) => c.status === "trial").map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: AVATAR_COLORS[childList.indexOf(c) % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9px", fontWeight: 700, flexShrink: 0 }}>{ini(c.name)}</div>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{cap(c.name)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function QuizzesCard({ childList }) {
  const total = childList.reduce((s, c) => s + (c.quizzes || 0), 0);
  const maxQ  = Math.max(...childList.map((c) => c.quizzes || 0), 1);
  return (
    <Card>
      <CardTop
        label="Quizzes" subLabel="Total completed" bigNum={total}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
      />
      {childList.length === 0 ? <EmptyRow message="No quiz data" /> : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          {childList.map((child) => (
            <div key={child.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", width: "68px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
              <div style={{ flex: 1, height: "7px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "4px", width: (child.quizzes || 0) > 0 ? `${((child.quizzes || 0) / maxQ) * 100}%` : "0%", background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})`, transition: "width 0.6s ease" }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: (child.quizzes || 0) > 0 ? "#111827" : "#D1D5DB", width: "20px", textAlign: "right", flexShrink: 0 }}>{child.quizzes || 0}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ScoresCard({ childList }) {
  const scored = childList.filter((c) => c.score !== null && c.score !== undefined);
  const avg    = scored.length ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : 0;
  const leader = [...scored].sort((a, b) => b.score - a.score)[0];
  return (
    <Card>
      <CardTop
        label="Scores" subLabel="Per child breakdown"
        bigNum={scored.length ? `${avg}%` : "—"} bigNumPrefix={scored.length ? "AVG" : undefined}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
      />
      {childList.length === 0 ? <EmptyRow message="No score data" /> : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "11px" }}>
            {childList.map((child) => (
              <div key={child.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "#374151", flexShrink: 0, width: "58px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
                {child.score !== null && child.score !== undefined ? (
                  <>
                    <div style={{ flex: 1, height: "7px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: "4px", width: `${child.score}%`, background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})` }} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: PURPLE[700], width: "34px", textAlign: "right", flexShrink: 0 }}>{child.score}%</span>
                  </>
                ) : (
                  <span style={{ fontSize: "12px", color: "#9CA3AF" }}>No attempts</span>
                )}
              </div>
            ))}
          </div>
          {leader && (
            <div style={{ marginTop: "12px", background: PURPLE[50], borderRadius: "9px", padding: "7px 12px", display: "flex", alignItems: "center", gap: "6px", border: `1px solid ${PURPLE[200]}` }}>
              <span>⭐</span>
              <span style={{ fontSize: "12px", color: PURPLE[700], fontWeight: 600 }}>{leader.name} leading at {leader.score}%</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function LastActiveCard({ childList }) {
  const todayCount = childList.filter((c) => c.lastActiveDays === 0).length;
  return (
    <Card>
      <CardTop
        label="Last Active" subLabel={`${todayCount} active today`}
        bigNum={todayCount} bigNumSub={childList.length ? `/${childList.length}` : undefined}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
      />
      {childList.length === 0 ? <EmptyRow message="No activity yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {childList.map((child) => (
            <div key={child.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", color: "#374151" }}>{child.name}</span>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px",
                background: child.lastActiveDays === 0 ? PURPLE[100] : "#F3F4F6",
                color:      child.lastActiveDays === 0 ? PURPLE[700] : "#6B7280",
                border:     `1px solid ${child.lastActiveDays === 0 ? PURPLE[200] : "#E5E7EB"}`,
              }}>
                {lastActiveLabel(child.lastActiveDays)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── KebabMenu ──────────────────────────────────────────────────
function KebabMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: open ? PURPLE[100] : "transparent", border: "none", borderRadius: "6px", cursor: "pointer", padding: "4px 6px", display: "flex", alignItems: "center", color: "#9CA3AF", transition: "background 0.15s" }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#F3F4F6"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.13)", zIndex: 200, minWidth: "136px", overflow: "hidden" }}>
          <button onClick={() => { onEdit?.(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <div style={{ height: "1px", background: "#F3F4F6", margin: "0 10px" }} />
          <button onClick={() => { onDelete?.(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#EF4444", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF1F1")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ChildCard ──────────────────────────────────────────────────
function ChildCard({ child, colorIndex, onEdit, onDelete, onViewResults, onFreeSample, onBuyBundle }) {
  const color    = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const isActive = child.status === "active";
  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", padding: "20px 22px", display: "flex", flexDirection: "column", flex: "1 1 280px", minWidth: "280px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px", fontWeight: 700, flexShrink: 0 }}>{ini(child.name)}</div>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{cap(child.name)}</div>
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "3px" }}>{child.yearLevel || "—"} · @{child.username || child.name.toLowerCase()}</div>
          </div>
        </div>
        <KebabMenu onEdit={() => onEdit?.(child)} onDelete={() => onDelete?.(child.id)} />
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{
          fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px",
          background: isActive ? PURPLE[100] : "#FFF7ED",
          color:      isActive ? PURPLE[700] : "#D97706",
          border:     `1px solid ${isActive ? PURPLE[200] : "#FDE68A"}`,
          flexShrink: 0,
        }}>{isActive ? "Active" : "Free"}</span>
        {isActive
          ? <span style={{ fontSize: "13px", color: "#6B7280" }}>Bundle purchased ✓</span>
          : <span style={{ fontSize: "13px", color: PURPLE[600], fontWeight: 600, cursor: "pointer" }} onClick={() => onBuyBundle?.(child)}>Upgrade to Full Access →</span>
        }
      </div>

      {/* Performance bar */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "13px", color: "#6B7280" }}>Performance</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>{child.score !== null && child.score !== undefined ? `${child.score}%` : "0%"}</span>
        </div>
        <div style={{ height: "7px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "4px", width: `${child.score || 0}%`, background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})`, transition: "width 0.6s ease" }} />
        </div>
      </div>

      {/* Meta */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "4px" }}>Quizzes: {child.quizzes || 0}</div>
        <div style={{ fontSize: "13px", color: "#6B7280" }}>Last Activity: {lastActiveLabel(child.lastActiveDays)}</div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
        {isActive ? (
          <>
            {/* PRIMARY: Child's Dashboard */}
            <button
            title ={`${cap(child.name)}'s Dashboard`}
              onClick={() => onViewResults?.(child)}
              style={{
                flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: "9px",
                background: "linear-gradient(135deg, #059669, #0D9488)",
                border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700,
                color: "#fff", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "6px", overflow: "hidden",
                boxShadow: "0 2px 8px rgba(5,150,105,0.35)",
                transition: "opacity 0.15s, transform 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1";    e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="3"  y="3"  width="7" height="7" rx="1.5"/>
                <rect x="14" y="3"  width="7" height="7" rx="1.5"/>
                <rect x="3"  y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(() => { const first = cap(child.name).split(" ")[0]; return (first.length > 10 ? first.slice(0, 9) + "…" : first) + "'s Dashboard"; })()}
              </span>
            </button>

            {/* SECONDARY: Buy Bundle */}
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{ flex: 1, padding: "10px 0", borderRadius: "9px", background: "#fff", border: `1.5px solid ${PURPLE[200]}`, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: PURPLE[700], transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = PURPLE[50]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              🛒 Buy Bundle
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onFreeSample?.(child)}
              style={{ flex: 1, padding: "10px 0", borderRadius: "9px", background: "#fff", border: `1.5px solid ${PURPLE[200]}`, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: PURPLE[700], transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = PURPLE[50]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              Free Sample Test
            </button>
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{ flex: 1, padding: "10px 0", borderRadius: "9px", background: `linear-gradient(135deg,${PURPLE[600]},${PURPLE[700]})`, border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#fff", transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              🛒 Buy Bundle
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ChildManagementSection ─────────────────────────────────────
function ChildManagementSection({ childList, onEdit, onDelete, onAddChild, onViewResults, onFreeSample, onBuyBundle }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>Manage Children</h2>
        <button
          onClick={onAddChild}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "9px", background: PURPLE[600], border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#fff", boxShadow: `0 1px 4px rgba(124,58,237,0.3)`, transition: "opacity 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Child
        </button>
      </div>
      {childList.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "14px", border: "1.5px dashed #E5E7EB", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>👶</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>No children yet</div>
          <div style={{ fontSize: "13px", color: "#9CA3AF", marginBottom: "20px" }}>Add your first child profile to get started</div>
          <button onClick={onAddChild} style={{ padding: "10px 24px", borderRadius: "9px", background: PURPLE[600], border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#fff" }}>Add Child</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
          {childList.map((child, i) => (
            <ChildCard key={child.id} child={child} colorIndex={i} onEdit={onEdit} onDelete={onDelete} onViewResults={onViewResults} onFreeSample={onFreeSample} onBuyBundle={onBuyBundle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PaymentHistory ─────────────────────────────────────────────
const STATUS_STYLE = {
  Paid:     { bg: "#ECFDF5",    color: "#059669", border: "#A7F3D0" },
  Free:     { bg: PURPLE[50],   color: PURPLE[700], border: PURPLE[200] },
  Refunded: { bg: "#F8FAFC",    color: "#64748B", border: "#E2E8F0" },
  Pending:  { bg: "#FFF7ED",    color: "#D97706", border: "#FDE68A" },
  Failed:   { bg: "#FFF1F2",    color: "#EF4444", border: "#FECACA" },
};

function RetryConfirmModal({ payment, onConfirm, onCancel, loading, error }) {
  return (
    <ModalOverlay onClose={onCancel} maxWidth="400px">
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>Retry Payment?</h3>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 4px", lineHeight: 1.6 }}><strong>{payment.description}</strong></p>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 20px" }}>{payment.amount} · Status: <span style={{ fontWeight: 600, color: payment.status === "Failed" ? "#EF4444" : "#D97706" }}>{payment.status}</span></p>
        <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "0 0 24px" }}>You'll be redirected to Stripe to complete the payment.</p>
        {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "13px", color: "#BE123C", marginBottom: "16px" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={onCancel} style={{ padding: "11px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#374151" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: "11px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, color: "#fff" }}>{loading ? "Redirecting…" : "Retry"}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PaymentHistory({ payments = [], parentToken }) {
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [activeStatus, setActiveStatus] = useState("All");
  const [collapsed,    setCollapsed]    = useState(false);
  const filterRef   = useRef(null);
  const [retryTarget,  setRetryTarget]  = useState(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError,   setRetryError]   = useState(null);

  useEffect(() => {
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const statuses = ["All", ...Array.from(new Set(payments.map((p) => p.status)))];
  const filtered  = payments.filter((p) => activeStatus === "All" || p.status === activeStatus);
  const hasFilter = activeStatus !== "All";

  const handleRetryConfirm = async () => {
    if (!retryTarget?._id || !parentToken) return;
    try {
      setRetryLoading(true); setRetryError(null);
      const result = await retryPayment(parentToken, retryTarget._id);
      if (result?.ok && result.checkout_url) { window.location.href = result.checkout_url; }
      else { setRetryError("Could not create checkout session. Please try again."); setRetryLoading(false); }
    } catch (err) { setRetryError(err?.message || "Something went wrong."); setRetryLoading(false); }
  };

  return (
    <>
      <div style={{ marginTop: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>Payment History</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <div ref={filterRef} style={{ position: "relative" }}>
              <button onClick={() => setFilterOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "8px", background: hasFilter ? PURPLE[50] : "#fff", border: `1px solid ${hasFilter ? PURPLE[200] : "#E5E7EB"}`, cursor: "pointer", fontSize: "12px", fontWeight: 600, color: hasFilter ? PURPLE[700] : "#6B7280" }}>
                Filter{hasFilter ? `: ${activeStatus}` : ""}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {filterOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100, minWidth: "130px", overflow: "hidden" }}>
                  {statuses.map((s) => (
                    <button key={s} onClick={() => { setActiveStatus(s); setFilterOpen(false); }} style={{ display: "block", width: "100%", padding: "9px 14px", background: activeStatus === s ? PURPLE[50] : "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setCollapsed((v) => !v)} style={{ padding: "7px 12px", borderRadius: "8px", background: "#fff", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "#6B7280" }}>{collapsed ? "Expand" : "Collapse"}</button>
          </div>
        </div>

        {!collapsed && (
          <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>{payments.length === 0 ? "No payment history yet" : "No payments match this filter"}</div>
            ) : filtered.map((p, idx) => {
              const st = STATUS_STYLE[p.status] || STATUS_STYLE.Paid;
              const isRetryable = p.status === "Pending" || p.status === "Failed";
              return (
                <div key={p._id || idx}
                  onClick={isRetryable ? () => setRetryTarget(p) : undefined}
                  style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px", borderBottom: idx < filtered.length - 1 ? "1px solid #F3F4F6" : "none", cursor: isRetryable ? "pointer" : "default", transition: "background 0.12s" }}
                  onMouseEnter={(e) => { if (isRetryable) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={(e) => { if (isRetryable) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: p.isDeletedChild ? "#B91C1C" : "#374151" }}>{p.description}</span>
                    {p.isDeletedChild ? <span style={{ fontSize: "11px", color: "#EF4444", display: "block", marginTop: "2px", fontWeight: 600 }}>⚠ Child account deleted</span>
                      : p.child && p.child !== "—" ? <span style={{ fontSize: "11px", color: "#9CA3AF", display: "block", marginTop: "1px" }}>{p.child}</span> : null}
                  </div>
                  <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{p.date}</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{p.amount}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 11px", borderRadius: "20px", background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{p.status}</span>
                </div>
              );
            })}
          </div>
        )}

        {collapsed && (
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #E5E7EB", padding: "12px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ fontSize: "13px", color: "#6B7280" }}>{payments.length} total transaction{payments.length !== 1 ? "s" : ""}</span>
            {["Paid", "Pending", "Failed", "Refunded", "Free"].map((s) => {
              const count = payments.filter((p) => p.status === s).length;
              if (!count) return null;
              const st = STATUS_STYLE[s] || STATUS_STYLE.Paid;
              return <span key={s} style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{count} {s}</span>;
            })}
          </div>
        )}
      </div>
      {retryTarget && <RetryConfirmModal payment={retryTarget} loading={retryLoading} error={retryError} onConfirm={handleRetryConfirm} onCancel={() => { setRetryTarget(null); setRetryError(null); setRetryLoading(false); }} />}
    </>
  );
}

// ─── Loading Overlay ────────────────────────────────────────────
function LoadingOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: `3px solid ${PURPLE[100]}`, borderTopColor: PURPLE[600], animation: "spin 0.7s linear infinite" }} />
        <span style={{ fontSize: "13px", color: PURPLE[600], fontWeight: 600 }}>Loading…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── UserMenu ────────────────────────────────────────────────────
function UserMenu({ user, onLogout, onAddChild, onChildLogin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "9px", background: open ? PURPLE[50] : "#fff", border: `1px solid ${open ? PURPLE[200] : "#E5E7EB"}`, cursor: "pointer", transition: "background 0.15s" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: `linear-gradient(135deg,${PURPLE[600]},${PURPLE[700]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "12px", fontWeight: 700 }}>{user.initials}</div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>{user.name || "Parent"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "200px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden" }}>
          {[
            { label: "Add Child",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, action: () => { setOpen(false); onAddChild?.(); } },
            { label: "Child Login",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>, action: () => { setOpen(false); onChildLogin?.(); } },
          ].map(({ label, icon, action }) => (
            <button key={label} onClick={action}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >{icon}{label}</button>
          ))}
          <div style={{ height: "1px", background: "#F3F4F6", margin: "0 10px" }} />
          <button onClick={() => { setOpen(false); onLogout?.(); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#EF4444", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF1F1")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MODAL COMPONENTS
// ═══════════════════════════════════════════════════════════════
function ModalOverlay({ onClose, children, maxWidth = "480px" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", width: "100%", maxWidth, padding: "28px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const INPUT_STYLE = { width: "100%", boxSizing: "border-box", border: "1px solid #D1D5DB", borderRadius: "9px", padding: "9px 12px", fontSize: "14px", color: "#111827", outline: "none", background: "#fff" };
const LABEL_STYLE = { display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "5px" };
const YEAR_OPTIONS = [3, 4, 5, 6, 7, 8, 9];

function CheckboxRow({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ marginTop: "2px", flexShrink: 0, width: "15px", height: "15px", accentColor: PURPLE[600], cursor: "pointer" }} />
      <span style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

// ── AddChildModal ──────────────────────────────────────────────
function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName,       setDisplayName]       = useState("");
  const [username,          setUsername]           = useState("");
  const [yearLevel,         setYearLevel]          = useState("");
  const [pin,               setPin]               = useState("");
  const [confirmPin,        setConfirmPin]         = useState("");
  const [error,             setError]             = useState("");
  const [usernameStatus,    setUsernameStatus]    = useState(null);
  const [consent,           setConsent]           = useState(false);
  const [emailNotifications,setEmailNotifications]= useState(false);
  const [showConsentPolicy, setShowConsentPolicy] = useState(false);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) { setUsernameStatus(null); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      try { const r = await checkUsername(u); setUsernameStatus(r?.available ? "available" : "taken"); }
      catch { setUsernameStatus(null); }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (!displayName.trim())            return setError("Display name is required");
    if (username.trim().length < 3)     return setError("Username must be at least 3 characters");
    if (usernameStatus === "taken")     return setError("Username is already taken");
    if (!yearLevel)                     return setError("Please select a year level");
    if (!pin || !/^\d{6}$/.test(pin))  return setError("PIN must be exactly 6 digits");
    if (pin !== confirmPin)             return setError("PINs do not match");
    if (!consent)                       return setError("Please agree to the Child Data Collection Policy");
    try { await onAdd({ display_name: displayName.trim(), username: username.trim().toLowerCase(), year_level: Number(yearLevel), pin, email_notifications: emailNotifications, parental_consent: consent }); }
    catch (err) { setError(err?.message || "Failed to add child"); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>Add Child</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9CA3AF" }}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div>
            <label style={LABEL_STYLE}>Display Name</label>
            <input style={INPUT_STYLE} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Aarav" />
          </div>

          <div>
            <label style={LABEL_STYLE}>Username</label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...INPUT_STYLE, borderColor: usernameStatus === "taken" ? "#EF4444" : usernameStatus === "available" ? "#10B981" : "#D1D5DB", paddingRight: "90px" }}
                value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="e.g. aarav_k"
              />
              {usernameStatus && (
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", fontWeight: 700, color: usernameStatus === "checking" ? "#9CA3AF" : usernameStatus === "available" ? "#059669" : "#EF4444" }}>
                  {usernameStatus === "checking" ? "checking…" : usernameStatus === "available" ? "✓ available" : "✗ taken"}
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Year Level</label>
              <select style={{ ...INPUT_STYLE, appearance: "auto" }} value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
                <option value="">Select year level</option>
                <option value="3">Year 3</option>
                <option value="5" disabled>Year 5 — Coming Soon</option>
                <option value="7" disabled>Year 7 — Coming Soon</option>
                <option value="9" disabled>Year 9 — Coming Soon</option>
              </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>PIN (6 digits)</label>
              <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            </div>
            <div>
              <label style={LABEL_STYLE}>Confirm PIN</label>
              <input style={{ ...INPUT_STYLE, borderColor: confirmPin && pin !== confirmPin ? "#EF4444" : "#D1D5DB" }} type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            </div>
          </div>

          {/* ── Two checkboxes side-by-side, equal height ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "stretch" }}>

            {/* Email Notifications */}
            <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "flex-start" }}>
              <CheckboxRow checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)}>
                Send me email updates about this child's progress
              </CheckboxRow>
            </div>

            {/* Consent */}
            <div style={{ background: "#FFF7ED", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "flex-start" }}>
              <CheckboxRow checked={consent} onChange={(e) => setConsent(e.target.checked)}>
                I agree to the{" "}
                <span onClick={(e) => { e.preventDefault(); setShowConsentPolicy(true); }} style={{ color: PURPLE[600], textDecoration: "underline", cursor: "pointer", fontWeight: 600 }}>
                  Child Data Policy
                </span>
                {" "}<span style={{ color: "#EF4444", fontWeight: 700 }}>*</span>
              </CheckboxRow>
            </div>
          </div>

          {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "13px", color: "#BE123C", fontWeight: 600 }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button type="button" onClick={onClose} style={{ padding: "12px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#374151" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: "12px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, color: "#fff" }}>{loading ? "Adding…" : "Add Child"}</button>
          </div>
        </div>
      </form>

      {showConsentPolicy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: "20px" }} onClick={() => setShowConsentPolicy(false)}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "720px", maxHeight: "85vh", borderRadius: "16px", boxShadow: "0 25px 70px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #F3F4F6" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 }}>Child Data Collection Policy</h2>
              <button onClick={() => setShowConsentPolicy(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9CA3AF" }}>✕</button>
            </div>
            <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}><ChildDataConsentPolicy /></div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setConsent(true); setShowConsentPolicy(false); }} style={{ padding: "8px 20px", background: PURPLE[600], color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>I Agree</button>
            </div>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}

// ── EditChildModal — email notifications only, NO consent ───────
function EditChildModal({ child, onClose, onSave, loading }) {
  const [displayName,        setDisplayName]        = useState(child.display_name || child.name || "");
  const [yearLevel,          setYearLevel]          = useState(String(child.year_level || ""));
  const [pin,                setPin]               = useState("");
  const [confirmPin,         setConfirmPin]         = useState("");
  const [changePin,          setChangePin]          = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(child.email_notifications ?? false);
  const [error,              setError]             = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    const cleanName = displayName.trim();
    if (!cleanName) return setError("Display name cannot be empty");
    if (!yearLevel) return setError("Please select a year level");
    const updates = {};
    if (cleanName !== (child.display_name || child.name || "")) updates.display_name = cleanName;
    if (Number(yearLevel) !== Number(child.year_level || 0))    updates.year_level   = Number(yearLevel);
    if (changePin) {
      if (!pin || !/^\d{6}$/.test(pin)) return setError("PIN must be exactly 6 digits");
      if (pin !== confirmPin)           return setError("PINs do not match");
      updates.pin = pin;
    }
    if (emailNotifications !== (child.email_notifications ?? false)) updates.email_notifications = emailNotifications;
    if (Object.keys(updates).length === 0) return setError("No changes to save");
    await onSave(child._id, updates);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>Edit Child</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9CA3AF" }}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div>
            <label style={LABEL_STYLE}>Display Name</label>
            <input style={INPUT_STYLE} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Aarav" />
          </div>

          <div>
            <label style={LABEL_STYLE}>Username (read-only)</label>
            <input style={{ ...INPUT_STYLE, background: "#F9FAFB", color: "#9CA3AF" }} value={child.username || ""} readOnly />
          </div>

          <div>
            <label style={LABEL_STYLE}>Year Level</label>
            <select style={{ ...INPUT_STYLE, appearance: "auto" }} value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
              <option value="">Select year level</option>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>

          {/* Change PIN toggle */}
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "12px 14px" }}>
            <CheckboxRow checked={changePin} onChange={(e) => setChangePin(e.target.checked)}>
              <span style={{ fontWeight: 600 }}>Change PIN</span>
            </CheckboxRow>
            {changePin && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                <div>
                  <label style={LABEL_STYLE}>New PIN (6 digits)</label>
                  <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Confirm PIN</label>
                  <input style={{ ...INPUT_STYLE, borderColor: confirmPin && pin !== confirmPin ? "#EF4444" : "#D1D5DB" }} type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
                </div>
              </div>
            )}
          </div>

          {/* Email Notifications only — consent checkbox intentionally omitted */}
          <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "10px", padding: "12px 14px" }}>
            <CheckboxRow checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)}>
              Send me email notifications about this child's progress
            </CheckboxRow>
          </div>

          {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "13px", color: "#BE123C", fontWeight: 600 }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button type="button" onClick={onClose} style={{ padding: "12px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#374151" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: "12px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, color: "#fff" }}>{loading ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── DeleteConfirmModal ──────────────────────────────────────────
function DeleteConfirmModal({ child, onCancel, onConfirm, loading }) {
  return (
    <ModalOverlay onClose={onCancel} maxWidth="400px">
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Delete {child.name || "this child"}?</h3>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 24px", lineHeight: 1.6 }}>This will permanently delete <strong>{child.name}</strong>'s profile and all quiz history. This action cannot be undone.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={onCancel} style={{ padding: "11px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#374151" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: "11px", borderRadius: "9px", background: loading ? "#FCA5A5" : "#EF4444", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, color: "#fff" }}>{loading ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── BundleSelectionModal ────────────────────────────────────────
function BundleSelectionModal({ child, bundles, loadingBundleId, onSelect, onClose, onExploreBundles }) {
  const childName  = child.name || child.display_name || "your child";
  const yearLabel  = child.yearLevel || `Year ${child.year_level}`;

  return (
    <ModalOverlay onClose={onClose} maxWidth="860px">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 3px" }}>Choose a Bundle</h3>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>For {childName} · {yearLabel}</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9CA3AF" }}>✕</button>
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>

        {/* ── LEFT: Suggested bundles ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Suggested label */}
          <div style={{
            display: "flex", alignItems: "center", gap: "7px",
            marginBottom: "14px",
          }}>
            <span style={{
              fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color: PURPLE[600],
              background: PURPLE[50], border: `1px solid ${PURPLE[200]}`,
              padding: "3px 10px", borderRadius: "99px",
            }}>
              ✨ Suggested for {childName}
            </span>
          </div>

          {bundles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9CA3AF", fontSize: "14px" }}>
              No bundles available for {yearLabel}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {bundles.map((bundle) => {
                const isLoading    = loadingBundleId === bundle.bundle_id;
                const alreadyOwned = (child.entitled_bundle_ids || []).includes(bundle.bundle_id);
                const price = `$${(Number(bundle.price_cents || 0) / 100).toFixed(2)} ${(bundle.currency || "AUD").toUpperCase()}`;

                return (
                  <div
                    key={bundle.bundle_id}
                    style={{
                      border: `1px solid ${alreadyOwned ? "#E5E7EB" : PURPLE[200]}`,
                      borderRadius: "12px", padding: "16px 18px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: "12px", background: alreadyOwned ? "#F9FAFB" : PURPLE[50],
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: alreadyOwned ? "#9CA3AF" : "#111827", marginBottom: "3px" }}>
                        {bundle.bundle_name}
                      </div>
                      {bundle.description && (
                        <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px" }}>
                          {bundle.description}
                        </div>
                      )}
                      <div style={{ fontSize: "15px", fontWeight: 800, color: alreadyOwned ? "#9CA3AF" : PURPLE[700] }}>
                        {price}
                      </div>
                    </div>

                    {alreadyOwned ? (
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#9CA3AF", background: "#F3F4F6", padding: "6px 14px", borderRadius: "8px" }}>
                        Owned
                      </span>
                    ) : (
                      <button
                        onClick={() => onSelect(bundle)}
                        disabled={isLoading}
                        style={{
                          padding: "9px 18px", borderRadius: "9px",
                          background: isLoading ? PURPLE[400] : PURPLE[600],
                          border: "none", cursor: isLoading ? "not-allowed" : "pointer",
                          fontSize: "13px", fontWeight: 600, color: "#fff", flexShrink: 0,
                        }}
                      >
                        {isLoading ? "Loading…" : "Buy"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ width: "1px", alignSelf: "stretch", background: "#E5E7EB", flexShrink: 0 }} />

        {/* ── RIGHT: Explore more bundles ── */}
        <div style={{ width: "220px", flexShrink: 0 }}>
          <div style={{
            background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
            border: `1px solid ${PURPLE[200]}`,
            borderRadius: "16px",
            padding: "22px 18px",
            display: "flex", flexDirection: "column", gap: "14px",
          }}>
            {/* Icon */}
            <div style={{
              width: "44px", height: "44px", borderRadius: "12px",
              background: PURPLE[600], display: "flex", alignItems: "center",
              justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            <div>
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
                Explore more bundles
              </p>
              <p style={{ fontSize: "12px", color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                Browse the full NAPLAN Mock Exam catalogue — all year levels, topics &amp; difficulty tiers.
              </p>
            </div>

            <button
              onClick={onExploreBundles}
              style={{
                width: "100%", padding: "10px 0", borderRadius: "9px",
                background: PURPLE[600], border: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: 600, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              View all bundles
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>

      </div>
    </ModalOverlay>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function ParentDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { parentToken, parentProfile, logout } = useAuth();

  const [rawChildren,           setRawChildren]           = useState([]);
  const [rawPayments,           setRawPayments]           = useState([]);
  const [loading,               setLoading]               = useState(true);
  const [error,                 setError]                 = useState(null);
  const [isAddModalOpen,        setIsAddModalOpen]        = useState(false);
  const [editTarget,            setEditTarget]            = useState(null);
  const [deleteTarget,          setDeleteTarget]          = useState(null);
  const [bundleModalChild,      setBundleModalChild]      = useState(null);
  const [actionLoading,         setActionLoading]         = useState(false);
  const [checkoutLoadingBundle, setCheckoutLoadingBundle] = useState(null);
  const [successSessionId,      setSuccessSessionId]      = useState(null);
  const [isChildLoginModalOpen, setIsChildLoginModalOpen] = useState(false);
  const [showOnboarding,        setShowOnboarding]        = useState(() => searchParams.get("onboarding") === "free-trial");

  const children = useMemo(() => rawChildren.map(mapChild), [rawChildren]);
  const payments  = useMemo(() => rawPayments.map(mapPayment), [rawPayments]);
  const user = useMemo(() => {
    const name     = parentProfile?.name || parentProfile?.email || "";
    const initials = name ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "??";
    return { name, initials };
  }, [parentProfile]);

const loadChildren = useCallback(async () => {
  if (!parentToken) return;
  try {
    setLoading(true);
    const summaries = await fetchChildrenSummaries(parentToken);
    const childList = Array.isArray(summaries) ? summaries : [];

    const enriched = await Promise.all(
      childList.map(async (child) => {
        try {
        const [results, writing, catalogData] = await Promise.all([
          fetchChildResults(parentToken, child._id).catch(() => []),
          fetchChildWriting(parentToken, child._id).catch(() => []),
          fetchAvailableQuizzes(parentToken, child._id).catch(() => ({ quizzes: [] })),
        ]);

        // ✅ Catalog size = same number child sees in their "All" tab
        const catalog = Array.isArray(catalogData)
          ? catalogData
          : (catalogData?.quizzes || []);
        const quizCount = catalog.length;

        const seen = new Set();
        const allAttempts = [
          ...(Array.isArray(results) ? results : []),
          ...(Array.isArray(writing) ? writing : []),
        ].filter((r) => {
          const key = String(r.response_id || r.attempt_id || r._id || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const scores = allAttempts
          .map((r) => {
            const overall = r?.ai?.feedback?.overall;
            if (overall?.max_score > 0) {
              return (overall.total_score / overall.max_score) * 100;
            }
            return r?.score?.percentage ?? null;
          })
          .filter((s) => s !== null && s >= 0);

        const dates = allAttempts
          .map((r) => r.date_submitted || r.submitted_at || r.createdAt)
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a));

        return {
          ...child,
          quizCount,                          // ← catalog size, matches child's All tab
          averageScore: scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null,
          lastActivity: dates[0] || child.lastActivity || null,
        };

        } catch {
          return child;
        }
      })
    );

    setRawChildren(enriched);
    setError(null);
  } catch (err) {
    setError(err?.message || "Failed to load children");
  } finally {
    setLoading(false);
  }
}, [parentToken]);




  const loadPayments = useCallback(async () => {
    if (!parentToken) return;
    try { const data = await fetchPurchaseHistory(parentToken); setRawPayments(Array.isArray(data) ? data : []); }
    catch (err) { console.error("Failed to load payments:", err); }
  }, [parentToken]);

  useEffect(() => { 
    if (!parentToken) return;
    loadChildren(); loadPayments();
   }, [loadChildren, loadPayments]);

  useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      loadChildren();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}, [loadChildren]);


  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;

    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    next.delete("session_id");
    setSearchParams(next, { replace: true });

    if (payment === "success") {
      const sid = searchParams.get("session_id");
      if (!sid) {
        loadChildren();
        loadPayments();
        return;
      }
      setSuccessSessionId(sid);
      loadChildren();
      loadPayments();
    }
  }, [searchParams, setSearchParams, loadChildren, loadPayments]);


  const handleAddChild = async (formData) => {
    try { setActionLoading(true); await createChild(parentToken, formData); setIsAddModalOpen(false); await loadChildren(); }
    catch (err) { alert(err?.message || "Failed to add child"); }
    finally { setActionLoading(false); }
  };

  const handleEditChild = async (childId, updates) => {
    try { setActionLoading(true); await updateChild(parentToken, childId, updates); setEditTarget(null); await loadChildren(); }
    catch (err) { alert(err?.message || "Failed to update child"); }
    finally { setActionLoading(false); }
  };

  const handleDeleteChild = async () => {
    if (!deleteTarget) return;
    try { setActionLoading(true); await deleteChild(parentToken, deleteTarget._id); setRawChildren((prev) => prev.filter((c) => c._id !== deleteTarget._id)); setDeleteTarget(null); }
    catch (err) { alert(err?.message || "Failed to delete child"); }
    finally { setActionLoading(false); }
  };

  const handleCheckout = async (child, bundle) => {
    try {
      setCheckoutLoadingBundle(bundle.bundle_id);
      const result = await createCheckout(parentToken, { bundle_id: bundle.bundle_id, child_ids: [child._id] });
      if (!result?.checkout_url) throw new Error("No checkout URL returned");
      window.location.href = result.checkout_url;
    } catch (err) {
      if (err.code === "DUPLICATE_PURCHASE") { alert(`${err.child_name || child.name} already has the "${err.bundle_name || bundle.bundle_name}" bundle.`); setBundleModalChild(null); }
      else { alert(err?.message || "Checkout failed. Please try again."); }
    } finally { setCheckoutLoadingBundle(null); }
  };


  const handleViewChild = (child) => {
  navigate("/child-dashboard", {
    state: {
      childId: child._id || child.id,
      childName: child.display_name || child.name || "",
      yearLevel: child.year_level || "",
      username: child.username || "",
    }
  })
};

  const handleDeleteRequest = (childId) => { const raw = rawChildren.find((c) => String(c._id) === String(childId)); if (raw) setDeleteTarget(raw); };

  // ── Fix: summaries endpoint omits email_notifications, so fetch full child record before opening edit modal ──
  const handleEditRequest = async (mc) => {
    const childId = mc._id || mc.id;
    try {
      // Fetch full child record which includes email_notifications
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${API_BASE}/api/children/${childId}`, {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${parentToken}`,
        Accept: "application/json",
      },
        });
      if (res.ok) {
        const full = await res.json();
        setEditTarget(full);
      } else {
        // Fallback to summaries data if full fetch fails
        const raw = rawChildren.find((c) => String(c._id) === String(childId));
        if (raw) setEditTarget(raw);
      }
    } catch {
      // Fallback to summaries data
      const raw = rawChildren.find((c) => String(c._id) === String(childId));
      if (raw) setEditTarget(raw);
    }
  };


  return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(to bottom, #EEF2FF, #ffffff)", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {loading && <LoadingOverlay />}

      <DashboardHeader>
        <UserMenu user={user} onLogout={logout} onAddChild={() => setIsAddModalOpen(true)} onChildLogin={() => setIsChildLoginModalOpen(true)} />
      </DashboardHeader>

      <main style={{ padding: "36px 48px", maxWidth: "1400px", margin: "0 auto" }}>
        {error && (
          <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "10px", padding: "12px 16px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", color: "#BE123C", fontWeight: 600 }}>{error}</span>
            <button onClick={loadChildren} style={{ background: "#BE123C", color: "#fff", border: "none", borderRadius: "7px", padding: "5px 12px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Retry</button>
          </div>
        )}

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#111827", margin: 0 }}>Parent Dashboard</h1>
            <p style={{ fontSize: "13px", color: "#6B7280", margin: "5px 0 0" }}>
              Welcome back, <strong style={{ color: PURPLE[600] }}>{user.name || "—"}</strong> — manage children and access bundles
            </p>
          </div>
        </div>

        {/* Stat cards — all purple */}
        <div style={{ display: "flex", gap: "20px", alignItems: "stretch", marginBottom: "40px" }}>
          <ChildrenCard   childList={children} />
          <QuizzesCard    childList={children} />
          <ScoresCard     childList={children} />
          <LastActiveCard childList={children} />
        </div>

        <ChildManagementSection
          childList={children}
          onEdit={handleEditRequest}
          onDelete={handleDeleteRequest}
          onAddChild={() => setIsAddModalOpen(true)}
          onViewResults={handleViewChild}
          onFreeSample={handleViewChild}
          onBuyBundle={(child) => setBundleModalChild(child)}
        />

        <PaymentHistory payments={payments} parentToken={parentToken} />
      </main>

      {/* MODALS */}
      {isAddModalOpen && <AddChildModal onClose={() => setIsAddModalOpen(false)} onAdd={handleAddChild} loading={actionLoading} />}
      {editTarget     && <EditChildModal child={editTarget} onClose={() => setEditTarget(null)} onSave={handleEditChild} loading={actionLoading} />}
      {deleteTarget   && <DeleteConfirmModal child={{ name: deleteTarget.display_name || deleteTarget.username }} onCancel={() => setDeleteTarget(null)} onConfirm={handleDeleteChild} loading={actionLoading} />}

      {bundleModalChild && (
        <BundleSelectionModal
          child={bundleModalChild}
          bundles={BUNDLE_CATALOG.filter(
            (b) =>
              Number(b.year_level) ===
                Number(bundleModalChild.year_level || bundleModalChild.yearLevel?.replace("Year ", "")) &&
              b.is_active
          )}
          loadingBundleId={checkoutLoadingBundle}
          onSelect={(bundle) => handleCheckout(bundleModalChild, bundle)}
          onClose={() => setBundleModalChild(null)}
          onExploreBundles={() => {
            setBundleModalChild(null);               // close the modal first
            const yr = bundleModalChild.year_level
              || bundleModalChild.yearLevel?.replace("Year ", "");
            const cid = bundleModalChild._id || bundleModalChild.id || "";
            navigate(`/bundles?year=${yr}&childId=${encodeURIComponent(cid)}`);
          }}
        />
      )}

      {successSessionId && (
        <PaymentSuccessModal sessionId={successSessionId} parentToken={parentToken}
          onClose={() => { setSuccessSessionId(null); loadChildren(); loadPayments(); }} />
      )}

      <QuickChildLoginModal isOpen={isChildLoginModalOpen} onClose={() => setIsChildLoginModalOpen(false)} childrenList={rawChildren} />

      {showOnboarding && (
        <FreeTrialOnboarding parentToken={parentToken}
          onComplete={() => { loadChildren(); setShowOnboarding(false); const n = new URLSearchParams(searchParams); n.delete("onboarding"); setSearchParams(n, { replace: true }); }}
          onSkip={()    => { setShowOnboarding(false);                  const n = new URLSearchParams(searchParams); n.delete("onboarding"); setSearchParams(n, { replace: true }); }} />
      )}
    </div>
  );
}
