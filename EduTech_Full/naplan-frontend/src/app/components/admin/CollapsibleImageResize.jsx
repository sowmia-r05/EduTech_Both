/**
 * CollapsibleImageResize.jsx
 *
 * Collapsible image resize widget for admin question forms.
 * Starts COLLAPSED — click to expand. Has a close (✕) button.
 *
 * Drop-in replacement for ImageResizeWidget in:
 *   - QuizDetailPage.jsx
 *   - QuizDetailModal.jsx
 *   - ManualQuizCreator.jsx
 *
 * Usage:
 *   import CollapsibleImageResize from "./CollapsibleImageResize";
 *   ...
 *   <CollapsibleImageResize form={form} setForm={setForm} />
 *
 * Place in: src/app/components/admin/CollapsibleImageResize.jsx
 */

import { useState } from "react";

const IMAGE_SIZE_MAP = { small: "max-w-[200px]", medium: "max-w-md", large: "max-w-xl", full: "max-w-full" };

export default function CollapsibleImageResize({ form, setForm }) {
  const [open, setOpen] = useState(false);

  if (!form.image_url) return null;
  const isPdf = form.image_url.toLowerCase().endsWith(".pdf");
  if (isPdf) return null;

  // Collapsed state — just a small toggle bar
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-400 hover:text-white hover:border-slate-600 transition"
      >
        <span className="flex items-center gap-2">
          <span>↔</span>
          <span>Image Size: <span className="text-indigo-400 font-mono">{form.image_width ? `${form.image_width}px` : form.image_size}</span></span>
          {form.image_height && <span className="text-slate-600">|</span>}
          {form.image_height && <span>Height: <span className="text-violet-400 font-mono">{form.image_height}px</span></span>}
        </span>
        <span className="text-slate-500">▼ Expand</span>
      </button>
    );
  }

  // Expanded state — full controls + close button
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-3">
      {/* Header with close button */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-300">↔ Image Width</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-indigo-400 font-mono">{form.image_width ? `${form.image_width}px` : form.image_size}</span>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-sm transition" title="Collapse">✕</button>
        </div>
      </div>

      {/* Size presets */}
      <div className="flex gap-2">
        {[{ label: "S", value: "small", px: 200 }, { label: "M", value: "medium", px: 400 }, { label: "L", value: "large", px: 576 }, { label: "Full", value: "full", px: null }].map((p) => (
          <button key={p.value} onClick={() => setForm((f) => ({ ...f, image_size: p.value, image_width: p.px }))}
            className={`px-3 py-1 text-xs rounded-lg border transition ${form.image_size === p.value ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500"}`}>{p.label}</button>
        ))}
      </div>

      {/* Width slider */}
      <input type="range" min="80" max="900" step="10" value={form.image_width || 400}
        onChange={(e) => { const w = parseInt(e.target.value); setForm((f) => ({ ...f, image_width: w, image_size: w <= 200 ? "small" : w <= 448 ? "medium" : w <= 576 ? "large" : "full" })); }}
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
      <div className="flex items-center gap-2">
        <input type="number" min="50" max="1200" step="10" value={form.image_width || ""} onChange={(e) => setForm((f) => ({ ...f, image_width: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Auto"
          className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none text-center" />
        <span className="text-xs text-slate-500">px</span>
        {form.image_width && <button onClick={() => setForm((f) => ({ ...f, image_width: null }))} className="text-[10px] text-slate-500 hover:text-red-400">Reset</button>}
      </div>

      {/* Height section */}
      <div className="pt-2 border-t border-slate-700/50 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">↕ Height</p>
          <span className="text-xs text-violet-400 font-mono">{form.image_height ? `${form.image_height}px` : "Auto"}</span>
        </div>
        <input type="range" min="40" max="800" step="10" value={form.image_height || 300}
          onChange={(e) => setForm((f) => ({ ...f, image_height: parseInt(e.target.value) }))}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500" />
        <div className="flex items-center gap-2">
          <input type="number" min="20" max="1200" step="10" value={form.image_height || ""} onChange={(e) => setForm((f) => ({ ...f, image_height: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Auto"
            className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none text-center" />
          <span className="text-xs text-slate-500">px</span>
          {form.image_height && <button onClick={() => setForm((f) => ({ ...f, image_height: null }))} className="text-[10px] text-slate-500 hover:text-red-400">Reset</button>}
        </div>
      </div>

      {/* Preview */}
      <div>
        <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Preview:</p>
        <div className="overflow-auto max-h-80 bg-slate-950/50 rounded-lg p-2 border border-slate-800">
          <img src={form.image_url} alt="Preview"
            style={{ ...(form.image_width ? { width: `${form.image_width}px`, maxWidth: "100%" } : {}), ...(form.image_height ? { height: `${form.image_height}px`, objectFit: "contain" } : {}) }}
            className={`${!form.image_width ? (IMAGE_SIZE_MAP[form.image_size] || "max-w-md") : ""} rounded-lg border border-slate-600`} />
        </div>
      </div>
    </div>
  );
}