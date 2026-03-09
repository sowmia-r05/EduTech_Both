import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchChildrenSummaries,
  createChild,
  updateChild,
  deleteChild,
  checkUsername,
} from "@/app/utils/api-children";
import { createCheckout } from "@/app/utils/api-payments";
import { BUNDLE_CATALOG } from "@/app/data/bundleCatalog";
import PaymentSuccessModal from "@/app/components/payments/PaymentSuccessModal";
import PurchaseHistory from "@/app/components/payments/PurchaseHistory";
import QuickChildLoginModal from "@/app/components/dashboardComponents/QuickChildLoginModal";
import FreeTrialOnboarding from "@/app/components/dashboardComponents/FreeTrialOnboarding";
import ChildDataConsentPolicy from "@/app/components/ChildDataConsentPolicy";
import ParentAvatarMenu from "@/app/components/ui/ParentAvatarMenu";
import PracticePacksButton from "@/app/components/ui/PracticePacksButton";

const formatAUD = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)} AUD`;

export default function ParentDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { parentToken, parentProfile, logout } = useAuth();

  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [paymentMessage, setPaymentMessage] = useState(null);
  const [bundleModalChild, setBundleModalChild] = useState(null);
  const [checkoutLoadingBundle, setCheckoutLoadingBundle] = useState(null);
  const [successSessionId, setSuccessSessionId] = useState(null);

  const [isChildLoginModalOpen, setIsChildLoginModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => searchParams.get("onboarding") === "free-trial"
  );

  // Handler: onboarding complete (child was created)
  const handleOnboardingComplete = useCallback((newChild) => {
    // Refresh children list
    loadChildren();  // or whatever your existing refresh function is called
    // (look for fetchChildrenSummaries or similar call in the component)
  }, []);

  // Handler: onboarding skipped
  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
    // Clean the URL param so it doesn't re-trigger on refresh
    searchParams.delete("onboarding");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadChildren = useCallback(async () => {
    if (!parentToken) return;
    try {
      setLoading(true);
      const data = await fetchChildrenSummaries(parentToken);
      setChildren(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Failed to load children:", err);
      setError(err?.message || "Failed to load children");
    } finally {
      setLoading(false);
    }
  }, [parentToken]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;

    if (payment === "success") {
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        setSuccessSessionId(sessionId);
      } else {
        setPaymentMessage({
          type: "success",
          text: "Payment successful! Bundle access will be reflected shortly.",
        });
      }
      loadChildren();
    } else if (payment === "cancelled") {
      setPaymentMessage({
        type: "warning",
        text: "Payment was cancelled. No charge was made.",
      });
    } else if (payment === "failed") {
      setPaymentMessage({
        type: "error",
        text: "Payment failed. Please try again or contact support.",
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadChildren]);

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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await deleteChild(parentToken, deleteTarget._id);
      setChildren((prev) => prev.filter((c) => c._id !== deleteTarget._id));
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
      setError(null);

      const result = await createCheckout(parentToken, {
        bundle_id: bundle.bundle_id,
        child_ids: [child._id],
      });

      if (!result?.checkout_url) {
        throw new Error("No checkout URL returned");
      }

      window.location.href = result.checkout_url;
    } catch (err) {
      if (err.code === "DUPLICATE_PURCHASE") {
        setError(
          `${err.child_name || child.name} already has the "${err.bundle_name || bundle.bundle_name}" bundle.`
        );
        setBundleModalChild(null);
      } else if (err.code === "CHECKOUT_IN_PROGRESS") {
        setError(
          `A checkout is already in progress for this bundle. Please complete or wait for it to expire.`
        );
      } else {
        setError(err?.message || "Failed to start checkout");
      }
    } finally {
      setCheckoutLoadingBundle(null);
    }
  };

  const handleViewChild = (child) => {
    const params = new URLSearchParams({
      childId: child._id,
      childName: child.name || child.display_name || child.username || "",
      yearLevel: String(child.year_level || child.yearLevel || ""),
      username: child.username || "",
    });
    navigate(`/child-dashboard?${params.toString()}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const formatLastActivity = (dateStr) => {
    if (!dateStr) return "No activity yet";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "No activity yet";

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  };



  const enhancedChildren = useMemo(() => {
    return (children || []).map((c) => {
      const quizCount =
        Number(c.quizCount ?? c.quiz_count ?? c.total_quizzes ?? 0) || 0;

      const averageScoreRaw =
        c.averageScore ?? c.average_score ?? c.avg_score ?? c.score ?? 0;
      const averageScore = Math.max(
        0,
        Math.min(100, Number(averageScoreRaw || 0))
      );

      const yearLevel = c.yearLevel ?? c.year_level ?? c.year ?? "";
      const lastActivity =
        c.lastActivity ??
        c.last_activity ??
        c.last_quiz_at ??
        c.updatedAt ??
        c.createdAt ??
        null;

      let status = String(c.status || "").toLowerCase();
      if (!status) status = c.has_active_bundle ? "active" : "trial";

      return {
        ...c,
        name: c.name || c.display_name || "Child",
        username: c.username || c.user_name || "student",
        yearLevel,
        year_level: Number(yearLevel || c.year_level || 0) || c.year_level,
        quizCount,
        averageScore,
        lastActivity,
        status,
      };
    });
  }, [children]);

  const totalQuizzes = useMemo(
    () =>
      enhancedChildren.reduce((sum, c) => sum + Number(c.quizCount || 0), 0),
    [enhancedChildren]
  );

  const avgScore = useMemo(() => {
    if (enhancedChildren.length === 0) return 0;
    const total = enhancedChildren.reduce(
      (sum, c) => sum + Number(c.averageScore || 0),
      0
    );
    return total / enhancedChildren.length;
  }, [enhancedChildren]);

  if (!parentToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md w-full text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            Please log in to continue
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Your session may have expired.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* TOP NAVIGATION */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-40">
        <KaiLogo />
        <div className="flex items-center gap-3">
          <button className="relative w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <ParentAvatarMenu
            onAddChild={() => setIsAddModalOpen(true)}
            onChildLogin={() => setIsChildLoginModalOpen(true)}
          />
        </div>
      </header>

      {/* MAIN CONTENT */}
        <main className="px-6 lg:px-10 py-8 space-y-5">
        {/* PAGE HEADER */}
        <section className="flex items-center justify-between">
          <div>
            <h2
              className="font-brand text-[26px] font-extrabold leading-tight"
              style={{
                background: "linear-gradient(135deg, #1e293b 30%, #6366f1)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Parent Dashboard
            </h2>
            <p className="flex items-center flex-wrap gap-1 text-sm mt-1.5 text-slate-400 font-medium">
              Welcome back,
              <span className="text-indigo-500 font-semibold">
                {parentProfile?.name ?? "there"}
              </span>
              <span className="text-slate-300">—</span>
              manage children and access bundles
            </p>
          </div>

          <PracticePacksButton />
        </section>

        <div className="max-w-7xl mx-auto space-y-3">
          {/* PAYMENT BANNER */}
          {paymentMessage && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                paymentMessage.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : paymentMessage.type === "warning"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {paymentMessage.text}
            </div>
          )}

          {/* ERROR BANNER */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-500">
              Loading children...
            </div>
          ) : (
            <>
              {/* KPI CARDS */}
              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <KPI label="Children"      value={enhancedChildren.length} enhancedChildren={enhancedChildren} />
              <KPI label="Total Quizzes" value={totalQuizzes}            enhancedChildren={enhancedChildren} />
              <ScoreCard                 avgScore={avgScore}             enhancedChildren={enhancedChildren} />
              <LastActiveCard                                            enhancedChildren={enhancedChildren} />
              </section>

              {/* EMPTY STATE */}
              {enhancedChildren.length === 0 && !error && (
                <div className="text-center py-16">
                  <p className="text-slate-500 text-lg">
                    No children added yet.
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    Click "+ Add Child" to create your first child profile.
                  </p>
                </div>
              )}

              {/* CHILD CARDS */}
              
                 <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {enhancedChildren.map((child) => (
                  <ChildCard
                    key={child._id}
                    child={child}
                    formatLastActivity={formatLastActivity}
                    onDelete={() => setDeleteTarget(child)}
                    onEdit={() => setEditTarget(child)}
                    onView={() => handleViewChild(child)}
                    onUpgrade={() =>
                      navigate(
                        `/bundles?year=${child.year_level || child.yearLevel}`
                      )
                    }
                    onFreeTrial={() =>
                      navigate(
                        `/free-trial?childId=${encodeURIComponent(
                          child._id
                        )}&childName=${encodeURIComponent(child.name || "")}`
                      )
                    }
                    onBuyBundle={() => setBundleModalChild(child)}
                  />
                ))}
              </section>
            </>
          )}
        </div>
        {/* PURCHASE HISTORY */}
        <PurchaseHistory parentToken={parentToken} />
      </main>

      {/* ═══════════════════════════════════════
          MODALS — all at the top level of the component
         ═══════════════════════════════════════ */}

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
          child={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          loading={actionLoading}
        />
      )}

      {bundleModalChild && (
        <BundleSelectionModal
          child={bundleModalChild}
          bundles={BUNDLE_CATALOG.filter(
            (bundle) =>
              Number(bundle.year_level) ===
                Number(
                  bundleModalChild.year_level || bundleModalChild.yearLevel
                ) && bundle.is_active
          )}
          loadingBundleId={checkoutLoadingBundle}
          onSelect={(bundle) => handleCheckout(bundleModalChild, bundle)}
          onClose={() => setBundleModalChild(null)}
        />
      )}

      {/* PAYMENT SUCCESS MODAL */}
      {successSessionId && (
        <PaymentSuccessModal
          sessionId={successSessionId}
          parentToken={parentToken}
          onClose={() => {
            setSuccessSessionId(null);
            loadChildren();
          }}
        />
      )}

      {/* QUICK CHILD LOGIN MODAL */}
      <QuickChildLoginModal
        isOpen={isChildLoginModalOpen}
        onClose={() => setIsChildLoginModalOpen(false)}
        childrenList={children}
      />

      {/* ═══ Free Trial Onboarding Wizard ═══ */}
      {showOnboarding && (
        <FreeTrialOnboarding
          parentToken={parentToken}
          onComplete={(newChild) => {
            loadChildren();  // your existing function that refreshes the children list
          }}
          onSkip={() => {
            setShowOnboarding(false);
            searchParams.delete("onboarding");
            setSearchParams(searchParams, { replace: true });
          }}
        />
      )}
      
    </div>
  );
}

