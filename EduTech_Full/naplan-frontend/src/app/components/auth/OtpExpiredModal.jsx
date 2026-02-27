// src/app/components/auth/OtpExpiredModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Confirmation modal shown when OTP expires before the user enters it.
// Two choices: Request New OTP or Go Back (to email step / create page).
// ─────────────────────────────────────────────────────────────────────────────

import { Clock, RefreshCw, ArrowLeft } from "lucide-react";

export default function OtpExpiredModal({ onRequestNewOtp, onGoBack, loading }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-rose-600 flex items-center gap-3">
          <Clock className="h-6 w-6 text-white flex-shrink-0" />
          <h2 className="text-lg font-bold text-white">OTP Expired</h2>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-50 ring-2 ring-red-200 flex items-center justify-center">
              <Clock className="h-10 w-10 text-red-500" />
            </div>
          </div>
          <div>
            <p className="text-slate-700 text-base font-semibold">
              Your verification code has expired
            </p>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              For security, OTP codes are valid for 5 minutes only.
              Would you like to request a new code?
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onGoBack}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       border border-slate-300 text-slate-700 text-sm font-medium
                       hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          <button
            onClick={onRequestNewOtp}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold
                       shadow-md shadow-indigo-200
                       hover:from-indigo-700 hover:to-violet-700 hover:shadow-lg
                       transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Sending..." : "Request New OTP"}
          </button>
        </div>
      </div>
    </div>
  );
}
