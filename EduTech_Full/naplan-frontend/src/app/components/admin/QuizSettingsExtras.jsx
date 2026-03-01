/**
 * QuizSettingsExtras.jsx  (v4 — DARK THEME)
 *
 *   ✅ Allow Retakes toggle + Max Attempts
 *   ✅ Shuffle Questions / Shuffle Options (master switch)
 *   ❌ No voice/video (per-question only)
 */

export default function QuizSettingsExtras({ form, onChange, compact = false }) {
  const allowRetakes = form.max_attempts === null || form.max_attempts === undefined || form.max_attempts > 1;

  const handleRetakeToggle = (checked) => {
    onChange((f) => ({ ...f, max_attempts: checked ? null : 1 }));
  };

  const handleMaxAttemptsChange = (value) => {
    const num = parseInt(value);
    onChange((f) => ({ ...f, max_attempts: isNaN(num) ? null : Math.max(2, Math.min(99, num)) }));
  };

  return (
    <div className={`${compact ? "pt-3" : "pt-4"} border-t border-slate-700 space-y-4`}>
      {/* Quiz Retakes */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Quiz Retakes</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allowRetakes} onChange={(e) => handleRetakeToggle(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
            <span className={`${compact ? "text-xs" : "text-sm"} text-slate-300 font-medium`}>Allow Retakes</span>
          </label>
          {allowRetakes && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Max Attempts:</span>
              <input type="number" min="2" max="99"
                value={form.max_attempts ?? ""}
                onChange={(e) => handleMaxAttemptsChange(e.target.value)}
                placeholder="Default (5)"
                className={`w-28 bg-slate-800 border border-slate-600 rounded-lg px-3 ${compact ? "py-1 text-xs" : "py-1.5 text-sm"} text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500`} />
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          {allowRetakes ? "Students can retake this quiz (system default: 5 attempts)." : "Students get only one attempt — no retakes allowed."}
        </p>
      </div>

      {/* Randomization */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Randomization</p>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.randomize_questions || false}
              onChange={(e) => onChange((f) => ({ ...f, randomize_questions: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
            <span className={`${compact ? "text-xs" : "text-sm"} text-slate-300 font-medium`}>Shuffle Questions</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.randomize_options || false}
              onChange={(e) => onChange((f) => ({ ...f, randomize_options: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
            <span className={`${compact ? "text-xs" : "text-sm"} text-slate-300 font-medium`}>Shuffle Options</span>
          </label>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          When enabled, question order and/or answer options are randomized for each student attempt.
          {form.randomize_options && " Individual questions can opt out of option shuffling."}
        </p>
      </div>
    </div>
  );
}