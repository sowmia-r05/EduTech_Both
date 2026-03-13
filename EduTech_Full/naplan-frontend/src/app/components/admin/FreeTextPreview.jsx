/**
 * FreeTextPreview.jsx
 *
 * Reusable "Student Writing Area Preview" for admin forms.
 * Shows ONLY the disabled textarea — the prompt image is already
 * displayed by ImageField + ImageResizeWidget above.
 *
 * Usage:
 *   import FreeTextPreview from "./FreeTextPreview";
 *   ...
 *   <FreeTextPreview form={form} />
 *
 * Place in: src/app/components/admin/FreeTextPreview.jsx
 */

export default function FreeTextPreview({ form }) {
  if (form.type !== "free_text") return null;

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
      <p className="text-[10px] text-slate-500">This is what the student writing area will look like below the prompt image.</p>
    </div>
  );
}