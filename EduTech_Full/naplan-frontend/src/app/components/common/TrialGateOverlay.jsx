// src/app/components/common/TrialGateOverlay.jsx
//
// Reusable "frosted glass" overlay for trial-gated sections.
// Shows different CTAs based on who is viewing:
//   - Parent (own session OR viewing child) → "Upgrade to Full Access" button
//   - Child (logged in independently)       → "Ask your parent to upgrade" message
//
// Usage:
//   <TrialGateOverlay
//     isTrialUser={childStatus === "trial"}
//     preset="analytics"
//     viewerType={isChildLoggedIn ? "child" : "parent"}
//     onUpgrade={() => navigate(`/bundles?year=${yearLevel}`)}
//     yearLevel={yearLevel}
//   >
//     <StudentDashboardAnalytics ... />
//   </TrialGateOverlay>

import { useNavigate } from "react-router-dom";

/* ─── Icons ─── */
function LockIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
function SparkleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" />
    </svg>
  );
}
function CheckIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function ArrowLeftIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEATURE PRESETS
   ═══════════════════════════════════════════════════════════ */
const FEATURE_PRESETS = {
  analytics: {
    icon: "📊",
    title: "Analytics Dashboard",
    description: "Track progress over time with detailed performance charts, subject comparisons, and personalised insights.",
    features: ["Subject-by-subject breakdown", "Progress tracking over time", "Strength & weakness analysis", "Performance trends & predictions"],
    gradient: "from-indigo-600 to-violet-600",
    accentBg: "bg-indigo-50",
    accentText: "text-indigo-600",
    accentBorder: "border-indigo-200",
  },
  nonwriting: {
    icon: "📖",
    title: "Detailed Results Dashboard",
    description: "Dive deep into question-level analysis with topic breakdowns, AI-powered feedback, and personalised study tips.",
    features: ["Question-by-question analysis", "Topic strength breakdown", "AI-powered study suggestions", "Score comparison across attempts"],
    gradient: "from-blue-600 to-cyan-600",
    accentBg: "bg-blue-50",
    accentText: "text-blue-600",
    accentBorder: "border-blue-200",
  },
  writing: {
    icon: "✍️",
    title: "AI Writing Feedback",
    description: "Get detailed, criteria-based writing evaluation powered by AI — scored against real NAPLAN writing rubrics.",
    features: ["NAPLAN criteria scoring", "Strengths & areas to improve", "Personalised writing coach tips", "Example-based feedback"],
    gradient: "from-purple-600 to-pink-600",
    accentBg: "bg-purple-50",
    accentText: "text-purple-600",
    accentBorder: "border-purple-200",
  },
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT

   Props:
   - isTrialUser   : boolean  — if false, renders children normally (no gate)
   - preset        : "analytics" | "nonwriting" | "writing"
   - viewerType    : "parent" | "parent_viewing_child" | "child"
                      Parent (either type)  → "Upgrade to Full Access" CTA
                      Child                 → "Ask your parent" message
   - onUpgrade     : () => void  — optional, called when upgrade button clicked
   - onBack        : () => void  — optional, called for "Back to Dashboard" (child view)
   - yearLevel     : number | null — used to construct /bundles?year=X link
   
   You can also pass individual props to override preset values:
   - featureTitle, featureDescription, icon, features, gradient, accentBg, accentText, accentBorder
   ═══════════════════════════════════════════════════════════ */
export default function TrialGateOverlay({
  children,
  isTrialUser = false,
  preset = null,
  viewerType = "parent",  // "parent" | "parent_viewing_child" | "child"
  featureTitle,
  featureDescription,
  icon,
  features = [],
  gradient,
  accentBg,
  accentText,
  accentBorder,
  onUpgrade,
  onBack,
  yearLevel,
}) {
  const navigate = useNavigate();

  // If not a trial user, render children normally — no gate
  if (!isTrialUser) return <>{children}</>;

  // Merge preset with explicit props (explicit props win)
  const p = preset ? FEATURE_PRESETS[preset] || {} : {};
  const _icon = icon || p.icon || "🔒";
  const _title = featureTitle || p.title || "Premium Feature";
  const _description = featureDescription || p.description || "Upgrade to unlock this feature.";
  const _features = features.length > 0 ? features : p.features || [];
  const _gradient = gradient || p.gradient || "from-indigo-600 to-violet-600";
  const _accentBg = accentBg || p.accentBg || "bg-indigo-50";
  const _accentText = accentText || p.accentText || "text-indigo-600";
  const _accentBorder = accentBorder || p.accentBorder || "border-indigo-200";

  // Determine viewer type
  const isChild = viewerType === "child";

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigate(yearLevel ? `/bundles?year=${yearLevel}` : "/bundles");
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/child-dashboard");
    }
  };

  return (
    <div className="relative">
      {/* ─── Blurred content behind ─── */}
      <div
        className="pointer-events-none select-none"
        aria-hidden="true"
        style={{ filter: "blur(6px)", opacity: 0.45 }}
      >
        {children}
      </div>

      {/* ─── Frosted glass overlay ─── */}
      <div className="absolute inset-0 z-40 flex items-start justify-center pt-12 sm:pt-20 md:pt-28">
        {/* Semi-transparent backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/50 to-white/80 backdrop-blur-sm" />

        {/* ─── CTA Card ─── */}
        <div className="relative z-10 w-full max-w-md mx-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
            {/* Top accent bar */}
            <div className={`h-1.5 bg-gradient-to-r ${_gradient}`} />

            <div className="px-6 py-8 sm:px-8 sm:py-10">
              {/* Icon + Lock badge */}
              <div className="flex items-center justify-center mb-5">
                <div className="relative">
                  <span className="text-4xl">{_icon}</span>
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br ${_gradient} flex items-center justify-center shadow-lg`}>
                    <LockIcon className="w-3 h-3 text-white" />
                  </div>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
                Unlock {_title}
              </h3>

              {/* Description */}
              <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
                {_description}
              </p>

              {/* Feature list */}
              {_features.length > 0 && (
                <div className={`${_accentBg} rounded-xl p-4 mb-6 border ${_accentBorder}`}>
                  <p className={`text-xs font-semibold ${_accentText} uppercase tracking-wide mb-3`}>
                    What you'll get
                  </p>
                  <ul className="space-y-2">
                    {_features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckIcon className={`w-4 h-4 ${_accentText} flex-shrink-0 mt-0.5`} />
                        <span className="text-sm text-slate-700">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ─── CTA: Different for parent vs child ─── */}
              <div className="space-y-3">
                {!isChild ? (
                  /* ═══ PARENT VIEW (own session OR viewing child) ═══
                     Parent can take action directly — show upgrade button */
                  <>
                    <button
                      onClick={handleUpgrade}
                      className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm
                        bg-gradient-to-r ${_gradient} shadow-lg hover:shadow-xl
                        transform hover:-translate-y-0.5 transition-all duration-200`}
                    >
                      <SparkleIcon className="w-4 h-4" />
                      Upgrade to Full Access
                    </button>
                    <p className="text-xs text-slate-500 text-center">
                      One-time payment — unlock all features for your child's year level.
                    </p>
                  </>
                ) : (
                  /* ═══ CHILD VIEW (logged in independently) ═══
                     Child can't purchase — tell them to ask parent */
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-center">
                      <div className="text-2xl mb-2">🔐</div>
                      <p className="text-sm text-amber-900 font-semibold mb-1">
                        This feature is part of the full Practice Pack
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Ask your parent to upgrade your account so you can see detailed results, analytics, and AI feedback!
                      </p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full px-6 py-3 rounded-xl text-slate-700 font-semibold text-sm
                        bg-white border border-slate-200 hover:bg-slate-50
                        transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      <ArrowLeftIcon className="w-4 h-4" />
                      Back to Dashboard
                    </button>
                  </>
                )}

                {/* Trial badge */}
                <p className="text-xs text-slate-400 text-center pt-1">
                  You're on the <span className="font-medium text-amber-600">Free Trial</span>
                  {!isChild && " — upgrade anytime to unlock everything."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
