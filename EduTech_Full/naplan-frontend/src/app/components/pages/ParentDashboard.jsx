/**
 * ParentDashboard.jsx — Production Ready
 *
 * Layout  : New design (ParentDashboard__2_.jsx) — preserved exactly
 * Data    : Wired to real API (auth, children, payments, bundles)
 * Modals  : AddChild, EditChild, DeleteConfirm, BundleSelection
 *           + PaymentSuccessModal, QuickChildLoginModal, FreeTrialOnboarding
 *
 * Data flow overview
 * ──────────────────
 *  AuthContext  ──►  parentToken, parentProfile
 *  /api/children/summaries  ──►  loadChildren()  ──►  mapChild()  ──►  children[]
 *  /api/payments/history    ──►  loadPayments()  ──►  mapPayment() ──►  payments[]
 *  Modals trigger CRUD: createChild / updateChild / deleteChild / createCheckout
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
//  DATA HELPERS
// ═══════════════════════════════════════════════════════════════

const formatAUD = (cents) =>
  `$${(Number(cents || 0) / 100).toFixed(2)} AUD`;

/** Convert ISO lastActivity date → days since (0 = today, null = never) */
function computeLastActiveDays(lastActivity) {
  if (!lastActivity) return null;
  const diffMs = Date.now() - new Date(lastActivity).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Backend child → component child shape */
function mapChild(c) {
  return {
    // UI fields
    id: c._id,
    name: c.display_name || c.username || "Unknown",
    yearLevel: c.year_level ? `Year ${c.year_level}` : "—",
    username: c.username || "",
    status: c.status === "active" ? "active" : "trial",
    quizzes: c.quizCount || 0,
    score:
      c.averageScore != null ? Math.round(c.averageScore) : null,
    lastActiveDays: computeLastActiveDays(c.lastActivity),
    // Raw fields kept for modals / checkout
    _id: c._id,
    display_name: c.display_name,
    year_level: c.year_level,
    entitled_bundle_ids: c.entitled_bundle_ids || [],
    entitled_quiz_ids: c.entitled_quiz_ids || [],
  };
}

/** Backend purchase → component payment shape */
function mapPayment(p) {
  // child_ids can be populated objects { display_name, username } or bare IDs
  let childName = "—";
  if (Array.isArray(p.child_ids) && p.child_ids.length) {
    const names = p.child_ids
      .map((c) => (typeof c === "object" ? c.display_name || c.username || "?" : null))
      .filter(Boolean);
    if (names.length) childName = names.join(", ");
  } else if (Array.isArray(p.child_names) && p.child_names.length) {
    childName = p.child_names.join(", ");
  } else if (p.child_name) {
    childName = p.child_name;
  }

  const date = p.createdAt
    ? new Date(p.createdAt).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

  // Detect deleted child: child_ids present but none resolved to an object (Mongoose returns null for deleted docs)
  const childDeleted =
    Array.isArray(p.child_ids) &&
    p.child_ids.length > 0 &&
    p.child_ids.every((c) => c === null || typeof c !== "object");

  const rawStatus = (p.status || "").toLowerCase();
  const statusMap = {
    paid:      "Paid",
    free:      "Free",
    refunded:  "Refunded",
    pending:   "Pending",
    cancelled: "Pending",
    failed:    "Failed",
  };

  return {
    id:           p._id || p.session_id || Math.random(),
    date,
    child:        childName,
    description:  p.bundle_name || "Bundle Purchase",
    amount:       formatAUD(p.amount_cents),
    status:       statusMap[rawStatus] || "Pending",
    // raw fields needed for retry
    _id:          p._id,
    rawStatus,
    childDeleted, // true when paid but child was later deleted
  };
}

// ═══════════════════════════════════════════════════════════════
//  PURE UI HELPERS  (unchanged from uploaded design)
// ═══════════════════════════════════════════════════════════════

const AVATAR_COLORS = [
  "#7C3AED",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const ini = (name) => (name ? name.slice(0, 2).toUpperCase() : "??");

function lastActiveLabel(days) {
  if (days === null || days === undefined) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function lastActiveDot(days) {
  if (days === null || days === undefined) return "#9CA3AF";
  if (days === 0) return "#10B981";
  if (days <= 3) return "#F59E0B";
  return "#EF4444";
}

function lastActiveBadge(days) {
  if (days === null || days === undefined)
    return { bg: "#F9FAFB", color: "#9CA3AF" };
  if (days === 0) return { bg: "#ECFDF5", color: "#059669" };
  if (days <= 3) return { bg: "#FFF7ED", color: "#D97706" };
  return { bg: "#FFF1F1", color: "#B91C1C" };
}

// ─── Shared card wrapper ───────────────────────────────────────
const Card = ({ children, borderColor }) => (
  <div
    style={{
      background: "#fff",
      borderRadius: "14px",
      border: `1px solid ${borderColor}55`,
      borderTop: `3px solid ${borderColor}`,
      padding: "20px 22px",
      flex: "1 1 0",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const CardTop = ({
  icon,
  iconBg,
  label,
  subLabel,
  accent,
  bigNum,
  bigNumSub,
  bigNumPrefix,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "14px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "9px",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
          {subLabel}
        </div>
      </div>
    </div>
    <div style={{ textAlign: "right" }}>
      {bigNumPrefix && (
        <div
          style={{
            fontSize: "11px",
            color: "#9CA3AF",
            marginBottom: "1px",
          }}
        >
          {bigNumPrefix}
        </div>
      )}
      <span
        style={{
          fontSize: "38px",
          fontWeight: 900,
          color: "#111827",
          lineHeight: 1,
        }}
      >
        {bigNum}
      </span>
      {bigNumSub && (
        <span style={{ fontSize: "15px", color: "#9CA3AF", marginLeft: "1px" }}>
          {bigNumSub}
        </span>
      )}
    </div>
  </div>
);

const EmptyRow = ({ message }) => (
  <div
    style={{
      padding: "24px 0",
      textAlign: "center",
      color: "#D1D5DB",
      fontSize: "13px",
    }}
  >
    {message}
  </div>
);

// ─── Stat Cards ────────────────────────────────────────────────

function ChildrenCard({ childList }) {
  const active = childList.filter((c) => c.status === "active").length;
  const trial = childList.filter((c) => c.status === "trial").length;

  return (
    <Card borderColor="#7C3AED">
      <CardTop
        accent="#7C3AED"
        iconBg="#EDE9FE"
        label="Children"
        subLabel="Profiles registered"
        bigNum={childList.length}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7C3AED"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />

      {childList.length === 0 && (
        <EmptyRow message="No children added yet" />
      )}

      {active > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: "20px",
                background: "#ECFDF5",
                color: "#059669",
                border: "1px solid #A7F3D0",
              }}
            >
              ● {active} Active
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              paddingLeft: "4px",
            }}
          >
            {childList
              .filter((c) => c.status === "active")
              .map((c) => (
                <div
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background:
                        AVATAR_COLORS[
                          childList.indexOf(c) % AVATAR_COLORS.length
                        ],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {ini(c.name)}
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "#374151",
                      fontWeight: 500,
                    }}
                  >
                    {cap(c.name)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {trial > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: "20px",
                background: "#FFF7ED",
                color: "#D97706",
                border: "1px solid #FDE68A",
              }}
            >
              ● {trial} Trial
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              paddingLeft: "4px",
            }}
          >
            {childList
              .filter((c) => c.status === "trial")
              .map((c) => (
                <div
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background:
                        AVATAR_COLORS[
                          childList.indexOf(c) % AVATAR_COLORS.length
                        ],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {ini(c.name)}
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "#374151",
                      fontWeight: 500,
                    }}
                  >
                    {cap(c.name)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function QuizzesCard({ childList }) {
  const total = childList.reduce((s, c) => s + (c.quizzes || 0), 0);
  const maxQ = Math.max(...childList.map((c) => c.quizzes || 0), 1);

  return (
    <Card borderColor="#8B5CF6">
      <CardTop
        accent="#8B5CF6"
        iconBg="#EDE9FE"
        label="Quizzes"
        subLabel="Total completed"
        bigNum={total}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8B5CF6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        }
      />
      {childList.length === 0 ? (
        <EmptyRow message="No quiz data" />
      ) : (
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            paddingRight: "2px",
          }}
        >
          {childList.map((child) => (
            <div
              key={child.id}
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#374151",
                  width: "72px",
                  flexShrink: 0,
                }}
              >
                {child.name}
              </span>
              <div
                style={{
                  flex: 1,
                  height: "8px",
                  background: "#F3F4F6",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: "4px",
                    width:
                      (child.quizzes || 0) > 0
                        ? `${((child.quizzes || 0) / maxQ) * 100}%`
                        : "0%",
                    background: "linear-gradient(90deg,#7C3AED,#A78BFA)",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color:
                    (child.quizzes || 0) > 0 ? "#111827" : "#D1D5DB",
                  width: "20px",
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {child.quizzes || 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ScoresCard({ childList }) {
  const scored = childList.filter(
    (c) => c.score !== null && c.score !== undefined
  );
  const avg = scored.length
    ? Math.round(
        scored.reduce((s, c) => s + c.score, 0) / scored.length
      )
    : 0;
  const leader = [...scored].sort((a, b) => b.score - a.score)[0];

  return (
    <Card borderColor="#0EA5E9">
      <CardTop
        accent="#0EA5E9"
        iconBg="#E0F2FE"
        label="Scores"
        subLabel="Per child breakdown"
        bigNum={scored.length ? `${avg}%` : "—"}
        bigNumPrefix={scored.length ? "AVG" : undefined}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        }
      />

      {childList.length === 0 ? (
        <EmptyRow message="No score data" />
      ) : (
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "13px",
            paddingRight: "2px",
          }}
        >
          {childList.map((child) => (
            <div
              key={child.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: "#374151",
                    flexShrink: 0,
                    minWidth: "58px",
                  }}
                >
                  {child.name}
                </span>
                {child.score !== null && child.score !== undefined ? (
                  <>
                    <div
                      style={{
                        flex: 1,
                        height: "7px",
                        background: "#F3F4F6",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "4px",
                          width: `${child.score}%`,
                          background:
                            "linear-gradient(90deg,#F59E0B,#FBBF24)",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#F59E0B",
                        minWidth: "34px",
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {child.score}%
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "13px", color: "#9CA3AF" }}>
                      No attempts
                    </span>
                    <span
                      style={{ marginLeft: "auto", fontSize: "14px", color: "#D1D5DB" }}
                    >
                      —
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {leader && (
        <div
          style={{
            marginTop: "14px",
            background: "#FFFBEB",
            borderRadius: "9px",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid #FDE68A",
            flexShrink: 0,
          }}
        >
          <span>⭐</span>
          <span style={{ fontSize: "13px", color: "#92400E", fontWeight: 600 }}>
            {leader.name} leading at {leader.score}%
          </span>
        </div>
      )}
    </Card>
  );
}

function LastActiveCard({ childList }) {
  const todayCount = childList.filter((c) => c.lastActiveDays === 0).length;
  const hasStale = childList.some(
    (c) => c.lastActiveDays === null || c.lastActiveDays > 3
  );

  return (
    <Card borderColor="#10B981">
      <CardTop
        accent="#10B981"
        iconBg="#D1FAE5"
        label="Last Active"
        subLabel={`${todayCount} active today`}
        bigNum={todayCount}
        bigNumSub={childList.length ? `/${childList.length}` : undefined}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      />

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "-38px",
          marginBottom: "6px",
          flexShrink: 0,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            background: "#10B981",
            display: "inline-block",
            marginRight: "68px",
            marginTop: "6px",
          }}
        />
      </div>

      {childList.length === 0 ? (
        <EmptyRow message="No activity data" />
      ) : (
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "13px",
            paddingRight: "2px",
          }}
        >
          {childList.map((child) => {
            const label = lastActiveLabel(child.lastActiveDays);
            const dot = lastActiveDot(child.lastActiveDays);
            const badge = lastActiveBadge(child.lastActiveDays);
            return (
              <div
                key={child.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: dot,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "14px", color: "#374151" }}>
                    {child.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "10px",
                    background: badge.bg,
                    color: badge.color,
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasStale && childList.length > 0 && (
        <div
          style={{
            marginTop: "14px",
            background: "#FFF1F1",
            borderRadius: "9px",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid #FECACA",
            flexShrink: 0,
          }}
        >
          <span>⚡</span>
          <span style={{ fontSize: "12px", color: "#B91C1C", fontWeight: 600 }}>
            Some children haven't practiced recently
          </span>
        </div>
      )}
    </Card>
  );
}

// ─── KebabMenu ─────────────────────────────────────────────────
function KebabMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open ? "#EDE9FE" : "transparent",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          padding: "4px 6px",
          display: "flex",
          alignItems: "center",
          color: "#9CA3AF",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "#F3F4F6";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
        aria-label="Child options"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.13)",
            zIndex: 200,
            minWidth: "136px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => {
              onEdit?.();
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "10px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: "#374151",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#F9FAFB")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "none")
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366F1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <div
            style={{ height: "1px", background: "#F3F4F6", margin: "0 10px" }}
          />
          <button
            onClick={() => {
              onDelete?.();
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "10px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: "#EF4444",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#FFF1F1")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "none")
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ChildCard ──────────────────────────────────────────────────
function ChildCard({
  child,
  colorIndex,
  onEdit,
  onDelete,
  onViewResults,
  onFreeSample,
  onBuyBundle,
}) {
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const isActive = child.status === "active";

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "14px",
        border: "1px solid #E5E7EB",
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "18px",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {ini(child.name)}
          </div>
          <div>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.2,
              }}
            >
              {cap(child.name)}
            </div>
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "3px" }}>
              {child.yearLevel || "—"} • @
              {child.username || child.name.toLowerCase()}
            </div>
          </div>
        </div>
        <KebabMenu
          onEdit={() => onEdit?.(child)}
          onDelete={() => onDelete?.(child.id)}
        />
      </div>

      {/* Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: "20px",
            background: isActive ? "#ECFDF5" : "#FFF7ED",
            color: isActive ? "#059669" : "#D97706",
            border: `1px solid ${isActive ? "#A7F3D0" : "#FDE68A"}`,
            flexShrink: 0,
          }}
        >
          {isActive ? "Active" : "Trial"}
        </span>
        {isActive ? (
          <span style={{ fontSize: "13px", color: "#6B7280" }}>
            Bundle purchased ✓
          </span>
        ) : (
          <span
            style={{
              fontSize: "13px",
              color: "#7C3AED",
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={() => onBuyBundle?.(child)}
          >
            Upgrade to Full Access →
          </span>
        )}
      </div>

      {/* Performance */}
      <div style={{ marginBottom: "14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#6B7280" }}>
            Performance
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
            {child.score !== null && child.score !== undefined
              ? `${child.score}%`
              : "0%"}
          </span>
        </div>
        <div
          style={{
            height: "7px",
            background: "#F3F4F6",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: "4px",
              width: `${child.score || 0}%`,
              background: isActive ? "#EF4444" : "#D1D5DB",
              transition: "width 0.6s ease",
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "4px" }}>
          Quizzes: {child.quizzes || 0}
        </div>
        <div style={{ fontSize: "13px", color: "#6B7280" }}>
          Last Activity: {lastActiveLabel(child.lastActiveDays)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
        {isActive ? (
          <>
            <button
              onClick={() => onViewResults?.(child)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "9px",
                background: "linear-gradient(135deg, #6366F1, #4F46E5)",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 700,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                boxShadow: "0 2px 8px rgba(99,102,241,0.35)",
                letterSpacing: "0.01em",
                transition: "opacity 0.15s, transform 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/><polyline points="18 9 12 15 9 12 3 18"/>
              </svg>
              View Results
            </button>
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "9px",
                background: "#fff",
                border: "1.5px solid #D1D5DB",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#374151",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              🛒 Buy Bundle
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onFreeSample?.(child)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "9px",
                background: "#fff",
                border: "1.5px solid #D1D5DB",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#374151",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              Free Sample Test
            </button>
            <button
              onClick={() => onBuyBundle?.(child)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "9px",
                background: "#059669",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
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
function ChildManagementSection({
  childList,
  onEdit,
  onDelete,
  onAddChild,
  onViewResults,
  onFreeSample,
  onBuyBundle,
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 0 16px",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#111827",
            margin: 0,
          }}
        >
          Manage Children
        </h2>
        <button
          onClick={onAddChild}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "9px",
            background: "#7C3AED",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            color: "#fff",
            boxShadow: "0 1px 4px rgba(124,58,237,0.3)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Child
        </button>
      </div>

      {childList.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: "14px",
            border: "1.5px dashed #E5E7EB",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>👶</div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#374151",
              marginBottom: "6px",
            }}
          >
            No children yet
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#9CA3AF",
              marginBottom: "20px",
            }}
          >
            Add your first child profile to get started
          </div>
          <button
            onClick={onAddChild}
            style={{
              padding: "10px 24px",
              borderRadius: "9px",
              background: "#7C3AED",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            Add Child
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {childList.map((child, i) => (
            <ChildCard
              key={child.id}
              child={child}
              colorIndex={i}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewResults={onViewResults}
              onFreeSample={onFreeSample}
              onBuyBundle={onBuyBundle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PaymentHistory ─────────────────────────────────────────────
const STATUS_STYLE = {
  Paid:     { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  Free:     { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  Refunded: { bg: "#FFF1F2", color: "#BE123C", border: "#FECDD3" },
  Pending:  { bg: "#FFF7ED", color: "#D97706", border: "#FDE68A" },
  Failed:   { bg: "#FFF1F2", color: "#EF4444", border: "#FECACA" },
};

/** Confirmation modal shown before retrying a pending/failed payment */
function RetryConfirmModal({ payment, onConfirm, onCancel, loading, error }) {
  return (
    <ModalOverlay onClose={onCancel} maxWidth="400px">
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "56px", height: "56px", borderRadius: "50%",
          background: "#FFF7ED", display: "flex", alignItems: "center",
          justifyContent: "center", margin: "0 auto 16px",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
          </svg>
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
          Retry Payment?
        </h3>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 4px", lineHeight: 1.6 }}>
          <strong>{payment.description}</strong>
        </p>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 20px" }}>
          {payment.amount} · Status:{" "}
          <span style={{ fontWeight: 600, color: payment.status === "Failed" ? "#EF4444" : "#D97706" }}>
            {payment.status}
          </span>
        </p>
        <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "0 0 24px" }}>
          You'll be redirected to Stripe to complete the payment.
        </p>

        {error && (
          <div style={{
            background: "#FFF1F2", border: "1px solid #FECDD3",
            borderRadius: "9px", padding: "10px 14px", fontSize: "13px",
            color: "#BE123C", marginBottom: "16px",
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "11px", borderRadius: "9px",
            background: "#F3F4F6", border: "none", cursor: "pointer",
            fontSize: "14px", fontWeight: 600, color: "#374151",
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} style={{
            flex: 1, padding: "11px", borderRadius: "9px",
            background: loading ? "#FDE68A" : "#D97706", border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px", fontWeight: 600, color: "#fff",
          }}>
            {loading ? "Redirecting…" : "Retry Payment"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PaymentHistory({ payments = [], parentToken }) {
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [activeStatus, setActiveStatus] = useState("All");
  const [collapsed,    setCollapsed]    = useState(false);
  const filterRef = useRef(null);

  // Retry state
  const [retryTarget,  setRetryTarget]  = useState(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError,   setRetryError]   = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statuses = ["All", ...Array.from(new Set(payments.map((p) => p.status)))];
  const filtered = payments.filter(
    (p) => activeStatus === "All" || p.status === activeStatus
  );
  const hasFilter = activeStatus !== "All";

  const handleRetryConfirm = async () => {
    if (!retryTarget?._id || !parentToken) return;
    try {
      setRetryLoading(true);
      setRetryError(null);
      const result = await retryPayment(parentToken, retryTarget._id);
      if (result?.ok && result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setRetryError("Could not create checkout session. Please try again.");
        setRetryLoading(false);
      }
    } catch (err) {
      setRetryError(err?.message || "Something went wrong. Please try again.");
      setRetryLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginTop: "40px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>
                Payment History
              </h2>
              {!collapsed && (
                <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "3px 0 0" }}>
                  {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                  {" · Click "}
                  <span style={{ color: "#D97706", fontWeight: 600 }}>Pending</span>
                  {" / "}
                  <span style={{ color: "#EF4444", fontWeight: 600 }}>Failed</span>
                  {" rows to retry"}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Filter — only when expanded */}
            {!collapsed && payments.length > 0 && (
              <div ref={filterRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setFilterOpen((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    padding: "7px 13px", borderRadius: "9px", cursor: "pointer",
                    background: hasFilter ? "#EDE9FE" : "#fff",
                    border: `1px solid ${hasFilter ? "#C4B5FD" : "#E5E7EB"}`,
                    fontSize: "13px", fontWeight: 600,
                    color: hasFilter ? "#6D28D9" : "#374151",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "all 0.15s",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                    <line x1="11" y1="18" x2="13" y2="18"/>
                  </svg>
                  Filter
                  {hasFilter && (
                    <span style={{ background: "#7C3AED", color: "#fff", borderRadius: "10px", padding: "0 6px", fontSize: "11px", fontWeight: 700 }}>1</span>
                  )}
                </button>

                {filterOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300,
                    background: "#fff", border: "1px solid #E5E7EB", borderRadius: "12px",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12)", padding: "16px 18px", minWidth: "200px",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "10px" }}>
                      Filter by Status
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: hasFilter ? "12px" : 0 }}>
                      {statuses.map((s) => (
                        <button key={s} onClick={() => { setActiveStatus(s); setFilterOpen(false); }} style={{
                          padding: "4px 12px", borderRadius: "20px", cursor: "pointer",
                          fontSize: "12px", fontWeight: 600,
                          background: activeStatus === s ? "#7C3AED" : "#F3F4F6",
                          color: activeStatus === s ? "#fff" : "#374151",
                          border: "none", transition: "all 0.12s",
                        }}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {hasFilter && (
                      <button onClick={() => { setActiveStatus("All"); setFilterOpen(false); }} style={{
                        width: "100%", padding: "7px", borderRadius: "8px",
                        background: "#FFF1F2", border: "1px solid #FECDD3",
                        color: "#BE123C", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                      }}>
                        Clear filter
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Minimize / Expand toggle */}
            <button
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand payment history" : "Minimise payment history"}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "7px 13px", borderRadius: "9px", cursor: "pointer",
                background: collapsed ? "#EDE9FE" : "#fff",
                border: `1px solid ${collapsed ? "#C4B5FD" : "#E5E7EB"}`,
                fontSize: "12px", fontWeight: 600,
                color: collapsed ? "#6D28D9" : "#6B7280",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)", transition: "all 0.15s",
              }}
            >
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: "transform 0.2s", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              {collapsed ? "Expand" : "Minimise"}
            </button>
          </div>
        </div>

        {/* ── Table (hidden when collapsed) ── */}
        {!collapsed && (
          <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 2.2fr 1fr 1fr", padding: "11px 20px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["Date & Time", "Description", "Amount", "Status"].map((h) => (
                <span key={h} style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {h}
                </span>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "14px" }}>
                {payments.length === 0 ? "No payment history yet." : "No transactions match your filters."}
              </div>
            ) : (
              filtered.map((p, i) => {
                const st = STATUS_STYLE[p.status] || STATUS_STYLE.Paid;
                const isRetryable   = p.status === "Pending" || p.status === "Failed";
                const isDeletedChild = p.childDeleted && p.status === "Paid";

                // Row background: red tint if child deleted, amber tint on hover for retryable
                const rowBaseBg = isDeletedChild ? "#FFF5F5" : "transparent";
                const rowBorder = isDeletedChild ? "1px solid #FEE2E2" : (i < filtered.length - 1 ? "1px solid #F3F4F6" : "none");

                return (
                  <div
                    key={p.id}
                    onClick={() => isRetryable && setRetryTarget(p)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 2.2fr 1fr 1fr",
                      padding: "13px 20px",
                      borderBottom: rowBorder,
                      alignItems: "center",
                      background: rowBaseBg,
                      transition: "background 0.12s",
                      cursor: isRetryable ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (isRetryable) e.currentTarget.style.background = "#FFFBEB";
                      else if (isDeletedChild) e.currentTarget.style.background = "#FEE2E2";
                      else e.currentTarget.style.background = "#FAFAFA";
                    }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBaseBg; }}
                  >
                    {/* Date + time */}
                    <div>
                      <span style={{ fontSize: "13px", color: isDeletedChild ? "#B91C1C" : "#374151", fontWeight: 500 }}>
                        {p.date.split(",")[0]}
                        {/* day/month/year part */}
                        {p.date.includes(",") ? "" : ""}
                      </span>
                      <span style={{ fontSize: "11px", color: isDeletedChild ? "#EF9999" : "#9CA3AF", display: "block", marginTop: "1px" }}>
                        {/* time part — everything after last comma */}
                        {p.date.includes(" at ") ? p.date.split(" at ")[1] : p.date.split(", ").slice(1).join(", ")}
                      </span>
                    </div>

                    {/* Description + child name */}
                    <div>
                      <span style={{ fontSize: "13px", color: isDeletedChild ? "#B91C1C" : "#374151" }}>
                        {p.description}
                      </span>
                      {isDeletedChild ? (
                        <span style={{ fontSize: "11px", color: "#EF4444", display: "block", marginTop: "2px", fontWeight: 600 }}>
                          ⚠ Child account deleted
                        </span>
                      ) : p.child && p.child !== "—" ? (
                        <span style={{ fontSize: "11px", color: "#9CA3AF", display: "block", marginTop: "1px" }}>
                          {p.child}
                        </span>
                      ) : null}
                    </div>

                    {/* Amount */}
                    <span style={{ fontSize: "14px", fontWeight: 700, color: isDeletedChild ? "#B91C1C" : "#111827" }}>
                      {p.amount}
                    </span>

                    {/* Status badge — clean text only, no symbol */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "4px 11px", borderRadius: "20px",
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                        display: "inline-block", letterSpacing: "0.02em",
                      }}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Collapsed pill summary */}
        {collapsed && (
          <div style={{
            background: "#fff", borderRadius: "10px", border: "1px solid #E5E7EB",
            padding: "12px 20px", display: "flex", alignItems: "center", gap: "14px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <span style={{ fontSize: "13px", color: "#6B7280" }}>
              {payments.length} total transaction{payments.length !== 1 ? "s" : ""}
            </span>
            {["Paid", "Pending", "Failed", "Refunded", "Free"].map((s) => {
              const count = payments.filter((p) => p.status === s).length;
              if (!count) return null;
              const st = STATUS_STYLE[s] || STATUS_STYLE.Paid;
              return (
                <span key={s} style={{
                  fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px",
                  background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                }}>
                  {count} {s}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Retry confirmation modal */}
      {retryTarget && (
        <RetryConfirmModal
          payment={retryTarget}
          loading={retryLoading}
          error={retryError}
          onConfirm={handleRetryConfirm}
          onCancel={() => { setRetryTarget(null); setRetryError(null); setRetryLoading(false); }}
        />
      )}
    </>
  );
}

// ─── Loading Overlay ────────────────────────────────────────────
function LoadingOverlay() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "3px solid #EDE9FE",
            borderTopColor: "#7C3AED",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <span style={{ fontSize: "13px", color: "#7C3AED", fontWeight: 600 }}>
          Loading…
        </span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MODAL COMPONENTS
// ═══════════════════════════════════════════════════════════════

/** Shared modal backdrop + card */
function ModalOverlay({ onClose, children, maxWidth = "480px" }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          width: "100%",
          maxWidth,
          padding: "28px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #D1D5DB",
  borderRadius: "9px",
  padding: "9px 12px",
  fontSize: "14px",
  color: "#111827",
  outline: "none",
  background: "#fff",
};

const LABEL_STYLE = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "5px",
};

const YEAR_OPTIONS = [3, 4, 5, 6, 7, 8, 9];

// ── AddChildModal ──────────────────────────────────────────────
function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName, setDisplayName]               = useState("");
  const [username, setUsername]                     = useState("");
  const [yearLevel, setYearLevel]                   = useState("");
  const [pin, setPin]                               = useState("");
  const [confirmPin, setConfirmPin]                 = useState("");
  const [error, setError]                           = useState("");
  const [usernameStatus, setUsernameStatus]         = useState(null);
  const [consent, setConsent]                       = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [showConsentPolicy, setShowConsentPolicy]   = useState(false);

  // Live username availability check
  useEffect(() => {
    let cancelled = false;
    const clean = username.trim().toLowerCase();
    if (!clean || clean.length < 3 || !/^[a-z0-9_]+$/.test(clean)) {
      setUsernameStatus(null);
      return;
    }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsername(clean);
        if (!cancelled)
          setUsernameStatus(res?.available ? "available" : "taken");
      } catch {
        if (!cancelled) setUsernameStatus("error");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const cleanName = displayName.trim();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanName) return setError("Please enter child name");
    if (!cleanUser) return setError("Please enter username");
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUser))
      return setError("Username: 3–20 chars, letters/numbers/underscore only");
    if (!yearLevel) return setError("Please select a year level");
    if (!pin || !/^\d{6}$/.test(pin))
      return setError("PIN must be exactly 6 digits");
    if (pin !== confirmPin) return setError("PINs do not match");
    if (usernameStatus === "taken")
      return setError("Username is already taken");
    if (!consent)
      return setError("Please provide parental consent to continue");

    await onAdd({
      display_name: cleanName,
      username: cleanUser,
      year_level: Number(yearLevel),
      pin,
      parental_consent: consent,
      email_notifications: emailNotifications,
    });
  };

  if (showConsentPolicy) {
    return (
      <ModalOverlay onClose={() => setShowConsentPolicy(false)} maxWidth="560px">
        <ChildDataConsentPolicy onClose={() => setShowConsentPolicy(false)} />
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>
          Add Child
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "#9CA3AF",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Display Name */}
          <div>
            <label style={LABEL_STYLE}>Child's Display Name</label>
            <input
              style={INPUT_STYLE}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Aarav"
            />
          </div>

          {/* Username */}
          <div>
            <label style={LABEL_STYLE}>Username</label>
            <div style={{ position: "relative" }}>
              <input
                style={{
                  ...INPUT_STYLE,
                  borderColor:
                    usernameStatus === "taken"
                      ? "#EF4444"
                      : usernameStatus === "available"
                      ? "#10B981"
                      : "#D1D5DB",
                  paddingRight: "90px",
                }}
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))
                }
                placeholder="e.g. aarav_k"
              />
              {usernameStatus && (
                <span
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "11px",
                    fontWeight: 700,
                    color:
                      usernameStatus === "checking"
                        ? "#9CA3AF"
                        : usernameStatus === "available"
                        ? "#059669"
                        : "#EF4444",
                  }}
                >
                  {usernameStatus === "checking"
                    ? "checking…"
                    : usernameStatus === "available"
                    ? "✓ available"
                    : "✗ taken"}
                </span>
              )}
            </div>
          </div>

          {/* Year Level */}
          <div>
            <label style={LABEL_STYLE}>Year Level</label>
            <select
              style={{ ...INPUT_STYLE, appearance: "auto" }}
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
            >
              <option value="">Select year level</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>

          {/* PIN */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>PIN (6 digits)</label>
              <input
                style={INPUT_STYLE}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Confirm PIN</label>
              <input
                style={{
                  ...INPUT_STYLE,
                  borderColor:
                    confirmPin && pin !== confirmPin ? "#EF4444" : "#D1D5DB",
                }}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, ""))
                }
                placeholder="••••••"
              />
            </div>
          </div>

          {/* Email Notifications */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            <span style={{ fontSize: "13px", color: "#374151" }}>
              Send me email notifications about this child's progress
            </span>
          </label>

          {/* Consent */}
          <div
            style={{
              background: "#FFF7ED",
              border: "1px solid #FDE68A",
              borderRadius: "10px",
              padding: "12px 14px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: "2px", flexShrink: 0 }}
              />
              <span style={{ fontSize: "12px", color: "#374151" }}>
                I have read and agree to the{" "}
                <span
                  onClick={() => setShowConsentPolicy(true)}
                  style={{
                    color: "#7C3AED",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Child Data Collection Policy
                </span>{" "}
                and consent to the collection and use of my child's information.
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "#FFF1F2",
                border: "1px solid #FECDD3",
                borderRadius: "9px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "#BE123C",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "9px",
                background: "#F3F4F6",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                color: "#374151",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "9px",
                background: loading ? "#A78BFA" : "#7C3AED",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {loading ? "Adding…" : "Add Child"}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── EditChildModal ─────────────────────────────────────────────
function EditChildModal({ child, onClose, onSave, loading }) {
  const [displayName, setDisplayName] = useState(
    child.display_name || child.name || ""
  );
  const [yearLevel, setYearLevel] = useState(
    String(child.year_level || "")
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changePin, setChangePin] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const cleanName = displayName.trim();
    if (!cleanName) return setError("Display name cannot be empty");
    if (!yearLevel) return setError("Please select a year level");

    const updates = {};
    if (cleanName !== (child.display_name || child.name || ""))
      updates.display_name = cleanName;
    const newYL = Number(yearLevel);
    const oldYL = Number(child.year_level || 0);
    if (newYL !== oldYL) updates.year_level = newYL;
    if (changePin) {
      if (!pin || !/^\d{6}$/.test(pin))
        return setError("PIN must be exactly 6 digits");
      if (pin !== confirmPin) return setError("PINs do not match");
      updates.pin = pin;
    }
    if (Object.keys(updates).length === 0)
      return setError("No changes to save");

    await onSave(child._id, updates);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>
          Edit Child
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "#9CA3AF",
          }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div>
            <label style={LABEL_STYLE}>Display Name</label>
            <input
              style={INPUT_STYLE}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Aarav"
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Username (read-only)</label>
            <input
              style={{ ...INPUT_STYLE, background: "#F9FAFB", color: "#9CA3AF" }}
              value={child.username || ""}
              readOnly
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Year Level</label>
            <select
              style={{ ...INPUT_STYLE, appearance: "auto" }}
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
            >
              <option value="">Select year level</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>

          {/* Change PIN toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={changePin}
              onChange={(e) => setChangePin(e.target.checked)}
            />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
              Change PIN
            </span>
          </label>

          {changePin && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div>
                <label style={LABEL_STYLE}>New PIN (6 digits)</label>
                <input
                  style={INPUT_STYLE}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Confirm PIN</label>
                <input
                  style={{
                    ...INPUT_STYLE,
                    borderColor:
                      confirmPin && pin !== confirmPin ? "#EF4444" : "#D1D5DB",
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="••••••"
                />
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                background: "#FFF1F2",
                border: "1px solid #FECDD3",
                borderRadius: "9px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "#BE123C",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "9px",
                background: "#F3F4F6",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                color: "#374151",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "9px",
                background: loading ? "#A78BFA" : "#7C3AED",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── DeleteConfirmModal ─────────────────────────────────────────
function DeleteConfirmModal({ child, onCancel, onConfirm, loading }) {
  return (
    <ModalOverlay onClose={onCancel} maxWidth="400px">
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#FFF1F2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </div>
        <h3
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "#111827",
            margin: "0 0 8px",
          }}
        >
          Delete {child.name || "this child"}?
        </h3>
        <p
          style={{
            fontSize: "13px",
            color: "#6B7280",
            margin: "0 0 24px",
            lineHeight: 1.6,
          }}
        >
          This will permanently delete{" "}
          <strong>{child.name || "this child"}</strong>'s profile and all
          their quiz history. This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px",
              borderRadius: "9px",
              background: "#F3F4F6",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: "11px",
              borderRadius: "9px",
              background: loading ? "#FCA5A5" : "#EF4444",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── BundleSelectionModal ───────────────────────────────────────
function BundleSelectionModal({ child, bundles, loadingBundleId, onSelect, onClose }) {
  return (
    <ModalOverlay onClose={onClose} maxWidth="520px">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "#111827",
              margin: "0 0 3px",
            }}
          >
            Choose a Bundle
          </h3>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
            For {child.name} · {child.yearLevel}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "#9CA3AF",
          }}
        >
          ✕
        </button>
      </div>

      {bundles.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px",
            color: "#9CA3AF",
            fontSize: "14px",
          }}
        >
          No bundles available for {child.yearLevel}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {bundles.map((bundle) => {
            const isLoading = loadingBundleId === bundle.bundle_id;
            const alreadyOwned = (child.entitled_bundle_ids || []).includes(
              bundle.bundle_id
            );
            const price = `$${(Number(bundle.price_cents || 0) / 100).toFixed(
              2
            )} ${(bundle.currency || "AUD").toUpperCase()}`;

            return (
              <div
                key={bundle.bundle_id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  background: alreadyOwned ? "#F9FAFB" : "#fff",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: alreadyOwned ? "#9CA3AF" : "#111827",
                      marginBottom: "3px",
                    }}
                  >
                    {bundle.bundle_name}
                  </div>
                  {bundle.description && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#6B7280",
                        marginBottom: "6px",
                      }}
                    >
                      {bundle.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: alreadyOwned ? "#9CA3AF" : "#7C3AED",
                    }}
                  >
                    {price}
                  </div>
                </div>
                {alreadyOwned ? (
                  <span
                    style={{
                      padding: "8px 16px",
                      borderRadius: "9px",
                      background: "#F3F4F6",
                      color: "#9CA3AF",
                      fontSize: "13px",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    Already Owned ✓
                  </span>
                ) : (
                  <button
                    onClick={() => onSelect(bundle)}
                    disabled={isLoading}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "9px",
                      background: isLoading ? "#A7F3D0" : "#059669",
                      border: "none",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {isLoading ? "Redirecting…" : "Select & Pay"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalOverlay>
  );
}

// ── UserMenu dropdown ──────────────────────────────────────────
function UserMenu({ user, onLogout, onAddChild, onChildLogin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
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
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          {user.initials || "??"}
        </div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
          {user.name ? user.name.split(" ")[0] : "Account"}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            zIndex: 400,
            minWidth: "180px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #F3F4F6",
            }}
          >
            <div
              style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}
            >
              {user.name || "—"}
            </div>
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}>
              Parent Account
            </div>
          </div>

          {/* Add Child */}
          <button
            onClick={() => { setOpen(false); onAddChild?.(); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Add Child
          </button>

          {/* Child Login */}
          <button
            onClick={() => { setOpen(false); onChildLogin?.(); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Child Login
          </button>

          <div style={{ height: "1px", background: "#F3F4F6", margin: "4px 0" }} />

          <button
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "11px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: "#EF4444",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#FFF1F1")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "none")
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ROOT COMPONENT — Data + State + Layout
// ═══════════════════════════════════════════════════════════════

export default function ParentDashboard() {
  const navigate         = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { parentToken, parentProfile, logout } = useAuth();

  // ── Raw data state ──────────────────────────────────────────
  const [rawChildren, setRawChildren]   = useState([]);
  const [rawPayments, setRawPayments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // ── Modal state ─────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen]         = useState(false);
  const [editTarget, setEditTarget]                 = useState(null);  // raw child obj
  const [deleteTarget, setDeleteTarget]             = useState(null);  // raw child obj
  const [bundleModalChild, setBundleModalChild]     = useState(null);  // mapped child
  const [actionLoading, setActionLoading]           = useState(false);
  const [checkoutLoadingBundle, setCheckoutLoadingBundle] = useState(null);
  const [successSessionId, setSuccessSessionId]     = useState(null);
  const [isChildLoginModalOpen, setIsChildLoginModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding]         = useState(
    () => searchParams.get("onboarding") === "free-trial"
  );

  // ── Mapped / derived data ───────────────────────────────────
  const children = useMemo(() => rawChildren.map(mapChild), [rawChildren]);
  const payments = useMemo(() => rawPayments.map(mapPayment), [rawPayments]);

  const user = useMemo(() => {
    const name = parentProfile?.name || parentProfile?.email || "";
    const initials = name
      ? name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "??";
    return { name, initials };
  }, [parentProfile]);

  // ── Data loaders ────────────────────────────────────────────
  const loadChildren = useCallback(async () => {
    if (!parentToken) return;
    try {
      setLoading(true);
      const data = await fetchChildrenSummaries(parentToken);
      setRawChildren(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Failed to load children:", err);
      setError(err?.message || "Failed to load children");
    } finally {
      setLoading(false);
    }
  }, [parentToken]);

  const loadPayments = useCallback(async () => {
    if (!parentToken) return;
    try {
      const data = await fetchPurchaseHistory(parentToken);
      setRawPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load payments:", err);
      // Non-critical — silently fail
    }
  }, [parentToken]);

  useEffect(() => {
    loadChildren();
    loadPayments();
  }, [loadChildren, loadPayments]);

  // ── URL param side-effects ──────────────────────────────────
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;

    if (payment === "success") {
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        setSuccessSessionId(sessionId);
      } else {
        setError(null);
        // Soft success message (no modal needed)
      }
      loadChildren();
      loadPayments();
    }

    // Clean URL params
    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadChildren, loadPayments]);

  // ── CRUD handlers ───────────────────────────────────────────
  const handleAddChild = async (formData) => {
    try {
      setActionLoading(true);
      await createChild(parentToken, formData);
      setIsAddModalOpen(false);
      await loadChildren();
    } catch (err) {
      alert(err?.message || "Failed to add child");
    } finally {
      setActionLoading(false);
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
    }
  };

  const handleDeleteChild = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await deleteChild(parentToken, deleteTarget._id);
      setRawChildren((prev) =>
        prev.filter((c) => c._id !== deleteTarget._id)
      );
      setDeleteTarget(null);
    } catch (err) {
      alert(err?.message || "Failed to delete child");
    } finally {
      setActionLoading(false);
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
        alert(
          `${err.child_name || child.name} already has the "${
            err.bundle_name || bundle.bundle_name
          }" bundle.`
        );
        setBundleModalChild(null);
      } else {
        alert(err?.message || "Checkout failed. Please try again.");
      }
    } finally {
      setCheckoutLoadingBundle(null);
    }
  };

  // ── Navigation helpers ──────────────────────────────────────
  const handleViewChild = (child) => {
    navigate(
      `/child-dashboard?childId=${child._id || child.id}` +
        `&childName=${encodeURIComponent(child.name || "")}` +
        `&yearLevel=${child.year_level || ""}` +
        `&username=${encodeURIComponent(child.username || "")}`
    );
  };

  // ── Callback wiring ─────────────────────────────────────────
  //  onDelete in ChildCard passes child.id → find raw obj for confirm modal
  const handleDeleteRequest = (childId) => {
    const raw = rawChildren.find((c) => String(c._id) === String(childId));
    if (raw) setDeleteTarget(raw);
  };

  //  onEdit passes full mapped child → find raw obj for edit modal
  const handleEditRequest = (mappedChild) => {
    const raw = rawChildren.find(
      (c) => String(c._id) === String(mappedChild._id || mappedChild.id)
    );
    if (raw) setEditTarget(raw);
  };

  // ── practicePacks count ─────────────────────────────────────
  const practicePacks = children.reduce(
    (sum, c) => sum + (c.entitled_bundle_ids?.length || 0),
    0
  );

  // ── Error banner ────────────────────────────────────────────
  const firstName = user.name ? user.name.split(" ")[0] : "there";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}
    >
      {loading && <LoadingOverlay />}

      <DashboardHeader>
      <UserMenu
      user={user}
      onLogout={logout}
      onAddChild={() => setIsAddModalOpen(true)}
      onChildLogin={() => setIsChildLoginModalOpen(true)}
      />
      </DashboardHeader>

      {/* ── Main ───────────────────────────────────────────── */}
      <main
        style={{
          padding: "36px 48px",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: "#FFF1F2",
              border: "1px solid #FECDD3",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: "14px", color: "#BE123C", fontWeight: 600 }}>
              {error}
            </span>
            <button
              onClick={loadChildren}
              style={{
                background: "#BE123C",
                color: "#fff",
                border: "none",
                borderRadius: "7px",
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#111827",
                margin: 0,
              }}
            >
              Parent Dashboard
            </h1>
            <p style={{ fontSize: "13px", color: "#6B7280", margin: "5px 0 0" }}>
              Welcome back,{" "}
              <strong style={{ color: "#7C3AED" }}>{user.name || "—"}</strong>{" "}
              — manage children and access bundles
            </p>
          </div>

          <button
            onClick={() => navigate("/bundles")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: "10px",
              padding: "9px 16px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: "#374151",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "5px",
                background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            Practice Packs
            {practicePacks > 0 && (
              <span
                style={{
                  background: "#7C3AED",
                  color: "#fff",
                  borderRadius: "12px",
                  padding: "1px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {practicePacks}
              </span>
            )}
          </button>
        </div>

        {/* Stat Cards */}
        <div
          style={{
            display: "flex",
            gap: "20px",
            alignItems: "stretch",
            marginBottom: "40px",
          }}
        >
          <ChildrenCard   childList={children} />
          <QuizzesCard    childList={children} />
          <ScoresCard     childList={children} />
          <LastActiveCard childList={children} />
        </div>

        {/* Child Management */}
        <ChildManagementSection
          childList={children}
          onEdit={handleEditRequest}
          onDelete={handleDeleteRequest}
          onAddChild={() => setIsAddModalOpen(true)}
          onViewResults={handleViewChild}
          onFreeSample={handleViewChild}
          onBuyBundle={(child) => setBundleModalChild(child)}
        />

        {/* Payment History */}
        <PaymentHistory payments={payments} parentToken={parentToken} />
      </main>

      {/* ═══════════════════════════════════════════════════════
          MODALS
         ═══════════════════════════════════════════════════════ */}

      {isAddModalOpen && (
        <AddChildModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddChild}
          loading={actionLoading}
        />
      )}

      {editTarget && (
        <EditChildModal
          child={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEditChild}
          loading={actionLoading}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          child={{ name: deleteTarget.display_name || deleteTarget.username }}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteChild}
          loading={actionLoading}
        />
      )}

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
        />
      )}

      {successSessionId && (
        <PaymentSuccessModal
          sessionId={successSessionId}
          parentToken={parentToken}
          onClose={() => {
            setSuccessSessionId(null);
            loadChildren();
            loadPayments();
          }}
        />
      )}

      <QuickChildLoginModal
        isOpen={isChildLoginModalOpen}
        onClose={() => setIsChildLoginModalOpen(false)}
        childrenList={rawChildren}
      />

      {showOnboarding && (
        <FreeTrialOnboarding
          parentToken={parentToken}
          onComplete={() => {
            loadChildren();
            setShowOnboarding(false);
            const next = new URLSearchParams(searchParams);
            next.delete("onboarding");
            setSearchParams(next, { replace: true });
          }}
          onSkip={() => {
            setShowOnboarding(false);
            const next = new URLSearchParams(searchParams);
            next.delete("onboarding");
            setSearchParams(next, { replace: true });
          }}
        />
      )}
    </div>
  );
}
