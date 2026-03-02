/**
 * ProvisioningStatusBanner.jsx
 * ✅ Issue #3: Surfaces provisioning failures to parents on the dashboard.
 * Place in: naplan-frontend/src/app/components/payments/ProvisioningStatusBanner.jsx
 */
import { useState, useEffect } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV ? "" : "http://localhost:3000";

export default function ProvisioningStatusBanner({ parentToken }) {
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [retrying, setRetrying] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    if (!parentToken) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/payments/history`, {
          headers: { Authorization: `Bearer ${parentToken}`, Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const purchases = Array.isArray(data) ? data : data?.purchases || [];
        const pending = purchases.filter((p) => p.status === "paid" && p.provisioned === false);
        if (mounted) setPendingPurchases(pending);
      } catch { /* silent */ }
    })();
    return () => { mounted = false; };
  }, [parentToken]);

  const handleRetryProvision = async (purchaseId) => {
    setRetrying(purchaseId);
    try {
      const res = await fetch(`${API_BASE}/api/payments/retry-provision/${purchaseId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${parentToken}`, Accept: "application/json" },
      });
      if (res.ok) setPendingPurchases((prev) => prev.filter((p) => p._id !== purchaseId));
    } catch { /* silent */ }
    finally { setRetrying(null); }
  };

  const visible = pendingPurchases.filter((p) => !dismissed.has(p._id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((purchase) => {
        const hasError = !!purchase.provision_error;
        const bundleName = purchase.bundle_name || "Your purchased bundle";
        return (
          <div key={purchase._id} className={`rounded-xl border-2 p-4 ${hasError ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-0.5 ${hasError ? "bg-rose-100" : "bg-amber-100"}`}>
                  <span className="text-lg">{hasError ? "⚠️" : "⏳"}</span>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${hasError ? "text-rose-800" : "text-amber-800"}`}>
                    {hasError ? `Quiz setup failed for "${bundleName}"` : `Setting up "${bundleName}"...`}
                  </p>
                  <p className={`text-xs mt-1 ${hasError ? "text-rose-600" : "text-amber-600"}`}>
                    {hasError
                      ? "Your payment was successful but we had trouble assigning quizzes. Please retry or contact support."
                      : "Your payment was received. Quizzes are being assigned — this usually takes a few minutes."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasError && (
                  <button onClick={() => handleRetryProvision(purchase._id)} disabled={retrying === purchase._id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                    {retrying === purchase._id ? "Retrying..." : "Retry"}
                  </button>
                )}
                <button onClick={() => setDismissed((prev) => new Set([...prev, purchase._id]))} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
