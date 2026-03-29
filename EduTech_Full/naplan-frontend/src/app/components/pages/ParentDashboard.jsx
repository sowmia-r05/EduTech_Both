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
  "#F43F5E",
  "#F97316",
  "#EAB308",
  "#10B981",
  "#06B6D4",
  "#6366F1",
  "#EC4899",
  "#14B8A6",
];

// ═══════════════════════════════════════════════════════════════
//  RESPONSIVE CSS — injected once, covers all media queries
// ═══════════════════════════════════════════════════════════════
const RESPONSIVE_CSS = `
  .pd-root {
    min-height: 100vh;
    background: linear-gradient(to bottom, #EEF2FF, #ffffff);
    font-family: 'DM Sans','Segoe UI',sans-serif;
  }
  .pd-main {
    padding: 24px 16px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .pd-stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 32px;
  }
  .pd-child-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .pd-header-row {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 28px;
  }
  .pd-header-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pd-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }
  .pd-payment-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid #F3F4F6;
    cursor: default;
  }
  .pd-payment-row-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .pd-bundle-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  @media (min-width: 640px) {
    .pd-main {
      padding: 32px 32px;
    }
    .pd-header-row {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 32px;
    }
    .pd-child-grid {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }
    .pd-payment-row {
      flex-direction: row;
      align-items: center;
      gap: 16px;
    }
  }
  @media (min-width: 900px) {
    .pd-main {
      padding: 36px 48px;
    }
    .pd-stat-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .pd-bundle-body {
      flex-direction: row;
    }
  }
  @keyframes pd-spin { to { transform: rotate(360deg); } }
`;

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
    id:                  c._id,
    name:                c.display_name || c.username || "Unknown",
    yearLevel:           c.year_level ? `Year ${c.year_level}` : "—",
    username:            c.username || "",
    status:              c.status === "active" ? "active" : "trial",
    quizzes:             c.completedCount ?? c.quizCount ?? 0,
    score:               c.averageScore != null ? Math.round(c.averageScore) : null,
    lastActiveDays:      computeLastActiveDays(c.lastActivity),
    _id:                 c._id,
    display_name:        c.display_name,
    year_level:          c.year_level,
    email_notifications: c.email_notifications ?? false,
    entitled_bundle_ids: c.entitled_bundle_ids || [],
  };
}

function mapPayment(p) {
  const childName = p.child_name || (p.child_ids?.[0]?.display_name) || "Unknown child";
  return {
    _id:         p._id,
    description: p.description || p.bundle_name || "Bundle Purchase",
    amount:      formatAUD(p.amount_cents ?? p.price_cents),
    status:      p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "Pending",
    date:        p.created_at ? new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—",
    child:       childName,
    isDeletedChild: false,
  };
}

const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const ini = (name = "") => name.split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
const lastActiveLabel = (days) => {
  if (days === null || days === undefined) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

// ═══════════════════════════════════════════════════════════════
//  SHARED STAT CARD
// ═══════════════════════════════════════════════════════════════
function Card({ children }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "14px",
      border: `1px solid ${PURPLE[200]}`,
      borderTop: `3px solid ${PURPLE[600]}`,
      padding: "16px 18px",
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: PURPLE[100], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: PURPLE[600], letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subLabel}</div>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
        {bigNumPrefix && <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "1px" }}>{bigNumPrefix}</div>}
        <span style={{ fontSize: "30px", fontWeight: 900, color: "#111827", lineHeight: 1 }}>{bigNum}</span>
        {bigNumSub && <span style={{ fontSize: "13px", color: "#9CA3AF", marginLeft: "2px" }}>{bigNumSub}</span>}
      </div>
    </div>
  );
}

const EmptyRow = ({ message }) => (
  <div style={{ padding: "16px 0", textAlign: "center", color: "#D1D5DB", fontSize: "13px" }}>{message}</div>
);

// ─── 4 Stat Cards ───────────────────────────────────────────────