/* ═══════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════ */

function KpiRing({ pct, color, label }) {
  const r = 16, cx = 20, cy = 20, sw = 3.5;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width="40" height="40" className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 8, fontWeight: 800, fill: "#1e293b", fontFamily: "inherit" }}>
        {label}
      </text>
    </svg>
  );
}

function KPI({ label, value, highlight, enhancedChildren = [] }) {
  const isChildren = label === "Children";
  const isQuizzes  = label === "Total Quizzes";

  /* ── CHILDREN ─────────────────────────────────────────── */
  if (isChildren) {
    const active  = enhancedChildren.filter(c => String(c.status || "").toLowerCase() === "active").length;
    const trial   = enhancedChildren.filter(c => String(c.status || "").toLowerCase() === "trial").length;
    const expired = enhancedChildren.filter(c => String(c.status || "").toLowerCase() === "expired").length;

    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
        <div className="p-4">

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow shadow-indigo-200 flex-shrink-0">
                <svg className="w-[17px] h-[17px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-indigo-500 tracking-[0.07em] uppercase leading-none">Children</p>
                <p className="text-[12px] text-slate-400 font-medium mt-0.5">Profiles registered</p>
              </div>
            </div>
            <span className="text-[32px] font-extrabold text-slate-900 leading-none tabular-nums">{value}</span>
          </div>

          <div className="h-px bg-slate-100 mb-3" />

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { count: active,  bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-400", tc: "text-emerald-700", label: "Active"   },
              { count: trial,   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-400",   tc: "text-amber-700",   label: "Trial"    },
              ...(expired > 0 ? [{ count: expired, bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-400", tc: "text-rose-600", label: "Expired" }] : []),
            ].map((s, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${s.bg} ${s.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                <span className={`text-[13px] font-bold ${s.tc}`}>{s.count}</span>
                <span className="text-[12px] text-slate-400 font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── QUIZZES ──────────────────────────────────────────── */
  if (isQuizzes) {
    const num      = Number(value) || 0;
    const perChild = enhancedChildren.map(c => ({
      name:  c.name || c.display_name || "Child",
      count: Number(c.quizCount || 0),
    }));
    const max = Math.max(...perChild.map(c => c.count), 1);

    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all">
        <div className="h-[3px] w-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
        <div className="p-4">

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow shadow-violet-200 flex-shrink-0">
                <svg className="w-[17px] h-[17px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-violet-500 tracking-[0.07em] uppercase leading-none">Quizzes</p>
                <p className="text-[12px] text-slate-400 font-medium mt-0.5">Total completed</p>
              </div>
            </div>
            <span className="text-[32px] font-extrabold text-slate-900 leading-none tabular-nums">{value}</span>
          </div>

          <div className="h-px bg-slate-100 mb-3" />

          <div className="flex flex-col gap-1.5">
            {perChild.length === 0
              ? <p className="text-[12px] text-slate-400">No quizzes yet</p>
              : perChild.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-[12px] text-slate-500 font-semibold w-14 truncate flex-shrink-0">{c.name}</span>
                  <div className="flex-1 h-[6px] bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full kpi-bar"
                      style={{ width: `${(c.count / max) * 100}%`, background: "linear-gradient(90deg,#7c3aed,#c026d3)" }}
                    />
                  </div>
                  <span className="text-[12px] font-bold text-slate-600 w-4 text-right flex-shrink-0">{c.count}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    );
  }

  /* ── AVERAGE SCORE — no ring, score in badge + label ─── */
  const scoreNum = parseFloat(String(value).replace("%", "")) || 0;

  const cfg =
    scoreNum === 0  ? { label: "No attempts yet",      grad: "from-slate-400 to-slate-500",   num: "#475569", top: "from-slate-400 to-slate-500",   tagBg: "#f8fafc", tagBorder: "#e2e8f0", tagText: "#64748b", barBg: "bg-slate-200" }
  : scoreNum < 15   ? { label: "Just getting started", grad: "from-blue-400 to-indigo-500",   num: "#1d4ed8", top: "from-blue-400 to-indigo-500",   tagBg: "#eff6ff", tagBorder: "#bfdbfe", tagText: "#1d4ed8", barBg: "bg-blue-100"  }
  : scoreNum < 50   ? { label: "Building foundations", grad: "from-amber-400 to-orange-500",  num: "#92400e", top: "from-amber-400 to-orange-500",  tagBg: "#fffbeb", tagBorder: "#fde68a", tagText: "#92400e", barBg: "bg-amber-100" }
  : scoreNum < 70   ? { label: "Making progress",      grad: "from-teal-400 to-emerald-500",  num: "#065f46", top: "from-teal-400 to-emerald-500",  tagBg: "#f0fdf4", tagBorder: "#6ee7b7", tagText: "#065f46", barBg: "bg-teal-100"  }
  : scoreNum < 85   ? { label: "Performing well",      grad: "from-emerald-400 to-green-500", num: "#14532d", top: "from-emerald-400 to-green-500", tagBg: "#f0fdf4", tagBorder: "#86efac", tagText: "#14532d", barBg: "bg-emerald-100"}
  :                   { label: "Excellent ✨",          grad: "from-green-400 to-teal-500",    num: "#064e3b", top: "from-green-400 to-teal-500",    tagBg: "#ecfdf5", tagBorder: "#6ee7b7", tagText: "#064e3b", barBg: "bg-green-100" };

  const pct = Math.min((scoreNum / 85) * 100, 100);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all">
      <div className={`h-[3px] w-full bg-gradient-to-r ${cfg.top}`} />
      <div className="p-4">

        {/* score + label on the left, "X% to go" pill on the right */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.07em] uppercase leading-none mb-1.5" style={{ color: cfg.tagText }}>
              Avg. Score
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-extrabold leading-none tabular-nums" style={{ color: cfg.num }}>
                {scoreNum}%
              </span>
              <span className="text-[12px] text-slate-400 font-medium">{cfg.label}</span>
            </div>
          </div>

          {/* Contextual pill — NOT a repeat of the number */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: cfg.tagBg, border: `1px solid ${cfg.tagBorder}` }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke={cfg.tagText} strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-[12px] font-bold" style={{ color: cfg.tagText }}>
              {scoreNum >= 85 ? "On target" : `${Math.max(0, 85 - scoreNum)}% to go`}
            </span>
          </div>
        </div>

        <div className="h-px bg-slate-100 mb-3" />
      </div>
    </div>
  );
}

function ThreeDotMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`
          w-8 h-8 rounded-lg flex items-center justify-center transition-all
          ${open
            ? "bg-indigo-50 border border-indigo-200 text-indigo-500"
            : "border border-transparent text-slate-400 hover:bg-slate-50 hover:border-slate-200 hover:text-slate-600"
          }
        `}
        title="More options"
      >
        {/* Horizontal three dots */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5"  cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+5px)] z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={{
            minWidth: 140,
            animation: "dropIn .12s ease both",
          }}
        >
          {/* Edit */}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit details
          </button>

          <div className="mx-3 h-px bg-slate-100" />

          {/* Delete */}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}


function ChildCard({
  child,
  onDelete,
  onEdit,
  onView,
  onUpgrade,
  onFreeTrial,
  onBuyBundle,
  formatLastActivity,
}) {
  const score = Number(child.averageScore || 0);
  const performanceColor =
    score >= 85
      ? "bg-emerald-500"
      : score >= 70
        ? "bg-amber-500"
        : "bg-rose-500";

  const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    trial: "bg-amber-100 text-amber-700",
    expired: "bg-rose-100 text-rose-700",
  };

  const statusLabels = {
    active: "Active",
    trial: "Trial",
    expired: "Expired",
  };

  const statusKey = String(child.status || "trial").toLowerCase();

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md relative cursor-pointer transition"
      onClick={onView}
    >
      {/* Top-right action buttons: Edit + Delete */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
          title="Edit child details"
        >
          Edit
        </button>
        <span className="text-slate-300">|</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-xs text-rose-600 hover:underline"
        >
          Delete
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-lg">
          {(child.name || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="font-medium text-slate-900 truncate">{child.name}</h3>
          <p className="text-xs text-slate-500 truncate">
            Year {child.yearLevel || child.year_level || "-"} &bull; @
            {child.username || "-"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            statusStyles[statusKey] || statusStyles.trial
          }`}
        >
          {statusLabels[statusKey] || "Trial"}
        </span>

        {statusKey === "trial" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBuyBundle();
            }}
            className="text-xs text-indigo-600 hover:underline"
          >
            Upgrade to Full Access →
          </button>
        )}

        {statusKey === "active" && (
          <span className="text-xs text-emerald-700">Bundle purchased ✓</span>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Performance</span>
          <span>{score}%</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${performanceColor} transition-all duration-500`}
            style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-600 space-y-1">
        <p>Quizzes: {child.quizCount || 0}</p>
        <p>Last Activity: {formatLastActivity(child.lastActivity)}</p>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex gap-2">
        {statusKey === "trial" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFreeTrial();
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-xs font-semibold hover:bg-indigo-50"
          >
             Free Sample Test
          </button>
        )}

        {statusKey !== "active" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBuyBundle();
            }}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            🛒 Buy Bundle
          </button>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              📊 View Results
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBuyBundle();
              }}
              className="flex-1 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-semibold hover:bg-emerald-50"
            >
              🛒 Buy Bundle
            </button>
          </>
        )}
      </div>
    </div>
  );
}

