/**
 * ResetPinModal.jsx
 * ✅ Issue #2: Dedicated "Reset PIN" modal for parent dashboard.
 * Place in: naplan-frontend/src/app/components/modals/ResetPinModal.jsx
 */
import { useState } from "react";

export default function ResetPinModal({ child, onClose, onSave, loading }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const childName = child.name || child.display_name || child.username || "Child";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!pin) return setError("Please enter a new PIN.");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN must be 4\u20136 digits.");
    if (pin !== confirmPin) return setError("PINs do not match.");
    try { await onSave(child._id, { pin }); setSuccess(true); }
    catch (err) { setError(err?.message || "Failed to reset PIN."); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600">
          <h2 className="text-lg font-bold text-white">Reset PIN</h2>
          <p className="text-indigo-100 text-sm">for {childName}</p>
        </div>
        {success ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-800 font-semibold">PIN Reset Successfully!</p>
            <p className="text-slate-500 text-sm">{childName} can now log in with the new PIN.</p>
            <button onClick={onClose} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-slate-500 text-sm">Set a new 4\u20136 digit PIN that {childName} will use to log in.</p>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="block text-sm text-slate-700 mb-1 font-medium">New PIN</label>
              <input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 4\u20136 digit PIN" autoFocus
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <button type="button" onClick={() => setShowPin(!showPin)} className="text-xs text-slate-400 mt-1 hover:text-slate-600">{showPin ? "Hide" : "Show"} PIN</button>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1 font-medium">Confirm PIN</label>
              <input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={6} value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter PIN"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">{loading ? "Saving..." : "Reset PIN"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
