/**
 * FreeTrialOnboarding.jsx
 *
 * Multi-step onboarding overlay shown on ParentDashboard when
 * ?onboarding=free-trial is in the URL (i.e. right after a new
 * parent registers via the free-trial funnel).
 *
 * Steps:
 *   1. Welcome message — "Welcome! Let's get your child started"
 *   2. Add Child form — display name, username, year level, PIN
 *   3. Success — "All set! Start the free test" → navigates to child dashboard
 *
 * Props:
 *   parentToken  — Parent JWT (for API calls)
 *   onComplete   — (newChild) => void — called after child is created, so
 *                   ParentDashboard can refresh its children list
 *   onSkip       — () => void — if parent wants to skip onboarding
 *
 * Place in: src/app/components/dashboardComponents/FreeTrialOnboarding.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createChild, checkUsername } from "@/app/utils/api-children";
import { useAuth } from "@/app/context/AuthContext";

/* ═══════════════════════════════════════
   STEP INDICATOR
   ═══════════════════════════════════════ */
function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 bg-indigo-600"
              : i < current
                ? "w-6 bg-indigo-300"
                : "w-6 bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   STEP 1: WELCOME
   ═══════════════════════════════════════ */
function WelcomeStep({ onNext, onSkip }) {
  return (
    <div className="text-center space-y-6 px-2">
      {/* Illustration */}
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 bg-indigo-100 rounded-full animate-pulse" />
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
          <span className="text-4xl">🎉</span>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Welcome to EduTech!
        </h2>
        <p className="text-slate-600 leading-relaxed max-w-sm mx-auto">
          Your free account is ready. Let's set up your child's profile so they
          can take their first NAPLAN-style practice test.
        </p>
      </div>

      {/* What you get */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-left space-y-2.5 max-w-sm mx-auto">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
          Your free trial includes
        </p>
        {[
          { icon: "📝", text: "One full-length NAPLAN-style practice test" },
          { icon: "📊", text: "Instant scoring with detailed breakdown" },
          { icon: "🤖", text: "AI-powered performance insights" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="text-base flex-shrink-0">{item.icon}</span>
            <span className="text-sm text-slate-700">{item.text}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3 pt-2">
        <button
          onClick={onNext}
          className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200"
        >
          Set Up My Child's Profile →
        </button>
        <button
          onClick={onSkip}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          I'll do this later
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   STEP 2: ADD CHILD FORM
   ═══════════════════════════════════════ */
function AddChildStep({ parentToken, onChildCreated, onBack }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken"

  // Auto-generate username from display name
  useEffect(() => {
    if (displayName.trim() && !username) {
      const suggested = displayName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 15);
      if (suggested.length >= 3) {
        setUsername(suggested);
      }
    }
  }, [displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live username availability check
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanDisplayName) return setError("Please enter your child's name");
    if (!cleanUsername || cleanUsername.length < 3) return setError("Username must be at least 3 characters");
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      return setError("Username can only contain lowercase letters, numbers, and underscores");
    }
    if (!yearLevel) return setError("Please select a year level");
    if (!pin || !/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits");
    if (pin !== confirmPin) return setError("PINs don't match");
    if (usernameStatus === "taken") return setError("Username is already taken — try another one");

    try {
      setLoading(true);
      const newChild = await createChild(parentToken, {
        display_name: cleanDisplayName,
        username: cleanUsername,
        year_level: Number(yearLevel),
        pin,
      });
      onChildCreated(newChild);
    } catch (err) {
      setError(err?.message || "Failed to create child profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const usernameIcon =
    usernameStatus === "checking" ? (
      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    ) : usernameStatus === "available" ? (
      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ) : usernameStatus === "taken" ? (
      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ) : null;

  return (
    <div className="space-y-5 px-1">
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Add Your Child</h2>
        <p className="text-sm text-slate-500">
          Create their profile so they can log in and take quizzes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        {/* Child Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Child's Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Aarav"
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
            autoFocus
          />
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Username
            <span className="text-slate-400 font-normal ml-1">(for child login)</span>
          </label>
          <div className="relative">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g., aarav_2025"
              maxLength={20}
              className={`w-full border rounded-xl px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 transition ${
                usernameStatus === "taken"
                  ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                  : usernameStatus === "available"
                    ? "border-emerald-300 focus:ring-emerald-200 focus:border-emerald-400"
                    : "border-slate-300 focus:ring-indigo-200 focus:border-indigo-400"
              }`}
            />
            {usernameIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameIcon}
              </div>
            )}
          </div>
          {usernameStatus === "taken" && (
            <p className="text-xs text-red-500 mt-1">This username is already taken</p>
          )}
          {usernameStatus === "available" && (
            <p className="text-xs text-emerald-600 mt-1">Username is available</p>
          )}
        </div>

        {/* Year Level */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Year Level
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[3, 5, 7, 9].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setYearLevel(String(yr))}
                className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  yearLevel === String(yr)
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Year {yr}
              </button>
            ))}
          </div>
        </div>

        {/* PIN */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              PIN (4 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="• • • •"
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="• • • •"
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm text-center tracking-[0.3em] focus:outline-none focus:ring-2 transition ${
                confirmPin && confirmPin !== pin
                  ? "border-red-300 focus:ring-red-200"
                  : "border-slate-300 focus:ring-indigo-200 focus:border-indigo-400"
              }`}
            />
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Your child will use their <strong>username</strong> and <strong>PIN</strong> to log in.
          Keep these handy — you can change them later from your dashboard.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            ← Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              "Create Profile & Continue →"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════
   STEP 3: SUCCESS — START QUIZ
   ═══════════════════════════════════════ */
function SuccessStep({ child, onStartQuiz }) {
  const childName = child?.display_name || child?.username || "Your child";
  const yearLevel = child?.year_level;

  return (
    <div className="text-center space-y-6 px-2">
      {/* Success animation */}
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-30" />
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          All Set! 🚀
        </h2>
        <p className="text-slate-600 leading-relaxed max-w-sm mx-auto">
          <strong>{childName}</strong>'s profile is ready
          {yearLevel ? ` for Year ${yearLevel}` : ""}.
          They can now take their free NAPLAN-style practice test.
        </p>
      </div>

      {/* Login credentials reminder */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left max-w-sm mx-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Child Login Details
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Username</span>
            <span className="text-sm font-mono font-medium text-slate-800">
              {child?.username || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">PIN</span>
            <span className="text-sm text-slate-400">The 4-digit PIN you just set</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <button
          onClick={onStartQuiz}
          className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-200"
        >
          Start {childName}'s Free Test →
        </button>
        <p className="text-xs text-slate-400">
          Your child will be logged in automatically
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN: FreeTrialOnboarding
   ═══════════════════════════════════════ */
export default function FreeTrialOnboarding({ parentToken, onComplete, onSkip }) {
  const navigate = useNavigate();
  const { loginChild } = useAuth();
  const [step, setStep] = useState(0); // 0=welcome, 1=add-child, 2=success
  const [createdChild, setCreatedChild] = useState(null);

  const handleChildCreated = useCallback(
    (newChild) => {
      setCreatedChild(newChild);
      setStep(2);
      onComplete?.(newChild);
    },
    [onComplete]
  );

  const handleStartQuiz = useCallback(async () => {
    if (!createdChild) return;

    // Auto-login as child and navigate to child dashboard
    try {
      // We need to do a child login to get a child JWT
      // The parent just created the child, so we can use the Quick Login approach
      // Navigate to child-login pre-filled, or use the QuickChildLogin flow
      // Simplest: navigate to child dashboard via parent view
      navigate(
        `/child-dashboard?childId=${encodeURIComponent(createdChild._id)}` +
        `&childName=${encodeURIComponent(createdChild.display_name || "")}` +
        `&yearLevel=${createdChild.year_level || ""}` +
        `&username=${encodeURIComponent(createdChild.username || "")}`
      );
    } catch {
      // Fallback: just go to parent dashboard
      navigate("/parent-dashboard");
    }
  }, [createdChild, navigate]);

  const handleSkip = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar with step indicator */}
        <div className="px-6 pt-5 pb-3">
          <StepIndicator current={step} total={3} />
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {step === 0 && (
            <WelcomeStep
              onNext={() => setStep(1)}
              onSkip={handleSkip}
            />
          )}

          {step === 1 && (
            <AddChildStep
              parentToken={parentToken}
              onChildCreated={handleChildCreated}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <SuccessStep
              child={createdChild}
              onStartQuiz={handleStartQuiz}
            />
          )}
        </div>
      </div>
    </div>
  );
}