//KAI LOGO
function KaiLogo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-300/40" />
        <div className="absolute inset-0 rounded-xl flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
            {/* Three rising bars → performance growth */}
            <rect x="3"  y="15" width="3.5" height="5"  rx="1" fill="white" fillOpacity="0.6" />
            <rect x="8"  y="10" width="3.5" height="10" rx="1" fill="white" fillOpacity="0.8" />
            <rect x="13" y="5"  width="3.5" height="15" rx="1" fill="white" />
            {/* Gold star = achievement */}
            <circle cx="20" cy="5" r="2.5" fill="#fbbf24" />
          </svg>
        </div>
      </div>
      <div className="leading-none">
        <div className="font-brand text-[18px] font-bold tracking-tight shimmer-text">
          KAI Solutions
        </div>
        <div className="text-[10px] font-bold text-slate-400 tracking-[0.15em] uppercase mt-0.5">
          NAPLAN Prep
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   BUNDLE SELECTION MODAL
   ═══════════════════════════════════════ */

function BundleSelectionModal({
  child,
  bundles,
  loadingBundleId,
  onSelect,
  onClose,
}) {
  const purchasedBundleIds = child.entitled_bundle_ids || [];

  return (
    <ModalWrapper onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">
            Choose a Bundle for{" "}
            <span className="text-indigo-600">{child.name}</span>
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Year {child.year_level || child.yearLevel} bundles available
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 text-xl leading-none"
        >
          ✕
        </button>
      </div>

      {bundles.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">
          No bundles available for Year{" "}
          {child.year_level || child.yearLevel} yet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {bundles.map((bundle) => {
            const isLoading = loadingBundleId === bundle.bundle_id;
            const alreadyPurchased = purchasedBundleIds.includes(bundle.bundle_id);

            return (
              <div
                key={bundle.bundle_id}
                className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  alreadyPurchased
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">
                      {bundle.bundle_name}
                    </h4>
                    {alreadyPurchased && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Purchased
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {bundle.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bundle.subjects.map((subject) => (
                      <span
                        key={subject}
                        className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-5">
                  <span className="text-xl font-bold text-slate-900">
                    {formatAUD(bundle.price_cents)}
                  </span>

                  {alreadyPurchased ? (
                    <span className="px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-sm font-semibold cursor-not-allowed">
                      Already in Bundle ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelect(bundle)}
                      disabled={isLoading}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isLoading ? "Redirecting..." : "Select & Pay"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalWrapper>
  );
}

/* ═══════════════════════════════════════
   ADD CHILD MODAL
   ═══════════════════════════════════════ */

function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [consent, setConsent] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [showConsentPolicy, setShowConsentPolicy] = useState(false);

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
        if (!cancelled) {
          setUsernameStatus(res?.available ? "available" : "taken");
        }
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

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanDisplayName) return setError("Please enter child name");
    if (!cleanUsername) return setError("Please enter username");
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      return setError(
        "Username must be 3-20 chars (letters, numbers, underscore only)"
      );
    }
    if (!yearLevel) return setError("Please select year level");
    if (!pin || !/^\d{6}$/.test(pin))
      return setError("PIN must be exactly 6 digits");
    if (pin !== confirmPin) return setError("PINs do not match");
   if (usernameStatus === "taken")
      return setError("Username is already taken");
    if (!consent)
      return setError("Please provide parental consent to continue");

    await onAdd({
      display_name: cleanDisplayName,
      username: cleanUsername,
      year_level: Number(yearLevel),
      pin,
      parental_consent: consent,
      email_notifications: emailNotifications,
    });
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Add Child</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Child Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Aarav"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g., aarav_yr3"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm lowercase focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <div className="mt-1 text-xs">
            {usernameStatus === "checking" && (
              <span className="text-slate-500">Checking username...</span>
            )}
            {usernameStatus === "available" && (
              <span className="text-emerald-600">Username available ✓</span>
            )}
            {usernameStatus === "taken" && (
              <span className="text-rose-600">Username already taken</span>
            )}
            {usernameStatus === "error" && (
              <span className="text-amber-600">
                Could not verify username right now
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Year Level
          </label>
          <select
            value={yearLevel}
            onChange={(e) => setYearLevel(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Select year</option>
            <option value="3">Year 3</option>
            <option value="5">Year 5</option>
            <option value="7">Year 7</option>
            <option value="9">Year 9</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-700 mb-1">
              PIN (6 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>
        {/* ── Email Notifications (optional) ── */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3.5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-slate-600">
              Enable email notifications
              <span className="text-slate-400 ml-1">(optional)</span>
            </span>
            <div className="relative group ml-auto">
              <svg className="w-4 h-4 text-slate-400 hover:text-indigo-500 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-800 text-white text-[10px] leading-relaxed rounded-lg p-3 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p className="font-semibold mb-1">We'll send you:</p>
                <ul className="space-y-0.5 list-disc ml-3">
                  <li>Quiz completion scores</li>
                  <li>Weekly progress reports</li>
                  <li>Personalised learning tips</li>
                  <li>Platform updates</li>
                </ul>
                <p className="mt-1.5 text-slate-300">You can turn this off anytime from your dashboard.</p>
                <div className="absolute bottom-0 right-4 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-800"></div>
              </div>
            </div>
          </label>
        </div>

        {/* ── Parental Consent (required) ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-600 leading-relaxed">
              I have read and agree to the{" "}
             <button
                type="button"
                onClick={() => setShowConsentPolicy(true)}
                className="text-indigo-600 underline hover:text-indigo-700 font-medium text-[11px]"
              >
                Child Data Collection Policy
              </button>{" "}
              and consent to the collection and use of my child's information as described therein.
              <span className="text-red-500 ml-0.5">*</span>
            </span>
          </label>
        </div>

        

        {/* ── Consent Policy Modal ── */}
        {showConsentPolicy && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={() => setShowConsentPolicy(false)}
          >
            <div
              className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
                <h2 className="text-lg font-semibold text-indigo-600">
                  Child Data Collection Policy
                </h2>
                <button
                  type="button"
                  onClick={() => setShowConsentPolicy(false)}
                  className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                >
                  ✕
                </button>
              </div>
              <div className="px-6 py-6 overflow-y-auto flex-1 min-h-0">
                <ChildDataConsentPolicy />
              </div>
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setConsent(true);
                    setShowConsentPolicy(false);
                  }}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition"
                >
                  I Agree
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Adding..." : "Add Child"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

/* ═══════════════════════════════════════
   EDIT CHILD MODAL
   ═══════════════════════════════════════ */

function EditChildModal({ child, onClose, onSave, loading }) {
  const [displayName, setDisplayName] = useState(child.name || child.display_name || "");
  const [yearLevel, setYearLevel] = useState(
    String(child.year_level || child.yearLevel || "")
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changePin, setChangePin] = useState(false);
  const [error, setError] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(child.email_notifications || false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanDisplayName = displayName.trim();
    if (!cleanDisplayName) return setError("Display name cannot be empty");
    if (!yearLevel) return setError("Please select a year level");

    const updates = {};

    if (cleanDisplayName !== (child.name || child.display_name || "")) {
      updates.display_name = cleanDisplayName;
    }

    const newYL = Number(yearLevel);
    const oldYL = Number(child.year_level || child.yearLevel || 0);
    if (newYL !== oldYL) {
      updates.year_level = newYL;
    }

    if (changePin) {
      if (!pin || !/^\d{6}$/.test(pin)) return setError("PIN must be exactly 6 digits");
      if (pin !== confirmPin) return setError("PINs do not match");
      updates.pin = pin;
    }
    if (emailNotifications !== (child.email_notifications || false)) {
      updates.email_notifications = emailNotifications;
    }

    if (Object.keys(updates).length === 0) {
      return setError("No changes to save");
    }

    await onSave(child._id, updates);
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Edit Child</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Aarav"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {/* Username — read-only */}
        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Username
            <span className="text-slate-400 font-normal ml-1">(cannot be changed)</span>
          </label>
          <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed">
            @{child.username || "—"}
          </div>
        </div>

        {/* Year Level */}
        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Year Level
          </label>
          <select
            value={yearLevel}
            onChange={(e) => setYearLevel(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Select year level</option>
            <option value="3">Year 3</option>
            <option value="5">Year 5</option>
            <option value="7">Year 7</option>
            <option value="9">Year 9</option>
          </select>
        </div>

        {/* PIN — toggle to change */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-slate-700">PIN</label>
            <button
              type="button"
              onClick={() => {
                setChangePin(!changePin);
                setPin("");
                setConfirmPin("");
              }}
              className="text-xs text-indigo-600 hover:underline"
            >
              {changePin ? "Keep current PIN" : "Change PIN"}
            </button>
          </div>

          {changePin ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
          ) : (
            <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-400">
              ••••••
            </div>
          )}
        </div>
        {/* ── Email Notifications ── */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-slate-600">
              Enable email notifications
              <span className="text-slate-400 ml-1">(quiz results & progress reports)</span>
            </span>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

function formatAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function scoreColorClass(score) {
  if (score === 0) return { bar: "#cbd5e1", text: "text-slate-500",   textHex: "#64748b" };
  if (score < 50)  return { bar: "#fbbf24", text: "text-amber-700",   textHex: "#b45309" };
  if (score < 75)  return { bar: "#34d399", text: "text-emerald-700", textHex: "#065f46" };
  return                  { bar: "#6366f1", text: "text-indigo-700",  textHex: "#3730a3" };
}

/* ═══════════════════════════════════════════════════════════
   ScoreCard — replaces the old "Average Score" KPI

   What changed:
   - Removed the single progress-toward-85% bar (misleading when
     children have wildly different scores)
   - Now shows a per-child horizontal bar so parents see the
     actual spread (e.g. Tharun 62%, Krishna 8%)
   - Average shown as a small badge top-right — present but not
     the hero since it's not very meaningful on its own
   - A "leading child" callout at the bottom for a positive note
   ═══════════════════════════════════════════════════════════ */
function ScoreCard({ avgScore, enhancedChildren = [] }) {
  const perChild = enhancedChildren.map(c => ({
    name:  c.name || c.display_name || "Child",
    score: Number(c.averageScore || 0),
  }));

  const hasData = perChild.some(c => c.score > 0);
  const best    = [...perChild].sort((a, b) => b.score - a.score)[0];

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all">
      <div className="h-[3px] w-full bg-gradient-to-r from-sky-400 to-indigo-500" />
      <div className="p-4">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow shadow-sky-200 flex-shrink-0">
              <svg className="w-[17px] h-[17px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold text-sky-500 tracking-[0.07em] uppercase leading-none">Scores</p>
              <p className="text-[12px] text-slate-400 font-medium mt-0.5">Per child breakdown</p>
            </div>
          </div>

          {/* Avg badge — secondary, not the hero */}
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">avg</span>
            <span className="text-[28px] font-extrabold text-slate-900 leading-none tabular-nums">
              {Math.round(avgScore)}%
            </span>
          </div>
        </div>

        <div className="h-px bg-slate-100 mb-3" />

        {/* Per-child bars — the honest picture */}
        <div className="flex flex-col gap-2">
          {!hasData
            ? <p className="text-[12px] text-slate-400">No quiz attempts yet</p>
            : perChild.map((c, i) => {
                const col = scoreColorClass(c.score);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-slate-600 font-semibold">{c.name}</span>
                        {c.score === 0 && (
                          <span className="text-[10px] text-slate-400">No attempts</span>
                        )}
                      </div>
                      <span className={`text-[12px] font-bold ${col.text}`}>
                        {c.score > 0 ? `${c.score}%` : "—"}
                      </span>
                    </div>
                    <div className="h-[7px] bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full kpi-bar"
                        style={{
                          width:      c.score > 0 ? `${c.score}%` : "0%",
                          background: col.bar,
                        }}
                      />
                    </div>
                  </div>
                );
              })
          }
        </div>

        {/* "Leading child" callout */}
        {hasData && best && best.score > 0 && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-100">
            <span className="text-[11px] text-sky-700 font-bold">
              ⭐ {best.name} leading at {best.score}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LastActiveCard — 4th card using existing lastActivity data

   Why this is useful:
   - Parents can instantly see "Krishna hasn't practiced in 6 days"
   - Green = active recently, amber = 2-4 days, red = 5+ days or never
   - The X/total badge shows at a glance how many are actively practicing
   - "⚡ Some children haven't practiced recently" nudge appears
     automatically when anyone is overdue

   No new API data needed — enhancedChildren already has lastActivity.
   ═══════════════════════════════════════════════════════════ */
function LastActiveCard({ enhancedChildren = [] }) {
  const perChild = enhancedChildren
    .map(c => ({
      name:         c.name || c.display_name || "Child",
      lastActivity: c.lastActivity || null,
    }))
    .sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });

  const mostRecent    = perChild.find(c => c.lastActivity);
  const activeCount   = perChild.filter(c => c.lastActivity).length;
  const hasOverdue    = perChild.some(c => {
    if (!c.lastActivity) return true;
    return Math.floor((Date.now() - new Date(c.lastActivity)) / 86_400_000) > 4;
  });

  function urgency(dateStr) {
    if (!dateStr) return {
      bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-300",
      label: "Never", labelColor: "text-slate-400",
    };
    const days = Math.floor((Date.now() - new Date(dateStr)) / 86_400_000);
    if (days <= 1) return {
      bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-400",
      label: formatAgo(dateStr), labelColor: "text-emerald-700",
    };
    if (days <= 4) return {
      bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-400",
      label: formatAgo(dateStr), labelColor: "text-amber-700",
    };
    return {
      bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-400",
      label: formatAgo(dateStr), labelColor: "text-rose-600",
    };
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all">
      <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 to-sky-400" />
      <div className="p-4">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center shadow shadow-emerald-200 flex-shrink-0">
              <svg className="w-[17px] h-[17px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-500 tracking-[0.07em] uppercase leading-none">Last Active</p>
              <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                {mostRecent
                  ? `Last practice: ${formatAgo(mostRecent.lastActivity)}`
                  : "No activity yet"}
              </p>
            </div>
          </div>

          {/* X / total badge */}
          <div className="flex items-center gap-1.5">
            {mostRecent && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,.2)]" />
            )}
            <span className="text-[28px] font-extrabold text-slate-900 leading-none tabular-nums">
              {activeCount}<span className="text-[16px] text-slate-400 font-semibold">/{perChild.length}</span>
            </span>
          </div>
        </div>

        <div className="h-px bg-slate-100 mb-3" />

        {/* Per-child rows */}
        <div className="flex flex-col gap-2">
          {perChild.map((c, i) => {
            const u = urgency(c.lastActivity);
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${u.dot}`} />
                  <span className="text-[12px] text-slate-600 font-semibold">{c.name}</span>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${u.bg} ${u.border} ${u.labelColor}`}>
                  {u.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Overdue nudge */}
        {hasOverdue && (
          <div className="mt-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100">
            <span className="text-[11px] text-rose-600 font-bold">
              ⚡ Some children haven't practiced recently
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DELETE CONFIRM MODAL
   ═══════════════════════════════════════ */

function DeleteConfirmModal({ child, onCancel, onConfirm, loading }) {
  return (
    <ModalWrapper onClose={onCancel}>
      <h3 className="text-lg font-semibold text-slate-900">
        Delete {child.name || child.display_name}?
      </h3>
      <p className="text-sm text-slate-500 mt-2">
        This action cannot be undone.
      </p>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 border rounded-lg text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Delete"}
        </button>
      </div>
    </ModalWrapper>
  );
}

/* ═══════════════════════════════════════
   MODAL WRAPPER
   ═══════════════════════════════════════ */

function ModalWrapper({ children, onClose, maxWidth = "max-w-md" }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${maxWidth} rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()} >
        {children}
      </div>
    </div>
  );
}