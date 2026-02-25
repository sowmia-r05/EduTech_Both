// src/app/components/payments/PurchaseHistory.jsx
//
// Collapsible purchase history section for the Parent Dashboard.
// Fetches from GET /api/payments/history and displays in a clean table/list.

import { useState, useEffect } from "react";
import { fetchPurchaseHistory } from "@/app/utils/api-payments";

const formatAUD = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const STATUS_STYLES = {
  paid: {
    label: "Paid",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  refunded: {
    label: "Refunded",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  failed: {
    label: "Failed",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function ProvisionBadge({ provisioned }) {
  if (provisioned) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <svg
          className="w-3.5 h-3.5"
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
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      Setting up
    </span>
  );
}

export default function PurchaseHistory({ parentToken }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!parentToken) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const data = await fetchPurchaseHistory(parentToken);
        if (!mounted) return;
        setPurchases(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Failed to load purchase history");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [parentToken]);

  // Don't render anything if no purchases and not loading
  if (!loading && purchases.length === 0) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      {/* ─── Header (clickable to expand/collapse) ─── */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg
              className="w-4.5 h-4.5 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Purchase History
            </h3>
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading..."
                : `${purchases.length} purchase${purchases.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* ─── Expandable content ─── */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-5 pb-4">
          {loading ? (
            <div className="py-6 text-center">
              <div className="w-6 h-6 mx-auto border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-400 mt-2">
                Loading purchases...
              </p>
            </div>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="text-sm text-rose-600">{error}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {purchases.map((purchase) => (
                <div
                  key={purchase._id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {purchase.bundle_name || purchase.bundle_id}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDate(purchase.createdAt)}
                      {purchase.child_ids?.length > 0 &&
                        ` · ${purchase.child_ids.length} child${
                          purchase.child_ids.length > 1 ? "ren" : ""
                        }`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {purchase.status === "paid" && (
                      <ProvisionBadge provisioned={purchase.provisioned} />
                    )}
                    <StatusBadge status={purchase.status} />
                    <span className="text-sm font-semibold text-slate-900 min-w-[70px] text-right">
                      {formatAUD(purchase.amount_cents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}