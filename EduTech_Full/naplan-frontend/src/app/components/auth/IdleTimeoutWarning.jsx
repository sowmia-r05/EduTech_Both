// src/app/components/auth/IdleTimeoutWarning.jsx
import { Clock, LogIn, ShieldAlert } from "lucide-react";

export default function IdleTimeoutWarning({ remainingSeconds, onStayLoggedIn, onLogoutNow }) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}`
    : `${seconds}s`;
  const isUrgent = remainingSeconds <= 15;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center gap-3 ${
          isUrgent
            ? "bg-gradient-to-r from-red-500 to-rose-600"
            : "bg-gradient-to-r from-amber-500 to-orange-500"
        }`}>
          <ShieldAlert className="h-6 w-6 text-white flex-shrink-0" />
          <h2 className="text-lg font-bold text-white">Session Timeout Warning</h2>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
              isUrgent ? "bg-red-50 ring-2 ring-red-200" : "bg-amber-50 ring-2 ring-amber-200"
            }`}>
              <Clock className={`h-10 w-10 ${isUrgent ? "text-red-500 animate-pulse" : "text-amber-500"}`} />
            </div>
          </div>
          <div>
            <p className="text-slate-700 text-base leading-relaxed">
              You've been inactive for a while. Your session will expire in:
            </p>
            <p className={`text-4xl font-bold mt-3 tabular-nums ${
              isUrgent ? "text-red-600" : "text-amber-600"
            }`}>
              {timeDisplay}
            </p>
          </div>
          <p className="text-slate-500 text-sm">
            You'll need to log in again with a new OTP after timeout.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onLogoutNow}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       border border-slate-300 text-slate-700 text-sm font-medium
                       hover:bg-slate-50 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Log Out Now
          </button>
          <button
            onClick={onStayLoggedIn}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold
                       shadow-md shadow-indigo-200
                       hover:from-indigo-700 hover:to-violet-700 hover:shadow-lg transition-all"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
