/**
 * ParentDashboard.jsx — Purple Theme + UX Fixes
 *
 * ✅ All 4 stat cards unified in purple (#7C3AED)
 * ✅ "Open Dashboard" button with dashboard grid icon + purple gradient
 * ✅ EditChildModal: consent removed, only email notifications checkbox
 * ✅ AddChildModal: two checkboxes in a side-by-side grid (aligned)
 * ✅ Purple accent throughout (buttons, bars, badges, links, spinner)
 */

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChildAvatarMenu from "@/app/components/ui/ChildAvatarMenu";
import { useAuth } from "@/app/context/AuthContext";
import { fetchChildrenSummaries } from "@/app/utils/api-children";
import { createCheckout, fetchBundles } from "@/app/utils/api-payments";
import PaymentSuccessModal from "@/app/components/payments/PaymentSuccessModal";
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







// ═══════════════════════════════════════════════════════════════
//  TIER CONFIG — icons + colours per tier
// ═══════════════════════════════════════════════════════════════
const TIER_CONFIG = {
  A: {
    label: "Full Tests",
    color: "#7C3AED",
    bg: "#F5F3FF",
    border: "#DDD6FE",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  B: {
    label: "Topic — Standard",
    color: "#0284C7",
    bg: "#F0F9FF",
    border: "#BAE6FD",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
  },
  C: {
    label: "Topic — Hard",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
};

const YEAR_COLORS = {
  3:  { accent: "#7C3AED", light: "#F5F3FF", border: "#DDD6FE" },
  5:  { accent: "#0284C7", light: "#F0F9FF", border: "#BAE6FD" },
  7:  { accent: "#059669", light: "#F0FDF4", border: "#A7F3D0" },
  9:  { accent: "#D97706", light: "#FFFBEB", border: "#FDE68A" },
};

// ═══════════════════════════════════════════════════════════════
//  BUNDLE SELECTION PAGE
// ═══════════════════════════════════════════════════════════════
export default function BundleSelectionPage() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { parentToken, parentProfile, logout } = useAuth();

  const yearParam    = searchParams.get("year")    || "";
  const childIdParam = searchParams.get("childId") || "";

  const normalizeYear = (val) => {
    if (!val) return null;
    const n = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? null : n;
  };

  const [allBundles,      setAllBundles]      = useState([]);
  const [children,        setChildren]        = useState([]);
  // year param just pre-selects the tab — user can still switch
  const [selectedYear,    setSelectedYear]    = useState(yearParam ? Number(yearParam) : null);
  const [loadingBundles,  setLoadingBundles]  = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error,           setError]           = useState(null);
  const [successSessionId, setSuccessSessionId] = useState(null);

  const selectedChild = useMemo(
    () => children.find((c) => c._id === childIdParam || c.id === childIdParam) || null,
    [children, childIdParam]
  );

  const user = useMemo(() => {
    const firstName = (parentProfile?.firstName || "").trim();
    const lastName  = (parentProfile?.lastName  || "").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ")
      || parentProfile?.name || parentProfile?.email || "";
    const initials = name ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "??";
    return { name, initials };
  }, [parentProfile]);

  useEffect(() => {
    setLoadingBundles(true);
    fetchBundles()
      .then((data) => setAllBundles(Array.isArray(data) ? data : []))
      .catch((err) => setError(err?.message || "Failed to load bundles"))
      .finally(() => setLoadingBundles(false));
  }, []);

  useEffect(() => {
    if (!parentToken) return;
    fetchChildrenSummaries(parentToken)
      .then((data) => setChildren(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [parentToken]);

  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      const sid = searchParams.get("session_id");
      if (sid) setSuccessSessionId(sid);
    }
  }, [searchParams]);

  const visibleBundles = useMemo(() => {
    if (!selectedYear) return allBundles;
    return allBundles.filter((b) => normalizeYear(b.year_level) === selectedYear);
  }, [allBundles, selectedYear]);

  const byYear = useMemo(() => {
    const map = {};
    visibleBundles.forEach((b) => {
      const yr = normalizeYear(b.year_level) || "Other";
      if (!map[yr]) map[yr] = [];
      map[yr].push(b);
    });
    return map;
  }, [visibleBundles]);

  const handleCheckout = async (bundle) => {
    if (!selectedChild) {
      alert("Please go back and select a child to buy this bundle for.");
      navigate("/parent-dashboard");
      return;
    }
    try {
      setCheckoutLoading(bundle.bundle_id);
      const result = await createCheckout(parentToken, {
        bundle_id: bundle.bundle_id,
        child_ids: [selectedChild._id],
      });
      if (!result?.checkout_url) throw new Error("No checkout URL returned");
      window.location.href = result.checkout_url;
    } catch (err) {
      if (err.code === "DUPLICATE_PURCHASE") {
        alert(`${selectedChild.display_name || selectedChild.username} already owns "${bundle.bundle_name}".`);
      } else {
        alert(err?.message || "Checkout failed. Please try again.");
      }
    } finally {
      setCheckoutLoading(null);
    }
  };

  const YEAR_LEVELS = [3, 5, 7, 9];

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7FF", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes bsp-spin { to { transform: rotate(360deg); } }
        .bsp-card { transition: box-shadow 0.18s, transform 0.18s; }
        .bsp-card:hover { box-shadow: 0 8px 28px rgba(124,58,237,0.13); transform: translateY(-2px); }
        .bsp-year-tab { transition: background 0.15s, color 0.15s, border-color 0.15s; cursor: pointer; }
        .bsp-buy-btn { transition: opacity 0.15s, transform 0.1s; }
        .bsp-buy-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
      `}</style>

      {/* ── Topbar ── */}
      <DashboardHeader>
        <ChildAvatarMenu
          displayName={user.name}
          isParentViewing={true}
          hideBackToChild={true}
          onBackToParent={() => navigate("/parent-dashboard")}
        />
      </DashboardHeader>

      <main style={{ padding: "40px 48px", maxWidth: "1200px", margin: "0 auto" }}>

        {/* ── Hero header ── */}
        <div style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
          borderRadius: "20px", padding: "36px 40px", marginBottom: "36px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(124,58,237,0.25)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              {/* Book stack icon */}
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                </svg>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                NAPLAN Practice
              </span>
            </div>
            <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>
              Bundle Catalogue
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)", margin: 0 }}>
              {selectedChild
                ? `Purchasing for ${selectedChild.display_name || selectedChild.username} · Year ${normalizeYear(selectedChild.year_level)}`
                : "One-time purchase · No subscriptions · Instant access"}
            </p>
          </div>

          {/* Right: stats */}
          <div style={{ display: "flex", gap: "20px", flexShrink: 0 }}>
            {[
              { label: "Year Levels", value: "4" },
              { label: "Bundle Tiers", value: "3" },
              { label: "One-time", value: "Pay" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center", background: "rgba(255,255,255,0.15)", borderRadius: "14px", padding: "14px 20px" }}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>{value}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "2px" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tier legend ── */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap" }}>
          {Object.entries(TIER_CONFIG).map(([tier, cfg]) => (
            <div key={tier} style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: "10px", padding: "8px 14px",
            }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                {cfg.icon}
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tier {tier}</div>
                <div style={{ fontSize: "12px", color: "#6B7280" }}>{cfg.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Year filter tabs ── */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px", background: "#fff", padding: "6px", borderRadius: "14px", border: "1px solid #E5E7EB", width: "fit-content", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {[{ yr: null, label: "All Years" }, ...YEAR_LEVELS.map((yr) => ({ yr, label: `Year ${yr}` }))].map(({ yr, label }) => {
            const active = selectedYear === yr;
            const col = yr ? YEAR_COLORS[yr] : null;
            return (
              <button key={String(yr)} onClick={() => setSelectedYear(yr)} className="bsp-year-tab"
                style={{
                  padding: "8px 20px", borderRadius: "10px", border: "none",
                  background: active ? (col ? col.accent : PURPLE[600]) : "transparent",
                  color: active ? "#fff" : "#6B7280",
                  fontWeight: active ? 700 : 500, fontSize: "13px",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                }}
              >{label}</button>
            );
          })}
        </div>

        {error && (
          <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px", color: "#BE123C", fontWeight: 600, fontSize: "14px" }}>
            ⚠️ {error}
          </div>
        )}

        {loadingBundles ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "100px 0", gap: "16px" }}>
            <div style={{ width: "40px", height: "40px", border: `3px solid ${PURPLE[200]}`, borderTopColor: PURPLE[600], borderRadius: "50%", animation: "bsp-spin 0.7s linear infinite" }} />
            <p style={{ color: "#9CA3AF", fontSize: "14px", margin: 0 }}>Loading bundles…</p>
          </div>
        ) : visibleBundles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📦</div>
            <p style={{ color: "#6B7280", fontSize: "15px", fontWeight: 600 }}>No bundles available{selectedYear ? ` for Year ${selectedYear}` : ""}.</p>
          </div>
        ) : (
          Object.entries(byYear)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([year, yBundles]) => {
              const yCol = YEAR_COLORS[Number(year)] || { accent: PURPLE[600], light: PURPLE[50], border: PURPLE[200] };
              return (
                <div key={year} style={{ marginBottom: "44px" }}>
                  {/* Year section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: yCol.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 12px ${yCol.accent}40` }}>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>{year}</span>
                    </div>
                    <div>
                      <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#111827", margin: 0 }}>Year {year}</h2>
                      <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>{yBundles.length} bundle{yBundles.length !== 1 ? "s" : ""} available</p>
                    </div>
                    <div style={{ flex: 1, height: "1px", background: "#E5E7EB", marginLeft: "8px" }} />
                  </div>

                  {/* Bundle cards grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "18px" }}>
                    {yBundles.map((bundle) => {
                      const isLoading    = checkoutLoading === bundle.bundle_id;
                      const alreadyOwned = selectedChild
                        ? (selectedChild.entitled_bundle_ids || []).includes(bundle.bundle_id)
                        : false;
                      const price  = `$${(Number(bundle.price_cents || 0) / 100).toFixed(2)} ${(bundle.currency || "AUD").toUpperCase()}`;
                      const tCfg   = TIER_CONFIG[bundle.tier] || TIER_CONFIG.A;
                      const testCount = bundle.included_tests || bundle.quiz_count || 0;

                      return (
                        <div key={bundle.bundle_id} className="bsp-card" style={{
                          background: alreadyOwned ? "#FAFAFA" : "#fff",
                          border: `1.5px solid ${alreadyOwned ? "#E5E7EB" : tCfg.border}`,
                          borderRadius: "16px", padding: "24px",
                          display: "flex", flexDirection: "column", gap: "16px",
                          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                          opacity: alreadyOwned ? 0.85 : 1,
                        }}>
                          {/* Card header */}
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                            {/* Tier icon */}
                            <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: tCfg.bg, border: `1px solid ${tCfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {tCfg.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: tCfg.color, background: tCfg.bg, border: `1px solid ${tCfg.border}`, padding: "2px 8px", borderRadius: "99px" }}>
                                  Tier {bundle.tier}
                                </span>
                                {alreadyOwned && (
                                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#059669", background: "#D1FAE5", border: "1px solid #A7F3D0", padding: "2px 8px", borderRadius: "99px" }}>
                                    ✓ Owned
                                  </span>
                                )}
                              </div>
                              <h3 style={{ fontSize: "15px", fontWeight: 700, color: alreadyOwned ? "#9CA3AF" : "#111827", margin: 0, lineHeight: 1.3 }}>
                                {bundle.bundle_name}
                              </h3>
                            </div>
                          </div>

                          {/* Description */}
                          {bundle.description && (
                            <p style={{ fontSize: "13px", color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                              {bundle.description}
                            </p>
                          )}

                          {/* Meta chips */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {/* Test count */}
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#F3F4F6", borderRadius: "8px", padding: "4px 10px" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span style={{ fontSize: "12px", color: "#374151", fontWeight: 600 }}>{testCount} test{testCount !== 1 ? "s" : ""}</span>
                            </div>

                            {/* Subjects */}
                            {(bundle.subjects || []).map((s) => (
                              <div key={s} style={{ display: "flex", alignItems: "center", gap: "5px", background: tCfg.bg, border: `1px solid ${tCfg.border}`, borderRadius: "8px", padding: "4px 10px" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tCfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                                </svg>
                                <span style={{ fontSize: "12px", color: tCfg.color, fontWeight: 600 }}>{s}</span>
                              </div>
                            ))}
                          </div>

                          {/* Divider */}
                          <div style={{ height: "1px", background: "#F3F4F6" }} />

                          {/* Price + Buy */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontSize: "22px", fontWeight: 800, color: alreadyOwned ? "#9CA3AF" : "#111827", letterSpacing: "-0.5px" }}>
                                {price}
                              </div>
                              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>One-time payment</div>
                            </div>

                            {alreadyOwned ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "8px 14px" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                <span style={{ fontSize: "13px", fontWeight: 700, color: "#059669" }}>Owned</span>
                              </div>
                            ) : (
                              <button onClick={() => handleCheckout(bundle)} disabled={isLoading} className="bsp-buy-btn"
                                style={{
                                  display: "flex", alignItems: "center", gap: "6px",
                                  padding: "10px 22px", borderRadius: "11px",
                                  background: isLoading ? PURPLE[400] : `linear-gradient(135deg, ${PURPLE[600]}, ${PURPLE[700]})`,
                                  border: "none", cursor: isLoading ? "not-allowed" : "pointer",
                                  fontSize: "14px", fontWeight: 700, color: "#fff",
                                  boxShadow: isLoading ? "none" : "0 4px 14px rgba(124,58,237,0.35)",
                                }}>
                                {isLoading ? (
                                  <>
                                    <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "bsp-spin 0.7s linear infinite" }} />
                                    Loading…
                                  </>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                                      <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
                                    </svg>
                                    Buy Now
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
        )}
      </main>

      {successSessionId && (
        <PaymentSuccessModal sessionId={successSessionId} parentToken={parentToken}
          onClose={() => { setSuccessSessionId(null); navigate("/parent-dashboard"); }} />
      )}
    </div>
  );
}











