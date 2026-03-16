/**
 * components/admin/DownloadXlsxButton.jsx
 *
 * Drop-in "⬇ Download XLSX" button for QuizDetailPage and QuizDetailModal.
 *
 * Props:
 *   quizId   {string}  — quiz_id or _id
 *   quizName {string}  — displayed in filename
 *   variant  {"primary"|"ghost"}  — visual style (default "ghost")
 *
 * Usage in QuizDetailPage header:
 *   import DownloadXlsxButton from "./DownloadXlsxButton";
 *   <DownloadXlsxButton quizId={quiz.quiz_id || quiz._id} quizName={quiz.quiz_name} />
 *
 * Usage in QuizDetailModal toolbar:
 *   <DownloadXlsxButton quizId={quizId} quizName={quiz.quiz_name} variant="ghost" />
 */

import { useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function DownloadXlsxButton({ quizId, quizName = "quiz", variant = "ghost" }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading || !quizId) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API}/api/admin/quizzes/${quizId}/export`, {
        headers:     { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${(quizName || "quiz")
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 60)}_questions.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50";

  const styles =
    variant === "primary"
      ? `${base} bg-emerald-600 hover:bg-emerald-700 text-white`
      : `${base} bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700`;

  return (
    <button onClick={handleDownload} disabled={downloading || !quizId} className={styles}>
      {downloading ? (
        <>
          <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          Preparing…
        </>
      ) : (
        <>
          {/* Excel-green icon */}
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Download Excel
        </>
      )}
    </button>
  );
}