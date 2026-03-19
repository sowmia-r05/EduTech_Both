/**
 * FreeTextPreview.jsx
 *
 * Reusable admin preview component for question types that don't have MCQ options.
 *
 * TYPE BEHAVIOUR:
 *   "writing"   → Shows a disabled textarea preview (student will type here)
 *   "free_text" → Shows a "Display Only" notice (no student input box rendered)
 *
 * Place in: src/app/components/admin/FreeTextPreview.jsx
 */

export default function FreeTextPreview({ form }) {
  // ── Writing type: shows the textarea students will use ──
  if (form.type === "writing") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-slate-400">✏️ Student Writing Area Preview</label>
        <div className="bg-white rounded-xl border border-slate-600 overflow-hidden">
          <div className="p-3">
            <textarea
              disabled
              rows={8}
              placeholder="Students will type their writing response here..."
              className="w-full px-4 py-3 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-lg resize-y cursor-not-allowed"
              style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
            />
            <div className="flex items-center gap-4 px-2 py-1 text-[10px] text-slate-300">
              <span>0 words</span>
              <span>0 characters</span>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Students will see the question text/image above and write their response in the box below.
        </p>
      </div>
    );
  }

  // ── Free Text type: display-only, no student input ──
  if (form.type === "free_text") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-slate-400">📄 Display Only — No Student Input</label>
        <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-1">
            <span>ℹ️</span>
            <span>Free Text (Display Only)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            This question type only displays the question text and image to the student.{" "}
            <strong className="text-slate-300">No answer box is shown.</strong> Use this for
            reading passages, instructions, or informational slides within a quiz.
          </p>
        </div>
      </div>
    );
  }

  return null;
}