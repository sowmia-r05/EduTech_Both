// src/app/components/payments/PurchaseHistory.jsx
//
// Collapsible purchase history section for the Parent Dashboard.
// Fetches from GET /api/payments/history and displays in a clean table/list.
// ✅ Failed/Pending rows now show a distinct card with inline Retry button (like paid shows Active badge)

import { useState, useEffect } from "react";
import { fetchPurchaseHistory, retryPayment, cancelPayment } from "@/app/utils/api-payments";

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
  cancelled: {
    label: "Cancelled",
    bg: "bg-gray-100",
    text: "text-gray-500",
    dot: "bg-gray-400",
  },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function ProvisionBadge({ provisioned }) {
  if (provisioned) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
      <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      Setting up…
    </span>
  );
}

// ─── Inline action banner shown inside failed/pending rows ───────────────────
function RetryBanner({ purchase, onRetry }) {
  const isFailed = purchase.status === "failed";
  return (
    <div className={`mt-2.5 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 ${
      isFailed
        ? "bg-rose-50 border border-rose-200"
        : "bg-amber-50 border border-amber-200"
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        {isFailed ? (
          <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <p className={`text-xs font-medium ${isFailed ? "text-rose-700" : "text-amber-700"}`}>
          {isFailed
            ? "Payment failed — your access wasn't activated."
            : "Payment incomplete — checkout was not completed."}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRetry(purchase); }}
        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${
          isFailed
            ? "bg-rose-500 hover:bg-rose-600"
            : "bg-amber-500 hover:bg-amber-600"
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        Retry Payment
      </button>
    </div>
  );
}

// ─── Retry + Cancel modal ────────────────────────────────────────────────────
function RetryPaymentModal({ purchase, onConfirm, onCancel, loading, parentToken, onCancelled }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancelled, setCancelled] = useState(false);

  const childNames = purchase.child_ids
    ?.map((c) => typeof c === "object" ? c.display_name || c.username || "Child" : "Child")
    .filter(Boolean)
    .join(", ") || "your child";

  const handleCancelPayment = async () => {
    if (!purchase?._id || !parentToken) return;
    try {
      setCancelling(true);
      setCancelError(null);
      await cancelPayment(parentToken, purchase._id);
      setCancelled(true);
      setTimeout(() => {
        onCancelled?.(purchase._id);
        onCancel();
      }, 1200);
    } catch (err) {
      setCancelError(err?.message || "Failed to cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const isFailed = purchase.status === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">

        {/* Icon */}
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 ${isFailed ? "bg-rose-50" : "bg-amber-50"}`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isFailed ? "#EF4444" : "#D97706"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6"/><path d="M2.5 12a10 10 0 0117.8-6.3L21.5 8"/>
            <path d="M2.5 22v-6h6"/><path d="M21.5 12a10 10 0 01-17.8 6.3L2.5 16"/>
          </svg>
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-1">Retry Payment?</h3>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          {purchase.bundle_name || purchase.description}
        </p>
        <p className="text-sm text-slate-500 mb-1">
          {formatAUD(purchase.amount_cents)} AUD ·{" "}
          <span className={`font-semibold ${isFailed ? "text-rose-600" : "text-amber-600"}`}>
            {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
          </span>
        </p>
        {childNames && (
          <p className="text-xs text-slate-400 mb-4">For: {childNames}</p>
        )}

        {isFailed && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4 text-left">
            <p className="text-xs text-rose-700 font-medium">
              Your previous payment attempt failed. No charge was made. Click Retry to try again with a new secure checkout.
            </p>
          </div>
        )}

        <p className="text-xs text-slate-400 mb-6">
          You'll be taken to a secure payment page to complete this.
        </p>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={onCancel}
            disabled={loading || cancelling}
            className="py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || cancelling}
            className="py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Redirecting…
              </>
            ) : "Retry →"}
          </button>
        </div>

        {/* Cancel section */}
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-700 leading-tight">Don't want this anymore?</p>
            <p className="text-xs text-slate-400 mt-0.5">Permanently mark as cancelled.</p>
          </div>

          {cancelled ? (
            <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold flex-shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Cancelled
            </div>
          ) : (
            <button
              onClick={handleCancelPayment}
              disabled={cancelling || loading}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancelling ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Cancelling…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Cancel Payment
                </>
              )}
            </button>
          )}
        </div>

        {cancelError && (
          <p className="text-xs text-red-500 mt-2 text-center">{cancelError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function PurchaseHistory({ parentToken }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true); // default open so failed payments are immediately visible

  const [retryTarget, setRetryTarget] = useState(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError, setRetryError] = useState(null);

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
    return () => { mounted = false; };
  }, [parentToken]);

  const handleRetryConfirm = async () => {
    if (!retryTarget || !parentToken) return;
    try {
      setRetryLoading(true);
      setRetryError(null);
      const result = await retryPayment(parentToken, retryTarget._id);
      if (result?.ok && result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setRetryError("Unable to create checkout session. Please try again.");
        setRetryLoading(false);
      }
    } catch (err) {
      setRetryError(err?.message || "Something went wrong. Please try again.");
      setRetryLoading(false);
    }
  };

  const openRetry = (purchase) => {
    setRetryTarget(purchase);
    setRetryError(null);
  };

  const closeRetry = () => {
    setRetryTarget(null);
    setRetryError(null);
    setRetryLoading(false);
  };

  const isRetryable = (status) => status === "pending" 

  if (!loading && purchases.length === 0) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-AU", {
      day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  };

  // Count actionable purchases for the header badge
  const failedCount = purchases.filter((p) => isRetryable(p.status)).length;

  return (
    <>
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        {/* ─── Header ─── */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                Purchase History
                {/* Alert badge for actionable payments */}
                {failedCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {failedCount} needs action
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                {loading ? "Loading..." : `${purchases.length} purchase${purchases.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* ─── Expandable content ─── */}
        {isExpanded && (
          <div className="border-t border-slate-100 px-5 pb-4">
            {loading ? (
              <div className="py-6 text-center">
                <div className="w-6 h-6 mx-auto border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-400 mt-2">Loading purchases...</p>
              </div>
            ) : error ? (
              <div className="py-4 text-center">
                <p className="text-sm text-rose-600">{error}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {purchases.map((purchase) => {
                  const retryable = isRetryable(purchase.status);
                  const isFailed = purchase.status === "failed";

                  return (
                    <div
                      key={purchase._id}
                      className={`py-3 rounded-lg transition-all ${
                        isFailed
                          ? "bg-rose-50/40 border border-rose-100 px-3 my-1"
                          : retryable
                          ? "bg-amber-50/40 border border-amber-100 px-3 my-1"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        {/* Left — bundle info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-900">
                              {purchase.bundle_name || purchase.bundle_id}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDate(purchase.createdAt)}
                          </p>

                          {/* Child tags */}
                          {purchase.child_ids?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {purchase.child_ids.map((child) => {
                                if (typeof child === "string" || !child?.username) {
                                  return (
                                    <span key={child?._id || child} className="inline-flex items-center text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                      1 child
                                    </span>
                                  );
                                }
                                const name = child.display_name || child.username;
                                return (
                                  <span key={child._id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                    <span className="font-medium text-slate-800">{name}</span>
                                    <span className="text-slate-400">@{child.username}</span>
                                    {child.year_level && (
                                      <span className="text-indigo-500 font-medium">· Yr {child.year_level}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Right — badges + amount */}
                        <div className="flex items-center gap-2 sm:mt-0.5 flex-shrink-0">
                          {purchase.status === "paid" && (
                            <ProvisionBadge provisioned={purchase.provisioned} />
                          )}
                          <StatusBadge status={purchase.status} />
                          <span className="text-sm font-semibold text-slate-900 min-w-[65px] text-right">
                            {formatAUD(purchase.amount_cents)}
                          </span>
                        </div>
                      </div>

                      {/* ── Inline retry banner for failed/pending ── */}
                      {purchase.status === "pending" && (
                        <RetryBanner purchase={purchase} onRetry={openRetry} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Retry modal ─── */}
      {retryTarget && (
        <RetryPaymentModal
          purchase={retryTarget}
          loading={retryLoading}
          onConfirm={handleRetryConfirm}
          parentToken={parentToken}
          onCancelled={(id) => {
            setPurchases((prev) =>
              prev.map((p) => p._id === id ? { ...p, status: "cancelled" } : p)
            );
          }}
          onCancel={closeRetry}
        />
      )}

      {/* ─── Error toast ─── */}
      {retryError && !retryTarget && (
        <div className="fixed bottom-6 right-6 z-50 bg-rose-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-3">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {retryError}
          <button onClick={() => setRetryError(null)} className="ml-2 text-white/70 hover:text-white">✕</button>
        </div>
      )}
    </>
  );
}


