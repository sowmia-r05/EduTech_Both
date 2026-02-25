// src/app/components/payments/PaymentSuccessModal.jsx
//
// A celebratory modal shown after successful Stripe payment.
// Fetches purchase details via /api/payments/verify/:sessionId
// and displays child name, bundle info, and next steps.

import { useState, useEffect } from "react";
import { verifyPayment } from "@/app/utils/api-payments";

const formatAUD = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)} AUD`;

export default function PaymentSuccessModal({ sessionId, parentToken, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          setTimeout(fetchData, RETRY_DELAY);
        } else {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!mounted) return;
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(fetchData, RETRY_DELAY);
        } else {
          setError(err?.message || "Unable to verify payment");
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      mounted = false;
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
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Subjects</span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {subjects.map((s) => (
                        <span
                          key={s}
                          className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {amount && (
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-sm text-slate-500">Amount Paid</span>
                    <span className="text-lg font-bold text-slate-900">
                      {formatAUD(amount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-3 px-1">
                {isPaid && isProvisioned ? (
                  <>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-emerald-600"
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
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        All set!
                      </p>
                      <p className="text-xs text-slate-500">
                        Quizzes are assigned and ready to go.
                      </p>
                    </div>
                  </>
                ) : isPaid && !isProvisioned ? (
                  <>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Setting up quizzes...
                      </p>
                      <p className="text-xs text-slate-500">
                        This usually takes a minute. Quizzes will appear on the
                        child's dashboard shortly.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            {loading ? "Close" : "Back to Dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}