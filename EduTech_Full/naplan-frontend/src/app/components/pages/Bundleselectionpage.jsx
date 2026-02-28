import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchBundles, createCheckout } from "@/app/utils/api-payments";
import { fetchChildren, createChild, checkUsername } from "@/app/utils/api-children";

/* ═══════════════════════════════════════════
   BUNDLE SELECTION PAGE
   - Shows free trial pack
   - Shows paid bundles from quiz_catalog
   - Lets parent select children + buy
   ✅ UPDATED: Multi-currency support (AUD/INR/USD)
═══════════════════════════════════════════ */

const YEAR_LABELS = { 3: "Year 3", 5: "Year 5", 7: "Year 7", 9: "Year 9" };

// ✅ Multi-currency formatting helper
const CURRENCY_CONFIG = {
  aud: { symbol: "$", label: "AUD" },
  inr: { symbol: "₹", label: "INR" },
  usd: { symbol: "$", label: "USD" },
};

function formatBundlePrice(priceCents, currency = "aud") {
  const cur = CURRENCY_CONFIG[(currency || "aud").toLowerCase()] || CURRENCY_CONFIG.aud;
  return `${cur.symbol}${(Number(priceCents || 0) / 100).toFixed(2)} ${cur.label}`;
}

export const MOCK_BUNDLES = [
  {
    bundle_id: "year3_full",
    bundle_name: "Year 3 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 3,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 12,
    price_cents: 4900,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
  {
    bundle_id: "year3_maths",
    bundle_name: "Year 3 Maths Only",
    description: "Focused Maths practice — 6 full-length tests",
    year_level: 3,
    subjects: ["Maths"],
    included_tests: 6,
    price_cents: 1900,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
  {
    bundle_id: "year5_full",
    bundle_name: "Year 5 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 5,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 14,
    price_cents: 5900,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
  {
    bundle_id: "year5_maths",
    bundle_name: "Year 5 Maths Only",
    description: "Focused Maths practice — 8 full-length tests",
    year_level: 5,
    subjects: ["Maths"],
    included_tests: 8,
    price_cents: 2400,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
  {
    bundle_id: "year7_full",
    bundle_name: "Year 7 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 7,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 16,
    price_cents: 6900,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
  {
    bundle_id: "year9_full",
    bundle_name: "Year 9 Full Pack",
    description: "All subjects — Reading, Writing, Maths & Conventions",
    year_level: 9,
    subjects: ["Reading", "Writing", "Maths", "Conventions"],
    included_tests: 16,
    price_cents: 6900,
    currency: "aud",
    is_active: true,
    is_mock: true,
  },
];

const YEAR_COLORS = {
  3: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    accent: "text-emerald-700",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
  5: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    accent: "text-sky-700",
    btn: "bg-sky-600 hover:bg-sky-700",
  },
  7: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    accent: "text-amber-700",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  9: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    accent: "text-violet-700",
    btn: "bg-violet-600 hover:bg-violet-700",
  },
};

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 inline-block"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.493-6.493a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function BundleSelectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { parentToken } = useAuth();

  const [bundles, setBundles] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [usingMockBundles, setUsingMockBundles] = useState(false);

  // ✅ Child select modal state
  const [childSelectBundle, setChildSelectBundle] = useState(null);
  const [addChildLoading, setAddChildLoading] = useState(false);

  // Pre-select year from query param (e.g. /bundles?year=3)
  useEffect(() => {
    const y = Number(searchParams.get("year"));
    if ([3, 5, 7, 9].includes(y)) setSelectedYear(y);
  }, [searchParams]);

  // Fetch bundles + children
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const [bundleData, childData] = await Promise.all([
          fetchBundles(),
          parentToken ? fetchChildren(parentToken) : Promise.resolve([]),
        ]);

        const apiBundles = Array.isArray(bundleData)
          ? bundleData.filter((bundle) => bundle?.is_active !== false)
          : [];

        if (!mounted) return;

        if (apiBundles.length > 0) {
          setBundles(apiBundles);
          setUsingMockBundles(false);
        } else {
          setBundles(MOCK_BUNDLES);
          setUsingMockBundles(true);
        }

        setChildren(Array.isArray(childData) ? childData : []);
      } catch (err) {
        console.error("Failed to load bundles:", err);
        if (!mounted) return;

        setBundles(MOCK_BUNDLES);
        setUsingMockBundles(true);
        setChildren([]);
        setError(err?.message || "Failed to load bundles");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [parentToken]);

  // Child years from parent profile
  const childYears = useMemo(() => {
    return [...new Set((children || []).map((c) => Number(c.year_level)).filter(Boolean))].sort(
      (a, b) => a - b
    );
  }, [children]);

  // Available years from bundles
  const availableYears = useMemo(() => {
    const bundleYears = [...new Set((bundles || []).map((b) => Number(b.year_level)).filter(Boolean))].sort(
      (a, b) => a - b
    );
    if (!parentToken || childYears.length === 0) return bundleYears;
    return bundleYears.filter((year) => childYears.includes(year));
  }, [bundles, parentToken, childYears]);

  // Filtered bundles
  const filteredBundles = useMemo(() => {
    if (selectedYear) {
      return (bundles || []).filter((b) => Number(b.year_level) === Number(selectedYear));
    }
    if (!parentToken || childYears.length === 0) return bundles || [];
    return (bundles || []).filter((b) => childYears.includes(Number(b.year_level)));
  }, [bundles, selectedYear, parentToken, childYears]);

  // Auto-select only year if exactly one child year
  useEffect(() => {
    if (selectedYear) return;
    if (childYears.length === 1) setSelectedYear(childYears[0]);
  }, [childYears, selectedYear]);

  // Children grouped by year level
  const childrenByYear = useMemo(() => {
    const map = {};
    (children || []).forEach((c) => {
      const y = Number(c.year_level);
      if (!y) return;
      if (!map[y]) map[y] = [];
      map[y].push(c);
    });
    return map;
  }, [children]);

  // ✅ Opens the child selection modal
  const handleBuy = (bundle) => {
    if (!parentToken) {
      navigate("/parent-login");
      return;
    }
    setChildSelectBundle(bundle);
  };

  // ✅ Called when parent confirms child selection in the modal
  const handleChildSelectedForPurchase = async (selectedChildIds) => {
    if (!childSelectBundle || selectedChildIds.length === 0) return;

    try {
      setCheckoutLoading(childSelectBundle.bundle_id);
      setError("");

      const result = await createCheckout(parentToken, {
        bundle_id: childSelectBundle.bundle_id,
        child_ids: selectedChildIds,
      });

      if (!result?.checkout_url) {
        throw new Error("No checkout URL returned");
      }

      window.location.href = result.checkout_url;
    } catch (err) {
      console.error("Checkout failed:", err);
      setError(err?.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
      setChildSelectBundle(null);
    }
  };

  // ✅ Called when parent creates a new child from the modal
  const handleAddChildFromModal = async (formData) => {
    try {
      setAddChildLoading(true);
      await createChild(parentToken, formData);
      const updatedChildren = await fetchChildren(parentToken);
      setChildren(Array.isArray(updatedChildren) ? updatedChildren : []);
    } catch (err) {
      throw err;
    } finally {
      setAddChildLoading(false);
    }
  };

  const handleStartFreeTrial = () => {
    if (!parentToken) {
      navigate("/parent-login");
      return;
    }

    if (!children.length) {
      setError("Please add a child first before starting a free trial.");
      navigate("/parent-dashboard");
      return;
    }

    const preferredChild =
      (selectedYear
        ? children.find((c) => Number(c.year_level) === Number(selectedYear))
        : null) || children[0];

    if (!preferredChild?._id) {
      setError("Could not find a valid child profile for free trial.");
      return;
    }

    navigate(
      `/free-trial?childId=${encodeURIComponent(preferredChild._id)}&childName=${encodeURIComponent(
        preferredChild.name || preferredChild.display_name || ""
      )}`
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
              Bundles & Plans
            </h1>
            <p className="text-sm text-slate-500">
              Choose a year-level bundle and complete checkout
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/parent-dashboard")}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Parent Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {/* PAGE TITLE */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900">Choose a Plan</h2>
          <p className="text-slate-500 mt-2">
            Start with a free trial or unlock full NAPLAN practice with a bundle
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl text-center">
            {error}
            <button onClick={() => setError("")} className="ml-3 underline">
              Dismiss
            </button>
          </div>
        )}

        {/* MOCK NOTICE */}
        {usingMockBundles && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl text-center">
            Showing sample bundle catalog. Prices and subjects are mock data for local preview.
          </div>
        )}

        {/* FREE TRIAL CARD */}
        <section>
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-8 md:p-10 text-white shadow-xl">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/10 rounded-full" />

            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-medium mb-3 backdrop-blur-sm">
                  FREE
                </span>
                <h3 className="text-2xl md:text-3xl font-bold">Free Trial Pack</h3>
                <p className="mt-2 text-indigo-200 max-w-lg">
                  One full-length NAPLAN-style practice test with instant scoring and detailed
                  performance insights. No credit card required.
                </p>

                <div className="mt-4 flex flex-wrap gap-3 text-sm text-indigo-100">
                  <span className="flex items-center gap-1.5">
                    <CheckIcon /> 1 full practice test
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckIcon /> Instant scoring
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckIcon /> Performance breakdown
                  </span>
                </div>
              </div>

              <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-3">
                <div className="text-4xl font-extrabold">FREE</div>
                <button
                  onClick={handleStartFreeTrial}
                  className="px-6 py-3 rounded-xl bg-white text-indigo-700 font-semibold hover:bg-indigo-50 transition shadow-md"
                >
                  Start Free Trial
                </button>
                {!parentToken && (
                  <p className="text-xs text-indigo-200 text-center md:text-right">
                    Login required to assign trial to a child
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* YEAR FILTERS */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setSelectedYear(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                selectedYear == null
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              All Years
            </button>

            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  Number(selectedYear) === Number(year)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {YEAR_LABELS[year] || `Year ${year}`}
              </button>
            ))}
          </div>

          {parentToken && childYears.length > 0 && (
            <p className="text-center text-xs text-slate-500">
              Showing bundles for your children's year levels
              {selectedYear ? ` • filtered to ${YEAR_LABELS[selectedYear]}` : ""}
            </p>
          )}
        </section>

        {/* LOADING */}
        {loading ? (
          <div className="py-16 text-center text-slate-500">Loading bundles...</div>
        ) : (
          <>
            {/* BUNDLE GRID */}
            {filteredBundles.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                <p className="text-slate-700 font-medium">No bundles available</p>
                <p className="text-slate-500 text-sm mt-2">
                  Try another year level or check back later.
                </p>
              </div>
            ) : (
              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredBundles.map((bundle) => {
                  const colors = YEAR_COLORS[bundle.year_level] || {
                    bg: "bg-slate-50",
                    border: "border-slate-200",
                    accent: "text-slate-700",
                    btn: "bg-slate-700 hover:bg-slate-800",
                  };
                  const isLoading = checkoutLoading === bundle.bundle_id;
                  const bundleYear = Number(bundle.year_level);
                  const eligibleCount = (childrenByYear[bundleYear] || []).length;
                  const includedCount =
                    Number(bundle.included_tests || 0) ||
                    Number(bundle.flexiquiz_quiz_ids?.length || 0);

                  // ✅ Get currency config for display
                  const bundleCurrency = (bundle.currency || "aud").toLowerCase();
                  const curConfig = CURRENCY_CONFIG[bundleCurrency] || CURRENCY_CONFIG.aud;

                  return (
                    <div
                      key={bundle.bundle_id}
                      className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 shadow-sm hover:shadow-md transition flex flex-col`}
                    >
                      {/* Year badge */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.accent} bg-white/80`}
                        >
                          {YEAR_LABELS[bundle.year_level] || `Year ${bundle.year_level}`}
                        </span>
                        {bundle.is_mock && (
                          <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                            SAMPLE
                          </span>
                        )}
                      </div>

                      {/* Bundle name + description */}
                      <h3 className="text-lg font-bold text-slate-900">{bundle.bundle_name}</h3>
                      <p className="text-sm text-slate-500 mt-1">{bundle.description}</p>

                      {/* Subjects */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(bundle.subjects || []).map((subject) => (
                          <span
                            key={subject}
                            className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-slate-600 border border-slate-200"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>

                      {/* Test count + eligible children */}
                      <div className="mt-3 space-y-1">
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">{includedCount}</span> test
                          {includedCount !== 1 ? "s" : ""} included
                        </p>
                        {parentToken && (
                          <p className="text-xs text-slate-500">
                            Eligible children: {eligibleCount}
                          </p>
                        )}
                      </div>

                      <div className="flex-1" />

                      {/* ✅ Price + CTA — MULTI-CURRENCY */}
                      <div className="mt-5 pt-4 border-t border-slate-200/60">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <span className="text-3xl font-bold text-slate-900">
                              {curConfig.symbol}
                              {(Number(bundle.price_cents || 0) / 100).toFixed(2)}
                            </span>
                            <span className="text-sm text-slate-500 ml-1">
                              {curConfig.label}
                            </span>
                          </div>

                          <button
                            onClick={() => handleBuy(bundle)}
                            disabled={isLoading}
                            className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 ${colors.btn}`}
                          >
                            {isLoading ? (
                              <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Processing...
                              </span>
                            ) : (
                              "Buy Now"
                            )}
                          </button>
                        </div>

                        <p className="mt-2 text-[11px] text-slate-400">
                          {formatBundlePrice(bundle.price_cents, bundle.currency)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>

      {/* ✅ CHILD SELECT MODAL */}
      {childSelectBundle && (
        <ChildSelectModal
          bundle={childSelectBundle}
          children={children}
          parentToken={parentToken}
          onSelect={handleChildSelectedForPurchase}
          onClose={() => setChildSelectBundle(null)}
          onAddChild={handleAddChildFromModal}
          addChildLoading={addChildLoading}
          checkoutLoading={checkoutLoading === childSelectBundle.bundle_id}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CHILD SELECT MODAL
   Shows eligible children for the bundle's year level,
   lets parent select which ones, and offers inline child creation.
═══════════════════════════════════════════ */

function ChildSelectModal({
  bundle,
  children,
  parentToken,
  onSelect,
  onClose,
  onAddChild,
  addChildLoading,
  checkoutLoading,
}) {
  const bundleYear = Number(bundle.year_level);
  const eligibleChildren = (children || []).filter(
    (c) => Number(c.year_level) === bundleYear
  );

  const [selectedIds, setSelectedIds] = useState(() =>
    eligibleChildren
      .filter((c) => !(c.entitled_bundle_ids || []).includes(bundle.bundle_id))
      .map((c) => c._id)
  );
  const [showAddForm, setShowAddForm] = useState(false);

  const toggleChild = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleProceed = () => {
    if (selectedIds.length > 0) {
      onSelect(selectedIds);
    }
  };

  // ✅ Multi-currency price display in modal
  const bundleCurrency = (bundle.currency || "aud").toLowerCase();
  const curConfig = CURRENCY_CONFIG[bundleCurrency] || CURRENCY_CONFIG.aud;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Select Children</h3>
              <p className="text-indigo-200 text-sm mt-1">
                {bundle.bundle_name} — Year {bundleYear}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {eligibleChildren.length > 0 ? (
            <>
              <p className="text-sm text-slate-600">
                Select which Year {bundleYear} children should receive this bundle:
              </p>
              <div className="space-y-2">
                {eligibleChildren.map((child) => {
                  const isSelected = selectedIds.includes(child._id);
                  const alreadyHas = (child.entitled_bundle_ids || []).includes(
                    bundle.bundle_id
                  );

                  return (
                    <div
                      key={child._id}
                      onClick={() => !alreadyHas && toggleChild(child._id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        alreadyHas
                          ? "border-emerald-200 bg-emerald-50/50 cursor-not-allowed opacity-70"
                          : isSelected
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          alreadyHas
                            ? "border-emerald-400 bg-emerald-100"
                            : isSelected
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-slate-300"
                        }`}
                      >
                        {(isSelected || alreadyHas) && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Child info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {child.display_name || child.username}
                        </p>
                        <p className="text-xs text-slate-500">
                          @{child.username} • Year {child.year_level}
                        </p>
                      </div>

                      {alreadyHas && (
                        <span className="text-xs text-emerald-600 font-medium flex-shrink-0">
                          Already has this
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-slate-600 font-medium">
                No Year {bundleYear} children found
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Add a child with Year {bundleYear} to purchase this bundle.
              </p>
            </div>
          )}

          {/* Inline add child */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition"
            >
              + Add a Year {bundleYear} child
            </button>
          ) : (
            <InlineAddChildForm
              yearLevel={bundleYear}
              onAdd={async (formData) => {
                await onAddChild(formData);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
              loading={addChildLoading}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {selectedIds.length} child{selectedIds.length !== 1 ? "ren" : ""} ×{" "}
            <span className="font-semibold">
              {formatBundlePrice(bundle.price_cents, bundle.currency)}
            </span>
            {selectedIds.length > 1 && (
              <span className="ml-1 text-slate-500">
                = {formatBundlePrice(bundle.price_cents * selectedIds.length, bundle.currency)}
              </span>
            )}
          </p>
          <button
            onClick={handleProceed}
            disabled={selectedIds.length === 0 || checkoutLoading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {checkoutLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              "Proceed to Checkout"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INLINE ADD CHILD FORM
   Used inside ChildSelectModal to create a child without leaving.
═══════════════════════════════════════════ */

function InlineAddChildForm({ yearLevel, onAdd, onCancel, loading }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken"
  const [error, setError] = useState("");

  // Check username availability
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) {
      setUsernameStatus(null);
      return;
    }

    setUsernameStatus("checking");
    const timeout = setTimeout(async () => {
      try {
        const result = await checkUsername(u);
        setUsernameStatus(result?.available ? "available" : "taken");
      } catch {
        setUsernameStatus(null);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [username]);

  const handleSubmit = async () => {
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (usernameStatus === "taken") {
      setError("Username is already taken");
      return;
    }
    if (!pin || pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    try {
      await onAdd({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        year_level: yearLevel,
        pin,
      });
    } catch (err) {
      setError(err?.message || "Failed to create child");
    }
  };

  return (
    <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
      <h4 className="text-sm font-semibold text-slate-900">
        Add a Year {yearLevel} Child
      </h4>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg">{error}</p>
      )}

      <input
        type="text"
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      <div className="relative">
        <input
          type="text"
          placeholder="Username (min 3 chars)"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {usernameStatus === "checking" && (
          <span className="absolute right-3 top-2.5 text-xs text-slate-400">Checking...</span>
        )}
        {usernameStatus === "available" && (
          <span className="absolute right-3 top-2.5 text-xs text-emerald-600">✓ Available</span>
        )}
        {usernameStatus === "taken" && (
          <span className="absolute right-3 top-2.5 text-xs text-rose-600">✗ Taken</span>
        )}
      </div>

      <input
        type="password"
        placeholder="PIN (min 4 digits)"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create & Select"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-white transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}