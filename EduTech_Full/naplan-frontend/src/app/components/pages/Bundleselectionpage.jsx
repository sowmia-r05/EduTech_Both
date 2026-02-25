import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { fetchBundles, createCheckout } from "@/app/utils/api-payments";
import { fetchChildren } from "@/app/utils/api-children";

/* ═══════════════════════════════════════════
   BUNDLE SELECTION PAGE
   - Shows free trial pack
   - Shows paid bundles from quiz_catalog
   - Lets parent select children + buy
═══════════════════════════════════════════ */

const YEAR_LABELS = { 3: "Year 3", 5: "Year 5", 7: "Year 7", 9: "Year 9" };

const YEAR_COLORS = {
  3: { bg: "bg-emerald-50", border: "border-emerald-200", accent: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700" },
  5: { bg: "bg-sky-50", border: "border-sky-200", accent: "text-sky-700", btn: "bg-sky-600 hover:bg-sky-700" },
  7: { bg: "bg-amber-50", border: "border-amber-200", accent: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700" },
  9: { bg: "bg-violet-50", border: "border-violet-200", accent: "text-violet-700", btn: "bg-violet-600 hover:bg-violet-700" },
};

export default function BundleSelectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { parentToken } = useAuth();

  const [bundles, setBundles] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(null); // bundle_id being checked out
  const [selectedYear, setSelectedYear] = useState(null);

  // Pre-select year from query param (e.g. /bundles?year=3)
  useEffect(() => {
    const y = Number(searchParams.get("year"));
    if ([3, 5, 7, 9].includes(y)) setSelectedYear(y);
  }, [searchParams]);

  // Fetch bundles + children
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [bundleData, childData] = await Promise.all([
          fetchBundles(),
          parentToken ? fetchChildren(parentToken) : Promise.resolve([]),
        ]);
        setBundles(Array.isArray(bundleData) ? bundleData : []);
        setChildren(Array.isArray(childData) ? childData : []);
      } catch (err) {
        setError(err.message || "Failed to load bundles");
      } finally {
        setLoading(false);
      }
    })();
  }, [parentToken]);

  // Available years from bundles
  const availableYears = useMemo(() => {
    const years = [...new Set(bundles.map((b) => b.year_level))].sort((a, b) => a - b);
    return years;
  }, [bundles]);

  // Filtered bundles
  const filteredBundles = useMemo(() => {
    if (!selectedYear) return bundles;
    return bundles.filter((b) => b.year_level === selectedYear);
  }, [bundles, selectedYear]);

  // Children grouped by year level (for auto-selecting which children get a bundle)
  const childrenByYear = useMemo(() => {
    const map = {};
    children.forEach((c) => {
      const y = c.year_level;
      if (!map[y]) map[y] = [];
      map[y].push(c);
    });
    return map;
  }, [children]);

  // Handle checkout
  const handleBuy = async (bundle) => {
    if (!parentToken) {
      navigate("/parent-login");
      return;
    }

    // Find children matching the bundle year level
    const eligible = childrenByYear[bundle.year_level] || [];
    if (eligible.length === 0) {
      setError(
        `No children found for ${YEAR_LABELS[bundle.year_level]}. Please add a child with this year level first.`
      );
      return;
    }

    try {
      setCheckoutLoading(bundle.bundle_id);
      setError("");

      const result = await createCheckout(parentToken, {
        bundle_id: bundle.bundle_id,
        child_ids: eligible.map((c) => c._id),
      });

      if (result?.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      setError(err.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Handle free trial
  const handleFreeTrial = () => {
    navigate("/free-trial");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading bundles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10">
        <h1 className="text-lg font-semibold text-slate-900">KAI Solutions</h1>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/parent-dashboard")}
            className="px-4 py-2 rounded-lg text-sm border border-slate-300 hover:bg-slate-100"
          >
            Dashboard
          </button>
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

        {/* ══════════════════════════════════════ */}
        {/*  FREE TRIAL CARD                       */}
        {/* ══════════════════════════════════════ */}
        <section>
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-8 md:p-10 text-white shadow-xl">
            {/* Decorative circles */}
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
                  <span className="flex items-center gap-1.5">
                    <CheckIcon /> AI feedback (limited)
                  </span>
                </div>
              </div>

              <button
                onClick={handleFreeTrial}
                className="flex-shrink-0 bg-white text-indigo-700 px-8 py-3.5 rounded-xl text-base font-semibold hover:bg-indigo-50 transition shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*  YEAR LEVEL FILTER                     */}
        {/* ══════════════════════════════════════ */}
        {availableYears.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedYear(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                !selectedYear
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              All Years
            </button>
            {availableYears.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedYear === y
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {YEAR_LABELS[y]}
              </button>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════ */}
        {/*  PAID BUNDLE CARDS                     */}
        {/* ══════════════════════════════════════ */}
        {filteredBundles.length > 0 ? (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredBundles.map((bundle) => {
              const colors = YEAR_COLORS[bundle.year_level] || YEAR_COLORS[3];
              const eligible = childrenByYear[bundle.year_level] || [];
              const isLoading = checkoutLoading === bundle.bundle_id;

              return (
                <div
                  key={bundle.bundle_id}
                  className={`relative ${colors.bg} ${colors.border} border rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col`}
                >
                  {/* Year badge */}
                  <span
                    className={`inline-block self-start px-3 py-1 rounded-full text-xs font-semibold ${colors.accent} bg-white/80`}
                  >
                    {YEAR_LABELS[bundle.year_level]}
                  </span>

                  {/* Bundle name + description */}
                  <h3 className="mt-3 text-lg font-bold text-slate-900">
                    {bundle.bundle_name}
                  </h3>
                  {bundle.description && (
                    <p className="mt-1 text-sm text-slate-600">{bundle.description}</p>
                  )}

                  {/* Subjects */}
                  {bundle.subjects?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {bundle.subjects.map((s) => (
                        <span
                          key={s}
                          className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-slate-600 border border-slate-200"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quiz count */}
                  <p className="mt-3 text-xs text-slate-500">
                    {bundle.flexiquiz_quiz_ids?.length || 0} practice tests included
                  </p>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Price + CTA */}
                  <div className="mt-5 pt-4 border-t border-slate-200/50">
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-3xl font-bold text-slate-900">
                          ${(bundle.price_cents / 100).toFixed(2)}
                        </span>
                        <span className="text-sm text-slate-500 ml-1">AUD</span>
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
                        ) : eligible.length > 0 ? (
                          `Buy for ${eligible.length} child${eligible.length > 1 ? "ren" : ""}`
                        ) : (
                          "Buy Now"
                        )}
                      </button>
                    </div>

                    {/* Eligible children hint */}
                    {eligible.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        For: {eligible.map((c) => c.display_name || c.username).join(", ")}
                      </p>
                    )}
                    {eligible.length === 0 && parentToken && (
                      <p className="mt-2 text-xs text-amber-600">
                        No {YEAR_LABELS[bundle.year_level]} children added yet.{" "}
                        <button
                          onClick={() => navigate("/parent-dashboard")}
                          className="underline"
                        >
                          Add one
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500">No bundles available yet.</p>
            <p className="text-slate-400 text-sm mt-1">
              Check back soon — new practice packs are coming!
            </p>
          </div>
        )}

        {/* NOT LOGGED IN NUDGE */}
        {!parentToken && (
          <div className="text-center py-6">
            <p className="text-slate-500">
              Already have an account?{" "}
              <button
                onClick={() => navigate("/parent-login")}
                className="text-indigo-600 font-medium hover:underline"
              >
                Log in
              </button>{" "}
              to purchase bundles for your children.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Tiny check icon ── */
function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}