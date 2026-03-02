// src/app/components/landing/FreeVsPaidSection.jsx
//
// Side-by-side Free Trial vs Practice Pack comparison cards.
// Drop into WelcomePage between WhySection and TestimonialsSection.

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

/* ─── Icons ─── */
function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function CrossIcon() {
  return (
    <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" />
    </svg>
  );
}

/* ─── Feature lists ─── */
const FREE_FEATURES = [
  "1 full-length NAPLAN-style practice test",
  "Instant scoring with overall percentage",
  "Basic score summary",
  "No credit card required",
];

const FREE_NOT_INCLUDED = [
  "Detailed results dashboard",
  "Analytics & progress tracking",
  "AI writing feedback",
  "Subject-specific drills",
  "Multiple attempts",
];

const PAID_FEATURES = [
  "Full test bank — all subjects & year levels",
  "Instant scoring with per-question breakdown",
  "Detailed results dashboard with topic analysis",
  "Analytics & progress tracking with charts",
  "AI-powered writing feedback (NAPLAN criteria)",
  "Subject-specific drills at all difficulty levels",
  "Multiple attempts — retake to improve",
  "Personalised AI study suggestions & coaching",
  "Performance trends & strength analysis",
];

/* ═══════════════════════════════════════════════════════════
   MAIN SECTION
   ═══════════════════════════════════════════════════════════ */
export default function FreeVsPaidSection() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="pt-10 pb-20 md:pt-14 md:pb-28 bg-gradient-to-b from-white to-slate-50 scroll-mt-28">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <span className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-full mb-4 tracking-wide uppercase">
            Compare Plans
          </span>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-3">
            Start Free, Upgrade When You're Ready
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Try a full practice test for free. Upgrade to a Practice Pack for the complete experience.
          </p>
        </motion.div>

        {/* ─── Side by Side Cards ─── */}
        <div className="grid md:grid-cols-2 gap-5 items-start">
          {/* FREE TRIAL */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-block px-2.5 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-wider mb-2">
                    Free Trial
                  </span>
                  <h3 className="text-2xl font-extrabold text-slate-900">Free</h3>
                </div>
                <span className="text-3xl">🎯</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">No credit card required</p>
            </div>

            <div className="px-6 py-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">What's included</p>
              <ul className="space-y-2.5">
                {FREE_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span className="text-sm text-slate-700">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">Not included</p>
                <ul className="space-y-2">
                  {FREE_NOT_INCLUDED.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CrossIcon />
                      <span className="text-sm text-slate-400">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => navigate("/free-trial")}
                className="w-full mt-6 px-6 py-3 rounded-xl text-indigo-600 font-semibold text-sm border-2 border-indigo-200 hover:bg-indigo-50 transition"
              >
                Start Free Trial
              </button>
            </div>
          </motion.div>

          {/* PRACTICE PACK */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative bg-white border-2 border-indigo-500 rounded-2xl overflow-hidden shadow-lg shadow-indigo-100/50"
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
              <span className="inline-flex items-center gap-1 px-4 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-b-lg uppercase tracking-wider shadow-md">
                <SparkleIcon /> Recommended
              </span>
            </div>

            <div className="px-6 py-5 border-b border-indigo-100 bg-indigo-50/40">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="inline-block px-2.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-wider mb-2">
                    Practice Pack
                  </span>
                  <h3 className="text-2xl font-extrabold text-slate-900">Full Access</h3>
                </div>
                <span className="text-3xl">🚀</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">One-time payment per year level</p>
            </div>

            <div className="px-6 py-5">
              <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-3">Everything included</p>
              <ul className="space-y-2.5">
                {PAID_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span className="text-sm text-slate-700">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate("/bundles")}
                className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                <SparkleIcon /> View Practice Packs
              </button>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center text-sm text-slate-400 mt-8"
        >
          All Practice Packs are one-time purchases — no subscriptions, no recurring charges.
        </motion.p>
      </div>
    </section>
  );
}
