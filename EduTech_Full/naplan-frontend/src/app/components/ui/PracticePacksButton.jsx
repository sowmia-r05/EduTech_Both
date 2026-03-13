import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function PracticePacksButton() {
  const navigate  = useNavigate();
  const [packCount, setPackCount] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/catalog/bundles`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPackCount(data.length); })
      .catch(() => setPackCount(null));
  }, []);

  return (
    <button
      onClick={() => navigate("/bundles")}
      className="
        group inline-flex items-center gap-2
        px-3 py-2 rounded-lg text-sm font-semibold
        border border-slate-200 bg-white text-slate-600
        hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50
        transition-all duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1
      "
    >
      <BookOpen className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.25} />
      <span>Practice Packs</span>
      {packCount !== null && packCount > 0 && (
        <span className="
          inline-flex items-center justify-center
          w-[17px] h-[17px] rounded-full
          bg-indigo-600 text-white text-[10px] font-bold leading-none
        ">
          {packCount}
        </span>
      )}
    </button>
  );
}