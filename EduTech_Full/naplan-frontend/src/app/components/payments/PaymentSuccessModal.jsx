

import { useState, useEffect, useRef } from "react";
import { verifyPayment } from "@/app/utils/api-payments";

const formatAUD = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)} AUD`;

export default function PaymentSuccessModal({ sessionId, parentToken, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ FIX: store timeout ID so it can be cancelled on unmount
  const retryTimerRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !parentToken) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds

    const fetchData = async () => {
      try {
        const result = await verifyPayment(parentToken, sessionId);
        if (!mounted) return;

        if (result?.ok) {
          setData(result);
          setLoading(false);
        } else if (
          result?.purchase?.status === "pending" &&
          retryCount < MAX_RETRIES
        ) {
          // Payment might not have been confirmed by webhook yet — retry
          retryCount++;
          // ✅ FIX: store timeout ID so unmount can cancel it
          retryTimerRef.current = setTimeout(fetchData, RETRY_DELAY);
        } else {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!mounted) return;
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          // ✅ FIX: store timeout ID so unmount can cancel it
          retryTimerRef.current = setTimeout(fetchData, RETRY_DELAY);
        } else {
          setError(err?.message || "Unable to verify payment");
          setLoading(false);
        }
      }
    };

    fetchData();

    // ✅ FIX: cleanup now correctly inside useEffect — cancels pending retry on unmount
    return () => {
      mounted = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [sessionId, parentToken]);

  const isPaid = data?.purchase?.status === "paid";
  const isProvisioned = data?.purchase?.provisioned === true;
  const childNames =
    data?.children?.map((c) => c.name || c.username).join(", ") || "";
  const bundleName = data?.bundle?.bundle_name || data?.purchase?.bundle_name || "";
  const subjects = data?.bundle?.subjects || [];
  const amount = data?.purchase?.amount_cents;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header with gradient ─── */}
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-6 py-8 text-center text-white overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full" />
          <div className="absolute top-4 left-8 w-8 h-8 bg-white/10 rounded-full" />

          {loading ? (
            <div className="relative z-10">
              <div className="w-12 h-12 mx-auto mb-3 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              <h2 className="text-xl font-bold">Verifying Payment...</h2>
              <p className="text-emerald-100 text-sm mt-1">
                Please wait a moment
              </p>
            </div>
          ) : error ? (
            <div className="relative z-10">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-bold">Verification Issue</h2>
              <p className="text-emerald-100 text-sm mt-1">{error}</p>
            </div>
          ) : (
            <div className="relative z-10">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-2xl font-bold">Payment Successful!</h2>
              <p className="text-emerald-100 text-sm mt-2">
                {bundleName} is now available
                {childNames ? ` for ${childNames}` : ""}
              </p>
            </div>
          )}
        </div>

        {/* ─── Body ─── */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3" />
            </div>
          ) : error ? (
            <div className="text-center py-2">
              <p className="text-sm text-slate-600">
                Your payment may still have been processed. Please check your
                purchase history or refresh the page.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Purchase receipt */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Bundle</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {bundleName}
                  </span>
                </div>

                {childNames && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      {data?.children?.length > 1 ? "Children" : "Child"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {childNames}
                    </span>
                  </div>
                )}

                {subjects.length > 0 && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-slate-500">Subjects</span>
                    <span className="text-sm font-semibold text-slate-900 text-right">
                      {subjects.join(", ")}
                    </span>
                  </div>
                )}

                {amount && (
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 mt-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Total paid
                    </span>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatAUD(amount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Access status */}
              {isPaid && (
                <div
                  className={`rounded-xl p-4 ${
                    isProvisioned
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-amber-50 border border-amber-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">
                      {isProvisioned ? "✅" : "⏳"}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          isProvisioned ? "text-emerald-800" : "text-amber-800"
                        }`}
                      >
                        {isProvisioned
                          ? "Access activated!"
                          : "Activating access..."}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${
                          isProvisioned ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {isProvisioned
                          ? `${childNames} can now access all ${bundleName} quizzes.`
                          : "This usually takes less than a minute. Refresh the page if access doesn't appear."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Next steps */}
              <div className="bg-indigo-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                  What's next
                </p>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2 text-sm text-indigo-800">
                    <span className="text-indigo-500">→</span>
                    Log in as your child to start practising
                  </li>
                  <li className="flex items-center gap-2 text-sm text-indigo-800">
                    <span className="text-indigo-500">→</span>
                    Track progress from your parent dashboard
                  </li>
                  <li className="flex items-center gap-2 text-sm text-indigo-800">
                    <span className="text-indigo-500">→</span>
                    View AI feedback after each quiz
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}


