import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchChildrenSummaries,
  createChild,
  deleteChild,
  checkUsername,
} from "@/app/utils/api-children";
import { createCheckout } from "@/app/utils/api-payments";
import { BUNDLE_CATALOG } from "@/app/data/bundleCatalog";

const MOCK_BUNDLES = [
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 3,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    price_cents: 4900,
    is_active: true,
  },
  {
    bundle_id: "year3_maths",
    bundle_name: "Year 3 Maths Only",
    description: "Focused Maths practice — 6 full-length tests",
    year_level: 3,
    subjects: ["Maths"],
    price_cents: 1900,
    is_active: true,
  },
  {
    bundle_id: "year3_english",
    bundle_name: "Year 3 English Pack",
    description: "Reading, Writing & Conventions combined",
    year_level: 3,
    subjects: ["Reading", "Writing", "Conventions"],
    price_cents: 3500,
    is_active: true,
  },
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 5,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    price_cents: 5900,
    is_active: true,
  },
  {
    bundle_id: "year5_maths",
    bundle_name: "Year 5 Maths Only",
    description: "Focused Maths practice — 8 full-length tests",
    year_level: 5,
    subjects: ["Maths"],
    price_cents: 2400,
    is_active: true,
  },
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 7,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    price_cents: 6900,
    is_active: true,
  },
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 9,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    price_cents: 6900,
    is_active: true,
  },
];

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
  const [actionLoading, setActionLoading] = useState(false);

  const [paymentMessage, setPaymentMessage] = useState(null);
  const [bundleModalChild, setBundleModalChild] = useState(null);
  const [checkoutLoadingBundle, setCheckoutLoadingBundle] = useState(null);

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
      setPaymentMessage({
        type: "success",
        text: "Payment successful! Bundle access will be reflected shortly.",
      });
      loadChildren();
    } else if (payment === "cancelled") {
      setPaymentMessage({
        type: "warning",
        text: "Payment was cancelled.",
      });
    } else if (payment === "failed") {
      setPaymentMessage({
        type: "error",
        text: "Payment failed. Please try again.",
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("payment");
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
      setError(err?.message || "Failed to start checkout");
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
    () => enhancedChildren.reduce((sum, c) => sum + Number(c.quizCount || 0), 0),
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

      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10">
        <h1 className="text-lg font-semibold text-slate-900">KAI Solutions</h1>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-lg text-sm border border-slate-300 hover:bg-slate-100"
          >
            Back to Menu
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}

      <main className="px-6 lg:px-10 py-8 space-y-8">
        {/* PAGE HEADER */}

        <section className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
              Parent Dashboard
            </h2>
            <p className="text-sm text-slate-500">
              Welcome{parentProfile?.name ? `, ${parentProfile.name}` : ""} —
              manage children and access bundles
            </p>
          </div>

          <div className="flex items-center gap-2">
              <button
                  onClick={() => navigate("/bundles")}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Practice Packs
                </button> 

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                + Add Child
              </button>
            </div>
        </section>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {paymentMessage && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
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

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-500">
              Loading children...
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPI label="Children" value={enhancedChildren.length} />
                <KPI label="Total Quizzes" value={totalQuizzes} />
                <KPI
                  label="Average Score"
                  value={`${avgScore.toFixed(0)}%`}
                  highlight
                />
              </section>

              {enhancedChildren.length === 0 && !error && (
                <div className="text-center py-16">
                  <p className="text-slate-500 text-lg">
                    No children added yet.
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    Click “+ Add Child” to create your first child profile.
                  </p>
                </div>
              )}

              <section className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {enhancedChildren.map((child) => (
                  <ChildCard
                    key={child._id}
                    child={child}
                    formatLastActivity={formatLastActivity}
                    onDelete={() => setDeleteTarget(child)}
                    onView={() => handleViewChild(child)}
                    onUpgrade={() =>
                      navigate(`/bundles?year=${child.year_level || child.yearLevel}`)
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
        </main>

        {isAddModalOpen && (
          <AddChildModal
            onClose={() => setIsAddModalOpen(false)}
            onAdd={handleAddChild}
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
              Number(bundle.year_level) === Number(bundleModalChild.year_level || bundleModalChild.yearLevel) &&
                 bundle.is_active
                )}
            loadingBundleId={checkoutLoadingBundle}
            onSelect={(bundle) => handleCheckout(bundleModalChild, bundle)}
            onClose={() => setBundleModalChild(null)}
          />
        )}
      </main>
    </div>
  );
}

function KPI({ label, value, highlight }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          highlight ? "text-indigo-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChildCard({
  child,
  onDelete,
  onView,
  onUpgrade,
  onFreeTrial,
  onBuyBundle,
  formatLastActivity,
}) {
  const score = Number(child.averageScore || 0);
  const performanceColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-rose-500";

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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-4 right-4 text-xs text-rose-600 hover:underline"
      >
        Delete
      </button>

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
            🎯 Free Sample Test
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            📊 View Results
          </button>
        )}
      </div>
    </div>
  );
}

function BundleSelectionModal({ child, bundles, loadingBundleId, onSelect, onClose }) {
  return (
    <ModalWrapper onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">
            Choose a Bundle for <span className="text-indigo-600">{child.name}</span>
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
          No bundles available for Year {child.year_level || child.yearLevel} yet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {bundles.map((bundle) => {
            const isLoading = loadingBundleId === bundle.bundle_id;

            return (
              <div
                key={bundle.bundle_id}
                className="rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{bundle.bundle_name}</h4>
                  <p className="text-sm text-slate-500 mt-1">{bundle.description}</p>

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
                  <button
                    onClick={() => onSelect(bundle)}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isLoading ? "Redirecting..." : "Select & Pay"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalWrapper>
  );
}

function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null);

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
    if (!pin || !/^\d{4}$/.test(pin))
      return setError("PIN must be exactly 4 digits");
    if (pin !== confirmPin) return setError("PINs do not match");
    if (usernameStatus === "taken") return setError("Username is already taken");

    await onAdd({
      display_name: cleanDisplayName,
      username: cleanUsername,
      year_level: Number(yearLevel),
      pin,
    });
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Add Child</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Child Name</label>
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
          <label className="block text-sm text-slate-700 mb-1">Year Level</label>
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
              PIN (4 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="1234"
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
              maxLength={4}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="1234"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

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

function DeleteConfirmModal({ child, onCancel, onConfirm, loading }) {
  return (
    <ModalWrapper onClose={onCancel}>
      <h3 className="text-lg font-semibold text-slate-900">
        Delete {child.name || child.display_name}?
      </h3>
      <p className="text-sm text-slate-500 mt-2">This action cannot be undone.</p>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm">
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

function ModalWrapper({ children, onClose, maxWidth = "max-w-md" }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${maxWidth} rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}