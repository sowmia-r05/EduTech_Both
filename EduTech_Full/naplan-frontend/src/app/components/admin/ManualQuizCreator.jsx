/**
 * ManualQuizCreator.jsx  (v6 — DARK THEME)
 *
 *   ✅ File upload (images + PDFs) via drag-drop or click
 *   ✅ Per-question: voice_url, video_url, shuffle_options
 *   ✅ Per-question: image_size, image_width, image_height
 *   ✅ Option images can also be uploaded
 *
 * Requires: POST /api/admin/upload endpoint (uploadRoutes.js)
 * Place in: src/app/components/admin/ManualQuizCreator.jsx
 */

import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, { ...opts, headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` } });
}

/* ═══════════════════════════════════════
   FILE UPLOAD BUTTON — reusable
   ═══════════════════════════════════════ */
function FileUploadButton({ onUploaded, accept = "image/*,.pdf", label = "Upload" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API}/api/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed");
      }

      const data = await res.json();
      // Build full URL
      const fullUrl = data.url.startsWith("http") ? data.url : `${API}${data.url}`;
      onUploaded(fullUrl, data);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div
      className={`relative ${dragOver ? "ring-2 ring-indigo-500" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs text-slate-300 rounded-lg border border-slate-600 transition flex items-center gap-1.5"
      >
        {uploading ? (
          <><span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> Uploading...</>
        ) : (
          <><span className="text-sm">📎</span> {label}</>
        )}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   IMAGE FIELD — URL input + upload button + preview
   ═══════════════════════════════════════ */
function ImageField({ value, onChange, label = "Image" }) {
  const isPdf = value && value.toLowerCase().endsWith(".pdf");
  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="https://... or upload →"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        <FileUploadButton
          accept="image/*,.pdf"
          label="Upload"
          onUploaded={(url) => onChange(url)}
        />
      </div>
      {/* Preview */}
      {value && (
        <div className="mt-1">
          {isPdf ? (
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition">
              📄 PDF uploaded — click to preview
            </a>
          ) : (
            <img src={value} alt="Preview" className="max-w-[200px] max-h-32 rounded-lg border border-slate-700 object-contain" />
          )}
        </div>
      )}
    </div>
  );
}

const IMAGE_SIZE_MAP = { small: "max-w-[200px]", medium: "max-w-md", large: "max-w-xl", full: "max-w-full" };

/* ═══════════════════════════════════════
   IMAGE RESIZE WIDGET
   ═══════════════════════════════════════ */
function ImageResizeWidget({ form, setForm }) {
  if (!form.image_url) return null;
  const isPdf = form.image_url.toLowerCase().endsWith(".pdf");
  if (isPdf) return null; // No resize for PDFs
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-300">↔ Width</p>
        <span className="text-xs text-indigo-400 font-mono">{form.image_width ? `${form.image_width}px` : form.image_size}</span>
      </div>
      <div className="flex gap-2">
        {[{ label: "S", value: "small", px: 200 },{ label: "M", value: "medium", px: 400 },{ label: "L", value: "large", px: 576 },{ label: "Full", value: "full", px: null }].map((p) => (
          <button key={p.value} onClick={() => setForm((prev) => ({ ...prev, image_size: p.value, image_width: p.px }))}
            className={`px-3 py-1 text-xs rounded-lg border transition ${form.image_size === p.value ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400"}`}>{p.label}</button>
        ))}
      </div>
      <input type="range" min="80" max="900" step="10" value={form.image_width || 400}
        onChange={(e) => { const w = parseInt(e.target.value); setForm((prev) => ({ ...prev, image_width: w, image_size: w <= 200 ? "small" : w <= 448 ? "medium" : w <= 576 ? "large" : "full" })); }}
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
      <div className="flex items-center gap-2">
        <input type="number" min="50" max="1200" step="10" value={form.image_width || ""} onChange={(e) => setForm((prev) => ({ ...prev, image_width: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Auto"
          className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none text-center" />
        <span className="text-xs text-slate-500">px</span>
        {form.image_width && <button onClick={() => setForm((prev) => ({ ...prev, image_width: null }))} className="text-[10px] text-slate-500 hover:text-red-400">Reset</button>}
      </div>
      <div className="pt-2 border-t border-slate-700/50 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">↕ Height</p>
          <span className="text-xs text-violet-400 font-mono">{form.image_height ? `${form.image_height}px` : "Auto"}</span>
        </div>
        <input type="range" min="40" max="800" step="10" value={form.image_height || 300}
          onChange={(e) => setForm((prev) => ({ ...prev, image_height: parseInt(e.target.value) }))}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500" />
        <div className="flex items-center gap-2">
          <input type="number" min="20" max="1200" step="10" value={form.image_height || ""} onChange={(e) => setForm((prev) => ({ ...prev, image_height: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Auto"
            className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none text-center" />
          <span className="text-xs text-slate-500">px</span>
          {form.image_height && <button onClick={() => setForm((prev) => ({ ...prev, image_height: null }))} className="text-[10px] text-slate-500 hover:text-red-400">Reset</button>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ADD QUESTION FORM
   ═══════════════════════════════════════ */
function AddQuestionForm({ onAdd, onCancel }) {
  const [q, setQ] = useState({
    question_text: "", type: "radio_button",
    options: [
      { label: "A", text: "", image_url: "", correct: false },
      { label: "B", text: "", image_url: "", correct: false },
    ],
    points: 1, category: "", image_url: "", image_size: "medium",
    image_width: null, image_height: null,
    explanation: "", voice_url: "", video_url: "", shuffle_options: false,
  });

  const updateOption = (idx, field, value) => {
    setQ((prev) => {
      const opts = [...prev.options]; opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && prev.type === "radio_button") opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      return { ...prev, options: opts };
    });
  };
  const addOption = () => {
    if (q.options.length >= 6) return;
    setQ((prev) => ({ ...prev, options: [...prev.options, { label: String.fromCharCode(65 + prev.options.length), text: "", image_url: "", correct: false }] }));
  };
  const removeOption = (idx) => {
    if (q.options.length <= 2 && q.type !== "free_text") return;
    setQ((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) })) }));
  };

  const handleSave = () => {
    if (!q.question_text.trim()) return alert("Question text is required");
    if (q.type !== "free_text") {
      if (q.options.filter((o) => o.text.trim()).length < 2) return alert("At least 2 options required");
      if (!q.options.some((o) => o.correct)) return alert("Mark at least one correct answer");
    }
    onAdd({
      question_text: q.question_text.trim(), type: q.type,
      options: q.type === "free_text" ? [] : q.options.filter((o) => o.text.trim()).map((o) => ({ label: o.label, text: o.text.trim(), image_url: o.image_url.trim() || null })),
      correct_answer: q.type === "free_text" ? "" : q.options.filter((o) => o.correct).map((o) => o.label).join(","),
      points: q.points, category: q.category.trim(),
      image_url: q.image_url.trim(), image_size: q.image_size, image_width: q.image_width, image_height: q.image_height,
      explanation: q.explanation.trim(),
      voice_url: q.voice_url.trim() || null, video_url: q.video_url.trim() || null, shuffle_options: q.shuffle_options,
    });
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Add New Question</h4>
        <button onClick={onCancel} className="text-slate-400 hover:text-white text-sm">Cancel</button>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text *</label>
        <textarea rows={3} value={q.question_text} onChange={(e) => setQ((p) => ({ ...p, question_text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Enter the question..." />
      </div>

      {/* Type / Points / Category */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type *</label>
          <select value={q.type} onChange={(e) => setQ((p) => ({ ...p, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="radio_button">Single Choice (MCQ)</option><option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option><option value="free_text">Free Text / Writing</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min={1} value={q.points} onChange={(e) => setQ((p) => ({ ...p, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={q.category} onChange={(e) => setQ((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. Number patterns"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
      </div>

      {/* Question Image — URL + Upload */}
      <ImageField
        value={q.image_url}
        onChange={(url) => setQ((p) => ({ ...p, image_url: url }))}
        label="Question Image (paste URL or upload)"
      />

      <ImageResizeWidget form={q} setForm={setQ} />

      {/* Explanation */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation (shown after answer)</label>
        <input type="text" value={q.explanation} onChange={(e) => setQ((p) => ({ ...p, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
      </div>

      {/* Per-question settings */}
      <div className="pt-3 border-t border-slate-700 space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Question Settings</p>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={q.shuffle_options} onChange={(e) => setQ((p) => ({ ...p, shuffle_options: e.target.checked }))}
            className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
          🔀 Shuffle Options
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">🔊 Voice / Audio URL</label>
            <div className="flex items-center gap-2">
              <input type="url" value={q.voice_url} onChange={(e) => setQ((p) => ({ ...p, voice_url: e.target.value }))} placeholder="https://... .mp3"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
              <FileUploadButton accept="audio/*" label="📎" onUploaded={(url) => setQ((p) => ({ ...p, voice_url: url }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">🎬 Video URL</label>
            <input type="url" value={q.video_url} onChange={(e) => setQ((p) => ({ ...p, video_url: e.target.value }))} placeholder="https://... YouTube / .mp4"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
        </div>
      </div>

      {/* Options */}
      {q.type !== "free_text" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">Options * (click ✓ for correct)</label>
            <button onClick={addOption} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add Option</button>
          </div>
          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <div key={i} className="space-y-1.5 bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateOption(i, "correct", !opt.correct)}
                    className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600 text-slate-500"}`}>{opt.correct ? "✓" : opt.label}</button>
                  <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)} placeholder={`Option ${opt.label} text...`}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  {q.options.length > 2 && <button onClick={() => removeOption(i)} className="text-red-500 hover:text-red-400 text-sm font-bold">✕</button>}
                </div>
                {/* Option image — URL or upload */}
                <div className="flex items-center gap-2 ml-8">
                  <input type="text" value={opt.image_url} onChange={(e) => updateOption(i, "image_url", e.target.value)} placeholder="Option image URL (optional)"
                    className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-300 outline-none" />
                  <FileUploadButton accept="image/*" label="📎"
                    onUploaded={(url) => updateOption(i, "image_url", url)} />
                </div>
                {opt.image_url && (
                  <div className="ml-8">
                    <img src={opt.image_url} alt={`Option ${opt.label}`} className="max-w-[120px] max-h-20 rounded border border-slate-700 object-contain" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">Add Question</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN: ManualQuizCreator Modal
   ═══════════════════════════════════════ */
export default function ManualQuizCreator({ isOpen, onClose, onSuccess }) {
  const [meta, setMeta] = useState({
    quiz_name: "", year_level: 0, subject: "", tier: "A",
    time_limit_minutes: 30, difficulty: "", set_number: 1, is_trial: false,
  });
  const [questions, setQuestions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleAddQuestion = (q) => {
    if (editingIdx !== null) { setQuestions((prev) => prev.map((old, i) => (i === editingIdx ? q : old))); setEditingIdx(null); }
    else setQuestions((prev) => [...prev, q]);
    setShowAddForm(false);
  };
  const handleRemoveQuestion = (idx) => setQuestions((prev) => prev.filter((_, i) => i !== idx));
  const moveQuestion = (idx, dir) => {
    setQuestions((prev) => { const arr = [...prev]; const t = idx + dir; if (t < 0 || t >= arr.length) return arr; [arr[idx], arr[t]] = [arr[t], arr[idx]]; return arr; });
  };

  const handleSubmit = async () => {
    setError("");
    if (!meta.quiz_name.trim()) return setError("Quiz title is required");
    if (![3, 5, 7, 9].includes(meta.year_level)) return setError("Year level must be 3, 5, 7, or 9");
    if (!["Maths", "Reading", "Writing", "Conventions"].includes(meta.subject)) return setError("Subject is required");
    if (questions.length === 0) return setError("Add at least one question");
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/quizzes/upload", {
        method: "POST",
        body: JSON.stringify({ quiz: { quiz_name: meta.quiz_name.trim(), year_level: meta.year_level, subject: meta.subject, tier: meta.tier, time_limit_minutes: meta.time_limit_minutes || null, difficulty: meta.difficulty || null, set_number: meta.set_number || 1, is_trial: meta.is_trial }, questions }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Upload failed (${res.status})`); }
      onSuccess?.(); onClose();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Create New Quiz</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Quiz Title *</label>
            <input type="text" value={meta.quiz_name} onChange={(e) => setMeta((m) => ({ ...m, quiz_name: e.target.value }))} placeholder="e.g. Year 3 Maths Set 1"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Year Level *</label>
              <select value={meta.year_level} onChange={(e) => setMeta((m) => ({ ...m, year_level: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value={0}>Select...</option><option value={3}>Year 3</option><option value={5}>Year 5</option><option value={7}>Year 7</option><option value={9}>Year 9</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Subject *</label>
              <select value={meta.subject} onChange={(e) => setMeta((m) => ({ ...m, subject: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value="">Select...</option><option value="Maths">Maths</option><option value="Reading">Reading</option><option value="Writing">Writing</option><option value="Conventions">Conventions</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Time (min)</label>
              <input type="number" value={meta.time_limit_minutes || ""} onChange={(e) => setMeta((m) => ({ ...m, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null }))} placeholder="No limit"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Tier</label>
              <select value={meta.tier} onChange={(e) => setMeta((m) => ({ ...m, tier: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </select>
            </div>
          </div>

          {/* Questions section */}
          <div className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Questions ({questions.length})</h3>
              {!showAddForm && (
                <button onClick={() => { setShowAddForm(true); setEditingIdx(null); }}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1">+ Add Question</button>
              )}
            </div>

            {showAddForm && <AddQuestionForm onAdd={handleAddQuestion} onCancel={() => { setShowAddForm(false); setEditingIdx(null); }} />}

            {questions.length > 0 ? (
              <div className="space-y-2 mt-3">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 group">
                    <span className="text-xs font-bold text-slate-500 w-6 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{q.question_text}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          q.type === "radio_button" ? "bg-blue-500/10 text-blue-400" :
                          q.type === "checkbox" ? "bg-amber-500/10 text-amber-400" :
                          q.type === "free_text" ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-400"
                        }`}>{q.type}</span>
                        <span className="text-[10px] text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                        {q.image_url && <span className="text-[10px] text-sky-400">{q.image_url.endsWith(".pdf") ? "📄" : "🖼️"}</span>}
                        {q.shuffle_options && <span className="text-[10px] text-cyan-400">🔀</span>}
                        {q.voice_url && <span className="text-[10px] text-violet-400">🔊</span>}
                        {q.video_url && <span className="text-[10px] text-pink-400">🎬</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-white text-xs disabled:opacity-30">↑</button>
                      <button onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="text-slate-500 hover:text-white text-xs disabled:opacity-30">↓</button>
                      <button onClick={() => handleRemoveQuestion(i)} className="text-red-500 hover:text-red-400 text-xs ml-1">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !showAddForm && (
              <div className="text-center py-10 text-slate-500 text-sm">No questions yet. Click "Add Question" above.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">{questions.length} question{questions.length !== 1 ? "s" : ""} added</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || questions.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg">
              {submitting ? "Creating..." : "Create Quiz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}