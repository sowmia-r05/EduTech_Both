/**
 * PracticePacksButton.jsx
 *
 * Premium "Practice Packs" CTA button with:
 *   • Amber → orange gradient (premium feel, distinct from indigo/violet nav)
 *   • Subtle shimmer sweep animation on hover
 *   • BookOpen icon from lucide-react
 *   • Live badge showing total available packs from /api/catalog/bundles
 *
 * Usage in ParentDashboard.jsx:
 *
 *   import PracticePacksButton from "@/app/components/ui/PracticePacksButton";
 *
 *   <div className="flex items-center gap-2">
 *     <PracticePacksButton />
 *   </div>
 *
 * No props required — fetches count itself, navigates to /bundles itself.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function PracticePacksButton() {
  const navigate = useNavigate();
  const [packCount, setPackCount] = useState(null); // null = loading

  /* ── Fetch total active bundle count ── */
  useEffect(() => {
    fetch(`${API_BASE}/api/catalog/bundles`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPackCount(data.length);
      })
      .catch(() => setPackCount(null)); // silently fail — just hide badge
  }, []);

  return (
    <button
      onClick={() => navigate("/bundles")}
      className="
        group relative inline-flex items-center gap-2.5
        px-4 py-2 rounded-xl
        text-sm font-semibold text-white
        overflow-hidden
        transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-300/40
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1
      "
      style={{
        background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
      }}
    >
      {/* ── Shimmer sweep on hover ── */}
      <span
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          -translate-x-full group-hover:translate-x-full
          transition-transform duration-700 ease-in-out
          bg-gradient-to-r from-transparent via-white/25 to-transparent
          skew-x-[-20deg]
        "
      />

      {/* ── Icon ── */}
      <BookOpen
        className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
        strokeWidth={2.25}
      />

      {/* ── Label ── */}
      <span className="relative z-10">Practice Packs</span>

      {/* ── Badge ── */}
      {packCount !== null && packCount > 0 && (
        <span
          className="
            relative z-10
            inline-flex items-center justify-center
            min-w-[18px] h-[18px] px-1
            rounded-full text-[10px] font-bold leading-none
            bg-white/25 text-white
            ring-1 ring-white/30
          "
        >
          {packCount}
        </span>
      )}
    </button>
  );
}
