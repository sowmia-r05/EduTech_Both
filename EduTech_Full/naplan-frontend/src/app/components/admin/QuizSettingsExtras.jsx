/**
 * QuizSettingsExtras.jsx
 *
 * Reusable settings section for:
 *   ✅ Randomize questions toggle
 *   ✅ Randomize options toggle
 *   ✅ Voice URL input
 *   ✅ Video URL input
 *
 * Used in: AdminDashboard (QuizSettingsModal), QuizDetailPage, QuizDetailModal
 *
 * Place in: src/app/components/admin/QuizSettingsExtras.jsx
 */

export default function QuizSettingsExtras({ form, onChange, compact = false }) {
  const toggle = (field) => onChange({ ...form, [field]: !form[field] });
  const update = (field, value) => onChange({ ...form, [field]: value });

  const labelCls = compact
    ? "block text-xs text-slate-400 mb-1"
    : "block text-xs font-medium text-slate-400 mb-1";
  const inputCls = compact
    ? "w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none"
    : "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <>
      {/* ── Randomization Toggles ── */}
      <div className={compact ? "pt-2 border-t border-slate-800/50" : "pt-3 border-t border-slate-800"}>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Randomization</p>
        <div className="flex items-center gap-5 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.randomize_questions}
              onChange={() => toggle("randomize_questions")}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
            />
            Shuffle Questions
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.randomize_options}
              onChange={() => toggle("randomize_options")}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
            />
            Shuffle Options
          </label>
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
          When enabled, question order and/or answer options are randomized for each student attempt.
        </p>
      </div>

      {/* ── Voice & Video Media ── */}
      <div className={compact ? "pt-2 border-t border-slate-800/50" : "pt-3 border-t border-slate-800"}>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Voice & Video</p>
        <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1">🔊 Voice / Audio URL</span>
            </label>
            <input
              type="url"
              value={form.voice_url || ""}
              onChange={(e) => update("voice_url", e.target.value || null)}
              placeholder="https://... .mp3 / .wav"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              <span className="flex items-center gap-1">🎬 Video URL</span>
            </label>
            <input
              type="url"
              value={form.video_url || ""}
              onChange={(e) => update("video_url", e.target.value || null)}
              placeholder="https://... .mp4 / YouTube"
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
          Add an audio or video resource that students can access during the quiz. Supports direct file URLs, YouTube, and Vimeo links.
        </p>
      </div>
    </>
  );
}