function ChildrenCard({ childList }) {
  const active = childList.filter((c) => c.status === "active").length;
  const trial  = childList.filter((c) => c.status === "trial").length;
  return (
    <Card>
      <CardTop
        label="Children" subLabel="Profiles set up" bigNum={childList.length}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
      />
      {childList.length === 0
        ? <EmptyRow message="No children yet" />
        : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {active > 0 && (
              <span style={{ fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", background: PURPLE[100], color: PURPLE[700], border: `1px solid ${PURPLE[200]}` }}>
                {active} full access
              </span>
            )}
            {trial > 0 && (
              <span style={{ fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", background: "#FFF7ED", color: "#D97706", border: "1px solid #FDE68A" }}>
                {trial} free trial
              </span>
            )}
          </div>
        )}
    </Card>
  );
}

function QuizzesCard({ childList }) {
  const maxQ = Math.max(...childList.map((c) => c.quizzes || 0), 1);
  return (
    <Card>
      <CardTop
        label="Quizzes" subLabel="Total completed" bigNum={childList.reduce((s, c) => s + (c.quizzes || 0), 0)}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
      />
      {childList.length === 0
        ? <EmptyRow message="No quiz activity yet" />
        : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
            {childList.map((child) => (
              <div key={child.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151", width: "60px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
                <div style={{ flex: 1, height: "6px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "4px", width: (child.quizzes || 0) > 0 ? `${((child.quizzes || 0) / maxQ) * 100}%` : "0%", background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})`, transition: "width 0.6s ease" }} />
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: (child.quizzes || 0) > 0 ? "#111827" : "#D1D5DB", width: "18px", textAlign: "right", flexShrink: 0 }}>{child.quizzes || 0}</span>
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
        label="Avg Score" subLabel="Across all children"
        bigNum={scored.length ? `${avg}%` : "—"} bigNumPrefix={scored.length ? "AVG" : undefined}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
      />
      {childList.length === 0
        ? <EmptyRow message="No score data yet" />
        : (
          <>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "9px" }}>
              {childList.map((child) => (
                <div key={child.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#374151", flexShrink: 0, width: "54px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
                  {child.score !== null && child.score !== undefined ? (
                    <>
                      <div style={{ flex: 1, height: "6px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: "4px", width: `${child.score}%`, background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})` }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: PURPLE[700], width: "32px", textAlign: "right", flexShrink: 0 }}>{child.score}%</span>
                    </>
                  ) : (
                    <span style={{ fontSize: "12px", color: "#9CA3AF" }}>No attempts</span>
                  )}
                </div>
              ))}
            </div>
            {leader && (
              <div style={{ marginTop: "10px", background: PURPLE[50], borderRadius: "9px", padding: "7px 12px", display: "flex", alignItems: "center", gap: "6px", border: `1px solid ${PURPLE[200]}` }}>
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
        label="Last Seen" subLabel={`${todayCount} active today`}
        bigNum={todayCount} bigNumSub={childList.length ? `/${childList.length}` : undefined}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
      />
      {childList.length === 0
        ? <EmptyRow message="No activity yet" />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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
        aria-label="More options"
        style={{ background: open ? PURPLE[100] : "transparent", border: "none", borderRadius: "8px", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center", color: "#9CA3AF", transition: "background 0.15s", minWidth: "36px", minHeight: "36px", justifyContent: "center" }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#F3F4F6"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.13)", zIndex: 200, minWidth: "136px", overflow: "hidden" }}>
          <button onClick={() => { onEdit?.(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#374151", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <div style={{ height: "1px", background: "#F3F4F6", margin: "0 10px" }} />
          <button onClick={() => { onDelete?.(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#EF4444", textAlign: "left" }}
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
    <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", padding: "20px", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
          <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px", fontWeight: 700, flexShrink: 0 }}>
            {ini(child.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{cap(child.name)}</div>
            <div style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "3px" }}>{child.yearLevel || "—"} · @{child.username || child.name.toLowerCase()}</div>
          </div>
        </div>
        <KebabMenu onEdit={() => onEdit?.(child)} onDelete={() => onDelete?.(child.id)} />
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{
          fontSize: "12px", fontWeight: 600, padding: "4px 12px", borderRadius: "20px",
          background: isActive ? PURPLE[100] : "#FFF7ED",
          color:      isActive ? PURPLE[700] : "#D97706",
          border:     `1px solid ${isActive ? PURPLE[200] : "#FDE68A"}`,
          flexShrink: 0,
        }}>{isActive ? "Full Access" : "Free Trial"}</span>
        {isActive
          ? <span style={{ fontSize: "13px", color: "#6B7280" }}>Full access unlocked ✓</span>
          : <span style={{ fontSize: "13px", color: PURPLE[600], fontWeight: 600, cursor: "pointer" }} onClick={() => onBuyBundle?.(child)}>Unlock full access →</span>
        }
      </div>

      {/* Performance bar */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "13px", color: "#6B7280" }}>Quiz Score</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>{child.score !== null && child.score !== undefined ? `${child.score}%` : "No quizzes yet"}</span>
        </div>
        <div style={{ height: "7px", background: PURPLE[100], borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "4px", width: `${child.score || 0}%`, background: `linear-gradient(90deg,${PURPLE[600]},${PURPLE[400]})`, transition: "width 0.6s ease" }} />
        </div>
      </div>

      {/* Meta */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "4px" }}>Quizzes completed: {child.quizzes || 0}</div>
        <div style={{ fontSize: "13px", color: "#6B7280" }}>Last active: {lastActiveLabel(child.lastActiveDays)}</div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
        {isActive ? (
          <>
            <button
              onClick={() => onViewResults?.(child)}
              style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", background: `linear-gradient(135deg,${PURPLE[600]},${PURPLE[700]})`, border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#fff", minHeight: "44px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              {cap(child.name)}'s Dashboard
            </button>
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{ flex: 1, padding: "12px 0", borderRadius: "9px", background: "#fff", border: `1.5px solid ${PURPLE[200]}`, cursor: "pointer", fontSize: "14px", fontWeight: 600, color: PURPLE[700], minHeight: "44px" }}
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
              style={{ flex: 1, padding: "12px 0", borderRadius: "9px", background: "#fff", border: `1.5px solid ${PURPLE[200]}`, cursor: "pointer", fontSize: "14px", fontWeight: 600, color: PURPLE[700], minHeight: "44px" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = PURPLE[50]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              Free Sample Test
            </button>
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{ flex: 1, padding: "12px 0", borderRadius: "9px", background: `linear-gradient(135deg,${PURPLE[600]},${PURPLE[700]})`, border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#fff", minHeight: "44px" }}
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
    <div style={{ marginBottom: "40px" }}>
      <div className="pd-section-header">
        <div>
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>Your Children</h2>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: "3px 0 0" }}>Tap a card to view or manage</p>
        </div>
        <button
          onClick={onAddChild}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "12px 18px", borderRadius: "10px", background: PURPLE[600], border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#fff", boxShadow: `0 1px 4px rgba(124,58,237,0.3)`, minHeight: "44px", whiteSpace: "nowrap" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Child
        </button>
      </div>
      {childList.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "16px", border: "1.5px dashed #E5E7EB", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>👨‍👩‍👧</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#374151", marginBottom: "8px" }}>Add your first child</div>
          <div style={{ fontSize: "14px", color: "#9CA3AF", marginBottom: "24px", maxWidth: "320px", margin: "0 auto 24px", lineHeight: 1.6 }}>
            Set up a profile for your child so they can start their free NAPLAN practice today.
          </div>
          <button onClick={onAddChild} style={{ padding: "12px 28px", borderRadius: "10px", background: PURPLE[600], border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#fff", minHeight: "44px" }}>
            + Add Child Profile
          </button>
        </div>
      ) : (
        <div className="pd-child-grid">
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
  Paid:     { bg: "#ECFDF5",  color: "#059669", border: "#A7F3D0" },
  Free:     { bg: PURPLE[50], color: PURPLE[700], border: PURPLE[200] },
  Refunded: { bg: "#F8FAFC",  color: "#64748B", border: "#E2E8F0" },
  Pending:  { bg: "#FFF7ED",  color: "#D97706", border: "#FDE68A" },
  Failed:   { bg: "#FFF1F2",  color: "#EF4444", border: "#FECACA" },
};

function RetryConfirmModal({ payment, onConfirm, onCancel, loading, error }) {
  return (
    <ModalOverlay onClose={onCancel} maxWidth="400px">
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>Retry Payment?</h3>
        <p style={{ fontSize: "14px", color: "#6B7280", margin: "0 0 4px", lineHeight: 1.6 }}><strong>{payment.description}</strong></p>
        <p style={{ fontSize: "14px", color: "#6B7280", margin: "0 0 20px" }}>{payment.amount} · Status: <span style={{ fontWeight: 600, color: payment.status === "Failed" ? "#EF4444" : "#D97706" }}>{payment.status}</span></p>
        <p style={{ fontSize: "13px", color: "#9CA3AF", margin: "0 0 24px" }}>You'll be taken to a secure payment page to complete this.</p>
        {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "13px", color: "#BE123C", marginBottom: "16px" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={onCancel} style={{ padding: "13px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "15px", fontWeight: 600, color: "#374151", minHeight: "44px" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: "13px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 600, color: "#fff", minHeight: "44px" }}>{loading ? "Redirecting…" : "Retry"}</button>
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
        <div className="pd-section-header">
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>Payment History</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <div ref={filterRef} style={{ position: "relative" }}>
              <button onClick={() => setFilterOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 14px", borderRadius: "8px", background: hasFilter ? PURPLE[50] : "#fff", border: `1px solid ${hasFilter ? PURPLE[200] : "#E5E7EB"}`, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: hasFilter ? PURPLE[700] : "#6B7280", minHeight: "44px" }}>
                Filter{hasFilter ? `: ${activeStatus}` : ""}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {filterOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100, minWidth: "130px", overflow: "hidden" }}>
                  {statuses.map((s) => (
                    <button key={s} onClick={() => { setActiveStatus(s); setFilterOpen(false); }} style={{ display: "block", width: "100%", padding: "11px 14px", background: activeStatus === s ? PURPLE[50] : "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#374151", textAlign: "left" }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setCollapsed((v) => !v)} style={{ padding: "10px 14px", borderRadius: "8px", background: "#fff", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#6B7280", minHeight: "44px" }}>{collapsed ? "Expand" : "Collapse"}</button>
          </div>
        </div>

        {payments.length > 0 && !collapsed && (
          <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: "#9CA3AF" }}>{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
            {["Paid", "Pending", "Failed", "Refunded", "Free"].map((s) => {
              const count = payments.filter((p) => p.status === s).length;
              if (!count) return null;
              const st = STATUS_STYLE[s] || STATUS_STYLE.Paid;
              return <span key={s} style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{count} {s}</span>;
            })}
          </div>
        )}

        {!collapsed && (
          <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: "14px" }}>{payments.length === 0 ? "No payment history yet" : "No payments match this filter"}</div>
            ) : filtered.map((p, idx) => {
              const st = STATUS_STYLE[p.status] || STATUS_STYLE.Paid;
              const isRetryable = p.status === "Pending" || p.status === "Failed";
              return (
                <div key={p._id || idx}
                  onClick={isRetryable ? () => setRetryTarget(p) : undefined}
                  className="pd-payment-row"
                  style={{ cursor: isRetryable ? "pointer" : "default" }}
                  onMouseEnter={(e) => { if (isRetryable) e.currentTarget.style.background = "#FAFAFA"; }}
                  onMouseLeave={(e) => { if (isRetryable) e.currentTarget.style.background = ""; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginBottom: "3px" }}>{p.description}</div>
                    <div style={{ fontSize: "12px", color: "#9CA3AF" }}>
                      {p.child && !p.isDeletedChild ? p.child : (p.isDeletedChild ? "Deleted child" : "—")} · {p.date}
                    </div>
                  </div>
                  <div className="pd-payment-row-meta">
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>{p.amount}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>
                      {p.status}{isRetryable ? " — Tap to retry" : ""}
                    </span>
                  </div>
                </div>
              );
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
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: `3px solid ${PURPLE[100]}`, borderTopColor: PURPLE[600], animation: "pd-spin 0.7s linear infinite" }} />
        <span style={{ fontSize: "14px", color: PURPLE[600], fontWeight: 600 }}>Loading…</span>
      </div>
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
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", background: open ? PURPLE[50] : "#fff", border: `1px solid ${open ? PURPLE[200] : "#E5E7EB"}`, cursor: "pointer", transition: "background 0.15s", minHeight: "44px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: `linear-gradient(135deg,${PURPLE[600]},${PURPLE[700]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
          {user.initials}
        </div>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#374151" }}>{user.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.13)", zIndex: 200, minWidth: "190px", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>{user.name}</div>
            {user.email && <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}>{user.email}</div>}
          </div>
          <div style={{ padding: "6px" }}>
            <button onClick={() => { onAddChild?.(); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#374151", textAlign: "left", borderRadius: "8px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PURPLE[50])}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              Add Child
            </button>
            <button onClick={() => { onChildLogin?.(); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#374151", textAlign: "left", borderRadius: "8px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PURPLE[50])}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PURPLE[600]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Child Login
            </button>
          </div>
          <div style={{ borderTop: "1px solid #F3F4F6", padding: "6px" }}>
            <button onClick={() => { onLogout?.(); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#EF4444", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF1F1")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign Out
            </button>
          </div>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", width: "100%", maxWidth, padding: "24px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const INPUT_STYLE = { width: "100%", boxSizing: "border-box", border: "1px solid #D1D5DB", borderRadius: "9px", padding: "11px 12px", fontSize: "15px", color: "#111827", outline: "none", background: "#fff" };
const LABEL_STYLE = { display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "6px" };
const YEAR_OPTIONS = [3];

function CheckboxRow({ checked, onChange, children } ) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ marginTop: "2px", flexShrink: 0, width: "18px", height: "18px", accentColor: PURPLE[600], cursor: "pointer" }} />
      <span style={{ fontSize: "14px", color: "#374151", lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

// ── AddChildModal ──────────────────────────────────────────────
function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName,        setDisplayName]        = useState("");
  const [username,           setUsername]           = useState("");
  const [yearLevel,          setYearLevel]          = useState("");
  const [pin,                setPin]               = useState("");
  const [confirmPin,         setConfirmPin]         = useState("");
  const [error,              setError]             = useState("");
  const [usernameStatus,     setUsernameStatus]    = useState(null);
  const [consent,            setConsent]           = useState(false);
  const [emailNotifications, setEmailNotifications]= useState(false);
  const [showConsentPolicy,  setShowConsentPolicy] = useState(false);

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
    try {
      await onAdd({ display_name: displayName.trim(), username: username.trim().toLowerCase(), year_level: Number(yearLevel), pin, email_notifications: emailNotifications, parental_consent: consent });
    } catch (err) { setError(err?.message || "Failed to add child"); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>Add Child</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9CA3AF", padding: "4px", minWidth: "32px", minHeight: "32px" }}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={LABEL_STYLE}>Child's Name</label>
            <input style={INPUT_STYLE} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Emma" />
          </div>
          <div>
            <label style={LABEL_STYLE}>Username <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(they'll use this to log in)</span></label>
            <div style={{ position: "relative" }}>
              <input style={{ ...INPUT_STYLE, paddingRight: "100px" }} value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="e.g. emma2024" />
              {usernameStatus && (
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", fontWeight: 600, color: usernameStatus === "available" ? "#059669" : usernameStatus === "taken" ? "#EF4444" : "#9CA3AF" }}>
                  {usernameStatus === "checking" ? "Checking…" : usernameStatus === "available" ? "✓ Available" : "✗ Taken"}
                </span>
              )}
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>Year Level</label>
            <select style={INPUT_STYLE} value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
              <option value="">Select year level</option>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>6-digit PIN</label>
              <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            </div>
            <div>
              <label style={LABEL_STYLE}>Confirm PIN</label>
              <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#F9FAFB", borderRadius: "10px", padding: "14px" }}>
            <CheckboxRow checked={consent} onChange={(e) => setConsent(e.target.checked)}>
              I agree to the{" "}
              <span onClick={(e) => { e.preventDefault(); setShowConsentPolicy(true); }} style={{ color: PURPLE[600], textDecoration: "underline", cursor: "pointer" }}>
                Child Data Collection Policy
              </span>
            </CheckboxRow>
            <CheckboxRow checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)}>
              Email me when my child completes a quiz
            </CheckboxRow>
          </div>
          {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "14px", color: "#BE123C" }}>{error}</div>}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "13px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "15px", fontWeight: 600, color: "#374151", minHeight: "44px" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 1, padding: "13px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 600, color: "#fff", minHeight: "44px" }}>{loading ? "Adding…" : "Add Child"}</button>
          </div>
        </div>
      </form>

      {showConsentPolicy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: "16px" }} onClick={() => setShowConsentPolicy(false)}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "720px", maxHeight: "85vh", borderRadius: "16px", boxShadow: "0 25px 70px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #F3F4F6" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 }}>Child Data Collection Policy</h2>
              <button onClick={() => setShowConsentPolicy(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9CA3AF", minWidth: "36px", minHeight: "36px" }}>✕</button>
            </div>
            <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}><ChildDataConsentPolicy /></div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setConsent(true); setShowConsentPolicy(false); }} style={{ padding: "10px 24px", background: PURPLE[600], color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", minHeight: "44px" }}>I Agree</button>
            </div>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}

// ── EditChildModal ──────────────────────────────────────────────
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
    if (!cleanName) return setError("Name cannot be empty");
    if (!yearLevel) return setError("Please select a year level");
    const updates = {};
    if (cleanName !== (child.display_name || child.name || "")) updates.display_name = cleanName;
    if (Number(yearLevel) !== Number(child.year_level || 0))    updates.year_level   = Number(yearLevel);
    if (changePin) {
      if (!pin || !/^\d{6}$/.test(pin)) return setError("PIN must be exactly 6 digits");
      if (pin !== confirmPin)           return setError("PINs don't match");
      updates.pin = pin;
    }
    if (emailNotifications !== (child.email_notifications ?? false)) updates.email_notifications = emailNotifications;
    if (Object.keys(updates).length === 0) return setError("No changes to save");
    await onSave(child._id, updates);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>Edit Child</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9CA3AF", minWidth: "32px", minHeight: "32px" }}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={LABEL_STYLE}>Display Name</label>
          <input style={INPUT_STYLE} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Emma" />
        </div>
        {/* ✅ ADD THIS — Username (read-only) */}
        <div>
          <label style={LABEL_STYLE}>
            Username{" "}
            <span style={{ fontWeight: 400, color: "#9CA3AF", fontSize: "12px" }}>(cannot be changed)</span>
          </label>
          <input
            style={{ ...INPUT_STYLE, background: "#F9FAFB", color: "#6B7280", cursor: "not-allowed" }}
            value={`@${child.username || child.user_name || ""}`}
            readOnly
            disabled
          />
        </div>
          <CheckboxRow checked={changePin} onChange={(e) => setChangePin(e.target.checked)}>
            Change PIN
          </CheckboxRow>
          {changePin && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={LABEL_STYLE}>New PIN</label>
                <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
              </div>
              <div>
                <label style={LABEL_STYLE}>Confirm PIN</label>
                <input style={INPUT_STYLE} type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
              </div>
            </div>
          )}
          <CheckboxRow checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)}>
            Email me when my child completes a quiz
          </CheckboxRow>
          {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "9px", padding: "10px 14px", fontSize: "14px", color: "#BE123C" }}>{error}</div>}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "13px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "15px", fontWeight: 600, color: "#374151", minHeight: "44px" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 1, padding: "13px", borderRadius: "9px", background: loading ? PURPLE[400] : PURPLE[600], border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 600, color: "#fff", minHeight: "44px" }}>{loading ? "Saving…" : "Save Changes"}</button>
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
        <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Delete {child.name || "this child"}?</h3>
        <p style={{ fontSize: "14px", color: "#6B7280", margin: "0 0 24px", lineHeight: 1.6 }}>
          This will permanently delete <strong>{child.name}</strong>'s profile and all their quiz history. This cannot be undone.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={onCancel} style={{ padding: "13px", borderRadius: "9px", background: "#F3F4F6", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "15px", fontWeight: 600, color: "#374151", minHeight: "44px" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: "13px", borderRadius: "9px", background: loading ? "#FCA5A5" : "#EF4444", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 600, color: "#fff", minHeight: "44px" }}>{loading ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── BundleSelectionModal ────────────────────────────────────────
function BundleSelectionModal({ child, bundles, loadingBundleId, onSelect, onClose, onExploreBundles }) {
  const childName = child.name || child.display_name || "your child";
  const yearLabel = child.yearLevel || `Year ${child.year_level}`;

  return (
    <ModalOverlay onClose={onClose} maxWidth="860px">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: "0 0 3px" }}>Choose a Practice Pack</h3>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>For {childName} · {yearLabel}</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9CA3AF", minWidth: "36px", minHeight: "36px" }}>✕</button>
      </div>

      <div className="pd-bundle-body">
        {/* LEFT: Suggested bundles */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "14px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: PURPLE[600], background: PURPLE[50], border: `1px solid ${PURPLE[200]}`, padding: "3px 10px", borderRadius: "99px" }}>
              ✨ Suggested for {childName}
            </span>
          </div>

          {bundles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9CA3AF", fontSize: "14px" }}>
              No packs available for {yearLabel}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {bundles.map((bundle) => {
                const isLoading    = loadingBundleId === bundle.bundle_id;
                const alreadyOwned = (child.entitled_bundle_ids || []).includes(bundle.bundle_id);
                const price = `$${(Number(bundle.price_cents || 0) / 100).toFixed(2)} ${(bundle.currency || "AUD").toUpperCase()}`;

                return (
                  <div key={bundle.bundle_id} style={{ border: `1px solid ${alreadyOwned ? "#E5E7EB" : PURPLE[200]}`, borderRadius: "12px", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: alreadyOwned ? "#F9FAFB" : PURPLE[50] }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: alreadyOwned ? "#9CA3AF" : "#111827", marginBottom: "3px" }}>{bundle.bundle_name}</div>
                      {bundle.description && <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px" }}>{bundle.description}</div>}
                      <div style={{ fontSize: "15px", fontWeight: 800, color: alreadyOwned ? "#9CA3AF" : PURPLE[700] }}>{price}</div>
                    </div>
                    {alreadyOwned ? (
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#9CA3AF", background: "#F3F4F6", padding: "8px 14px", borderRadius: "8px", whiteSpace: "nowrap" }}>Owned</span>
                    ) : (
                      <button onClick={() => onSelect(bundle)} disabled={isLoading} style={{ padding: "10px 18px", borderRadius: "9px", background: isLoading ? PURPLE[400] : PURPLE[600], border: "none", cursor: isLoading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, color: "#fff", flexShrink: 0, minHeight: "44px" }}>
                        {isLoading ? "Loading…" : "Buy Now"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: View all */}
        <div style={{ width: "100%", maxWidth: "220px" }}>
          <div style={{ background: PURPLE[50], borderRadius: "12px", padding: "20px", border: `1px solid ${PURPLE[200]}` }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>More options?</div>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "16px", lineHeight: 1.5 }}>
              Browse all available practice packs across every year level.
            </p>
            <button onClick={onExploreBundles} style={{ width: "100%", padding: "11px 0", borderRadius: "9px", background: PURPLE[600], border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", minHeight: "44px" }}>
              Browse all packs
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
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
  // ✅ Build name from firstName + lastName first, then fall back to name field, then email
  const firstName = (parentProfile?.firstName || "").trim();
  const lastName  = (parentProfile?.lastName  || "").trim();
  const fullName  = [firstName, lastName].filter(Boolean).join(" ");




  // Use fullName if available, then .name field, then email as last resort
  const name = fullName || parentProfile?.name || parentProfile?.email || "";

  const initials = firstName && lastName
    ? (firstName[0] + lastName[0]).toUpperCase()         // "TH" from "Tharun Sai"
    : firstName
      ? firstName.slice(0, 2).toUpperCase()              // "TH" from "Tharun"
      : name
        ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
        : "??";

  return { name, initials };
}, [parentProfile]);

  const lastLoadedAt = useRef(0);
  const CACHE_TTL_MS = 60_000;

  // ── Data loading ─────────────────────────────────────────────
const loadChildren = useCallback(async (silent = false) => {
  if (!parentToken) return;
  try {
    if (!silent) setLoading(true);

    // Step 1 — get child list (names, status, year level)
    const summaries = await fetchChildrenSummaries(parentToken);
    const childList = Array.isArray(summaries) ? summaries : [];

    // Step 2 — enrich each child with REAL stats from actual results
    // (summaries endpoint only aggregates legacy FlexiQuiz data, not native attempts)
    const enriched = await Promise.all(
      childList.map(async (child) => {
        try {
         const [results, writing, catalogData] = await Promise.all([
          fetchChildResults(parentToken, child._id).catch(() => []),
          fetchChildWriting(parentToken, child._id).catch(() => []),
          fetchAvailableQuizzes(parentToken, child._id).catch(() => ({ quizzes: [] })),
        ]);

        // ✅ Catalog size = same number child sees in their "All" tab
        // Catalog size (assigned quizzes)
        // Catalog size (assigned quizzes)
      const catalog = Array.isArray(catalogData)
        ? catalogData
        : (catalogData?.quizzes || []);
      const quizCount = catalog.length;

      // Build deduplicated attempts list FIRST
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

    // ✅ Build set of active catalog quiz_ids
    const catalogQuizIds = new Set(
      catalog.map((q) => q.quiz_id).filter(Boolean)
    );

    // ✅ Only keep attempts whose quiz_id exists in the current catalog
    // This auto-hides results for quizzes admin has removed
    const activeAttempts = allAttempts.filter((r) =>
      r.quiz_id && catalogQuizIds.has(r.quiz_id)
    );

    // ✅ Keep only the LATEST attempt per quiz (matches child dashboard logic)
    const latestPerQuiz = {};
    activeAttempts.forEach((r) => {
      const qid = r.quiz_id;
      if (!qid) return;
      const date = new Date(r.date_submitted || r.submitted_at || r.createdAt || 0);
      const existing = latestPerQuiz[qid];
      const existingDate = existing
        ? new Date(existing.date_submitted || existing.submitted_at || existing.createdAt || 0)
        : new Date(0);
      if (!existing || date > existingDate) latestPerQuiz[qid] = r;
    });

    const latestAttempts = Object.values(latestPerQuiz);

    // ✅ completedCount = unique quizzes in catalog that have been attempted
    const completedCount = latestAttempts.length;

    // ✅ averageScore = based on latest attempt per quiz only
    const scores = latestAttempts
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
            quizCount,
            completedCount,
            averageScore: scores.length > 0
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : null,
            lastActivity: dates[0] || child.lastActivity || null,
          };
            } catch {
              return child; // fallback to whatever summaries returned
            }
          })
        );

        setRawChildren(enriched);
        setError(null);
      } catch (err) {
        setError(err?.message || "Failed to load children");
      } finally {
        setLoading(false);
        lastLoadedAt.current = Date.now();
      }
    }, [parentToken]);



      const loadPayments = useCallback(async () => {
        if (!parentToken) return;
        try {
          const data = await fetchPurchaseHistory(parentToken);
          setRawPayments(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error("Failed to load payments:", err);
        }
      }, [parentToken]);

      useEffect(() => { 
        if (!parentToken) return;
        loadChildren(); loadPayments();
      }, [loadChildren, loadPayments]);

      useEffect(() => {
        const handleVisibility = () => {
          if (document.visibilityState === "visible") {
            const age = Date.now() - lastLoadedAt.current;
            if (age > CACHE_TTL_MS) {
              loadChildren(true);
            }
          }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
      }, [loadChildren]);


    useEffect(() => {
      const payment = searchParams.get("payment");
      if (!payment) return;

      // Always strip payment params from URL immediately
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      next.delete("session_id");
      setSearchParams(next, { replace: true });

      if (payment === "success") {
        const sid = searchParams.get("session_id");

        // Only show success modal if we have a real Stripe session ID to verify
        // A missing session_id means someone crafted the URL manually — ignore it
        if (!sid) {
          // Still refresh data in case webhook already processed
          loadChildren();
          loadPayments();
          return;
        }

        // Set session ID — PaymentSuccessModal will call verifyPayment(sid)
        // which hits the backend to confirm the payment is real before showing anything
        setSuccessSessionId(sid);
        loadChildren();
        loadPayments();
      }
    }, [searchParams, setSearchParams, loadChildren, loadPayments]);


  // ── CRUD handlers ─────────────────────────────────────────────
const handleAddChild = async (formData) => {
  try {
    setActionLoading(true);
    const newChild = await createChild(parentToken, formData);
    setIsAddModalOpen(false);

    // ── Step 1: Optimistic update — card appears instantly ──
    if (newChild?._id) {
      setRawChildren((prev) => [
        ...prev,
        {
          ...newChild,
          quizCount:    0,
          averageScore: null,
          lastActivity: null,
        },
      ]);
    }

    // ── Step 2: Full refresh — sync accurate enriched data ──
    await loadChildren();
  } catch (err) {
    alert(err?.message || "Failed to add child");
  } finally {
    setActionLoading(false);
    lastLoadedAt.current = Date.now();
  }
};


  const handleEditChild = async (childId, updates) => {
    try {
      setActionLoading(true);
      await updateChild(parentToken, childId, updates);
      setEditTarget(null);
      await loadChildren();
    } catch (err) {
      alert(err?.message || "Failed to update child");
    } finally {
      setActionLoading(false);
      lastLoadedAt.current = Date.now();
    }
  };

  const handleDeleteChild = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await deleteChild(parentToken, deleteTarget._id);
      setRawChildren((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err?.message || "Failed to delete child");
    } finally {
      setActionLoading(false);
      lastLoadedAt.current = Date.now();
    }
  };

  const handleCheckout = async (child, bundle) => {
    try {
      setCheckoutLoadingBundle(bundle.bundle_id);
      const result = await createCheckout(parentToken, {
        bundle_id: bundle.bundle_id,
        child_ids: [child._id],
      });
      if (!result?.checkout_url) throw new Error("No checkout URL returned");
      window.location.href = result.checkout_url;
    } catch (err) {
      if (err.code === "DUPLICATE_PURCHASE") {
        alert(`${err.child_name || child.name} already has the "${err.bundle_name || bundle.bundle_name}" bundle.`);
        setBundleModalChild(null);
      } else {
        alert(err?.message || "Checkout failed. Please try again.");
      }
    } finally {
      setCheckoutLoadingBundle(null);
    }
  };



const handleViewChild = (child) => {
  try { sessionStorage.removeItem("quizResultState"); } catch {}
  navigate("/child-dashboard", {
    state: {
      childId: child._id || child.id,
      childName: child.display_name || child.name || "",
      yearLevel: child.year_level || "",
      username: child.username || "",
    }
  });
};


  const handleDeleteRequest = (childId) => {
    const raw = rawChildren.find((c) => String(c._id) === String(childId));
    if (raw) setDeleteTarget(raw);
  };

  const handleEditRequest = async (mc) => {
    const childId = mc._id || mc.id;
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${API_BASE}/api/children/${childId}`, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${parentToken}`,
          Accept: "application/json",
        },
      });
      if (res.ok) { const full = await res.json(); setEditTarget(full); }
      else { const raw = rawChildren.find((c) => String(c._id) === String(childId)); if (raw) setEditTarget(raw); }
    } catch {
      const raw = rawChildren.find((c) => String(c._id) === String(childId));
      if (raw) setEditTarget(raw);
    }
  };

  return (
    <div className="pd-root">
      {/* Inject responsive CSS once */}
      <style>{RESPONSIVE_CSS}</style>

      {loading && <LoadingOverlay />}

      <DashboardHeader>
        <UserMenu user={user} onLogout={logout} onAddChild={() => setIsAddModalOpen(true)} onChildLogin={() => setIsChildLoginModalOpen(true)} />
      </DashboardHeader>

      <main className="pd-main">
        {/* Error banner */}
        {error && (
          <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", color: "#BE123C", fontWeight: 600, flex: 1 }}>{error}</span>
            <button onClick={loadChildren} style={{ background: "#BE123C", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 18px", cursor: "pointer", fontSize: "14px", fontWeight: 600, minHeight: "44px", whiteSpace: "nowrap" }}>Try Again</button>
          </div>
        )}

        {/* Page header */}
        <div className="pd-header-row">
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#111827", margin: 0 }}>Parent Dashboard</h1>
            <p style={{ fontSize: "14px", color: "#6B7280", margin: "5px 0 0" }}>
              Welcome back, <strong style={{ color: PURPLE[600] }}>{user.name || "—"}</strong> — here's how your kids are going
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="pd-stat-grid">
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
              Number(b.year_level) === Number(bundleModalChild.year_level || bundleModalChild.yearLevel?.replace("Year ", "")) &&
              b.is_active
          )}
          loadingBundleId={checkoutLoadingBundle}
          onSelect={(bundle) => handleCheckout(bundleModalChild, bundle)}
          onClose={() => setBundleModalChild(null)}
          onExploreBundles={() => {
            setBundleModalChild(null);
            const yr = bundleModalChild.year_level || bundleModalChild.yearLevel?.replace("Year ", "");
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
