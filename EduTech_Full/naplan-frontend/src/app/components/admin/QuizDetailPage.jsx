/**
 * QuizDetailPage.jsx  (v8 — DARK THEME + FREE TEXT PREVIEW)
 *
 *   ✅ Inline "Add Question" — create new questions directly on this page
 *   ✅ Shuffle cascade: quiz-level master → per-question override
 *   ✅ Per-question: voice_url, video_url, image resize (width + height)
 *   ✅ Simplified settings, no quiz-level voice/video
 *   ✅ Collapsible image resize widget (no more endless scrolling)
 *   ✅ Student writing area preview when free_text is selected
 *
 * Place in: src/app/components/admin/QuizDetailPage.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizSettingsExtras from "./QuizSettingsExtras";
import CollapsibleImageResize from "./CollapsibleImageResize";
import FreeTextPreview from "./FreeTextPreview";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

/* ── File Upload Button (reusable) ── */
function FileUploadButton({ onUploaded, accept = "image/*,.pdf", label = "Upload" }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = { current: null };
  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/admin/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Upload failed"); }
      const data = await res.json();
      onUploaded(data.url.startsWith("http") ? data.url : `${API}${data.url}`, data);
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };
  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs text-slate-300 rounded-lg border border-slate-600 transition flex items-center gap-1.5 flex-shrink-0">
        {uploading ? <><span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> Uploading...</> : <><span className="text-sm">📎</span> {label}</>}
      </button>
      <input ref={(el) => (inputRef.current = el)} type="file" accept={accept} className="hidden" onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function TypeBadge({ type }) {
  const map = {
    radio_button: { label: "Single Choice", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    checkbox: { label: "Multiple Choice", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    picture_choice: { label: "Picture Choice", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    free_text: { label: "Free Text", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  };
  const { label, cls } = map[type] || { label: type, cls: "bg-slate-500/10 text-slate-400" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{label}</span>;
}

const IMAGE_SIZE_MAP = { small: "max-w-[200px]", medium: "max-w-md", large: "max-w-xl", full: "max-w-full" };

/* ── Shared: Options Editor ── */
function OptionsEditor({ form, setForm }) {
  const updateOption = (idx, field, value) => {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && f.type === "radio_button") opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      return { ...f, options: opts };
    });
  };
  const addOption = () => { if (form.options.length >= 8) return; setForm((f) => ({ ...f, options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }] })); };
  const removeOption = (idx) => { if (form.options.length <= 2) return; setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) })); };
  if (form.type === "free_text") return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-slate-400">Options (click ✓ for correct)</label>
        <button onClick={addOption} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add</button>
      </div>
      <div className="space-y-2">
        {form.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button onClick={() => updateOption(i, "correct", !opt.correct)}
              className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600 hover:border-slate-500"}`}>
              {opt.correct && "✓"}
            </button>
            <span className="text-xs text-slate-500 w-4">{String.fromCharCode(65 + i)}</span>
            <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)} placeholder="Option text..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
            {form.type === "picture_choice" && (
              <>
                <input type="text" value={opt.image_url || ""} onChange={(e) => updateOption(i, "image_url", e.target.value)} placeholder="Image URL..."
                  className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                <FileUploadButton accept="image/*" label="📎" onUploaded={(url) => updateOption(i, "image_url", url)} />
              </>
            )}
            {form.options.length > 2 && <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared: Per-question settings block ── */
function QuestionSettingsBlock({ form, setForm, quizRandomizeOptions }) {
  return (
    <div className="pt-3 border-t border-slate-700 space-y-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Question Settings</p>
      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={form.shuffle_options}
          onChange={(e) => setForm((f) => ({ ...f, shuffle_options: e.target.checked }))}
          className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
        🔀 Shuffle Options
        {quizRandomizeOptions && <span className="text-[10px] text-slate-500 ml-1">(quiz default: ON)</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">🔊 Voice / Audio URL</label>
          <input type="url" value={form.voice_url} onChange={(e) => setForm((f) => ({ ...f, voice_url: e.target.value }))}
            placeholder="https://... .mp3 / .wav" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">🎬 Video URL</label>
          <input type="url" value={form.video_url} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
            placeholder="https://... YouTube / .mp4" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   EDIT existing question
   ═══════════════════════════════════════ */
function QuestionEditor({ question, quizRandomizeOptions, onSave, onCancel }) {
  const resolvedShuffle = question.shuffle_options != null ? question.shuffle_options : (quizRandomizeOptions || false);
  const [form, setForm] = useState({
    text: question.text || "", type: question.type || "radio_button", points: question.points || 1,
    category: question.categories?.[0]?.name || "", image_url: question.image_url || "",
    image_size: question.image_size || "medium", image_width: question.image_width || null, image_height: question.image_height || null,
    explanation: question.explanation || "", shuffle_options: resolvedShuffle,
    voice_url: question.voice_url || "", video_url: question.video_url || "",
    options: (question.options || []).map((o) => ({ option_id: o.option_id, text: o.text || "", image_url: o.image_url || "", correct: o.correct || false })),
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, {
      text: form.text, type: form.type, points: form.points, category: form.category,
      image_url: form.image_url, image_size: form.image_size, image_width: form.image_width, image_height: form.image_height,
      explanation: form.explanation, shuffle_options: form.shuffle_options,
      voice_url: form.voice_url || null, video_url: form.video_url || null, options: form.options,
    });
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border-2 border-indigo-500/40 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-indigo-400">✏️ Editing Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-700">Cancel</button>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Question Text (HTML supported)</label>
        <textarea rows={4} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white font-mono resize-y focus:ring-2 focus:ring-indigo-500 outline-none" />
        {form.text && (
          <div className="mt-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Preview:</p>
            <HtmlContent html={form.text} className="text-sm text-white [&_img]:max-w-sm [&_img]:rounded-lg [&_img]:mt-1" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            <option value="radio_button">Single Choice</option><option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option><option value="free_text">Free Text</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min="1" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Image (paste URL or upload)</label>
        <div className="flex items-center gap-2">
          <input type="text" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://... or upload →"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
          <FileUploadButton accept="image/*,.pdf" label="Upload" onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} />
        </div>
        {form.image_url && !form.image_url.toLowerCase().endsWith(".pdf") && (
          <img src={form.image_url} alt="Preview" className="mt-2 max-w-[180px] max-h-24 rounded border border-slate-700 object-contain" />
        )}
        {form.image_url && form.image_url.toLowerCase().endsWith(".pdf") && (
          <a href={form.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-red-400 hover:text-red-300">📄 PDF — click to preview</a>
        )}
      </div>
      <CollapsibleImageResize form={form} setForm={setForm} />
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation</label>
        <input type="text" value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      </div>
      <QuestionSettingsBlock form={form} setForm={setForm} quizRandomizeOptions={quizRandomizeOptions} />
      <FreeTextPreview form={form} />
      <OptionsEditor form={form} setForm={setForm} />
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ADD NEW QUESTION
   ═══════════════════════════════════════ */
function AddQuestionForm({ quizId, quizRandomizeOptions, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    text: "", type: "radio_button", points: 1, category: "",
    image_url: "", image_size: "medium", image_width: null, image_height: null,
    explanation: "", shuffle_options: quizRandomizeOptions || false,
    voice_url: "", video_url: "",
    options: [
      { option_id: "", text: "", image_url: "", correct: false },
      { option_id: "", text: "", image_url: "", correct: false },
      { option_id: "", text: "", image_url: "", correct: false },
      { option_id: "", text: "", image_url: "", correct: false },
    ],
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.text.trim()) return alert("Question text is required");
    if (form.type !== "free_text") {
      if (form.options.filter((o) => o.text.trim()).length < 2) return alert("At least 2 options required");
      if (!form.options.some((o) => o.correct)) return alert("Mark at least one correct answer");
    }
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}/questions`, {
        method: "POST",
        body: JSON.stringify({
          text: form.text.trim(), type: form.type, points: form.points, category: form.category.trim(),
          image_url: form.image_url.trim() || null, image_size: form.image_size,
          image_width: form.image_width, image_height: form.image_height,
          explanation: form.explanation.trim() || null, shuffle_options: form.shuffle_options,
          voice_url: form.voice_url.trim() || null, video_url: form.video_url.trim() || null,
          options: form.type === "free_text" ? [] : form.options.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), image_url: o.image_url?.trim() || null, correct: o.correct })),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to add question"); }
      onSuccess();
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  return (
    <div className="bg-emerald-500/5 border-2 border-emerald-500/30 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-emerald-400">➕ Add New Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-700">Cancel</button>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Question Text * (HTML supported)</label>
        <textarea rows={4} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} placeholder="Enter the question..."
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white font-mono resize-y focus:ring-2 focus:ring-emerald-500 outline-none" />
        {form.text && (
          <div className="mt-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Preview:</p>
            <HtmlContent html={form.text} className="text-sm text-white [&_img]:max-w-sm [&_img]:rounded-lg [&_img]:mt-1" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type *</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            <option value="radio_button">Single Choice</option><option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option><option value="free_text">Free Text</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min="1" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Number patterns"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Image (paste URL or upload)</label>
        <div className="flex items-center gap-2">
          <input type="text" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://... or upload →"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
          <FileUploadButton accept="image/*,.pdf" label="Upload" onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} />
        </div>
        {form.image_url && !form.image_url.toLowerCase().endsWith(".pdf") && (
          <img src={form.image_url} alt="Preview" className="mt-2 max-w-[180px] max-h-24 rounded border border-slate-700 object-contain" />
        )}
        {form.image_url && form.image_url.toLowerCase().endsWith(".pdf") && (
          <a href={form.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-red-400 hover:text-red-300">📄 PDF — click to preview</a>
        )}
      </div>
      <CollapsibleImageResize form={form} setForm={setForm} />
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation (shown after answer)</label>
        <input type="text" value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      </div>
      <QuestionSettingsBlock form={form} setForm={setForm} quizRandomizeOptions={quizRandomizeOptions} />
      <FreeTextPreview form={form} />
      <OptionsEditor form={form} setForm={setForm} />
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
          {saving ? "Adding..." : "Add Question"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */
export default function QuizDetailPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (res.status === 401 || res.status === 403) { navigate("/admin"); return; }
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setQuiz(data); setQuestions(data.questions || []);
      setSettingsForm({
        quiz_name: data.quiz_name || "", time_limit_minutes: data.time_limit_minutes ?? "",
        difficulty: data.difficulty || "", is_active: data.is_active !== false, is_trial: data.is_trial || false,
        randomize_questions: data.randomize_questions || false, randomize_options: data.randomize_options || false,
        max_attempts: data.max_attempts ?? null,
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [quizId, navigate]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleSaveQuestion = async (questionId, updates) => {
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(updates) });
      if (res.ok) { setEditingId(null); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
      if (res.ok) fetchDetail(); else alert("Delete failed");
    } catch (err) { alert(err.message); }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name: settingsForm.quiz_name,
          time_limit_minutes: settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty: settingsForm.difficulty || null, is_active: settingsForm.is_active, is_trial: settingsForm.is_trial,
          randomize_questions: settingsForm.randomize_questions, randomize_options: settingsForm.randomize_options,
          max_attempts: settingsForm.max_attempts,
        }),
      });
      if (res.ok) { setShowSettings(false); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
    setSavingSettings(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!quiz) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
      <div className="text-center">
        <p className="text-lg">Quiz not found</p>
        <button onClick={() => navigate("/admin/dashboard")} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">← Back</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Back
            </button>
            <div className="h-5 w-px bg-slate-700" />
            <div>
              <h1 className="text-sm font-semibold">{quiz.quiz_name}</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Year {quiz.year_level}</span><span>•</span><span>{quiz.subject}</span><span>•</span>
                <span>Tier {quiz.tier}</span><span>•</span><span>{questions.length} questions</span><span>•</span><span>{quiz.total_points} pts</span>
                {quiz.time_limit_minutes && <><span>•</span><span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowAddForm(true); setEditingId(null); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition">
              + Add Question
            </button>
            <button onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${showSettings ? "bg-indigo-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}>
              ⚙️ Settings
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-t border-slate-800 bg-slate-900/80">
            <div className="max-w-5xl mx-auto px-6 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
                  <input type="text" value={settingsForm.quiz_name} onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time Limit (minutes)</label>
                  <input type="number" value={settingsForm.time_limit_minutes} onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))} placeholder="No limit"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                  <select value={settingsForm.difficulty} onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Auto</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <QuizSettingsExtras form={settingsForm} onChange={setSettingsForm} compact />
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_active} onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Active
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_trial} onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Trial (free)
                </label>
                <div className="flex-1" />
                <button onClick={() => setShowSettings(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                <button onClick={handleSaveSettings} disabled={savingSettings}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
                  {savingSettings ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Questions */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {showAddForm && (
          <AddQuestionForm quizId={quizId} quizRandomizeOptions={quiz.randomize_options}
            onSuccess={() => { setShowAddForm(false); fetchDetail(); }} onCancel={() => setShowAddForm(false)} />
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">{questions.length} question{questions.length !== 1 ? "s" : ""} • {quiz.total_points} total points</p>
          {!showAddForm && (
            <button onClick={() => { setShowAddForm(true); setEditingId(null); }} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1">
              <span className="text-sm leading-none">+</span> Add Question
            </button>
          )}
        </div>

        {questions.length === 0 && !showAddForm ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center mb-4"><span className="text-2xl">📝</span></div>
            <p className="text-slate-500 mb-4">No questions in this quiz yet.</p>
            <button onClick={() => setShowAddForm(true)} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">+ Add Your First Question</button>
          </div>
        ) : (
          questions.map((q, i) => {
            if (editingId === q.question_id) {
              return <QuestionEditor key={q.question_id} question={q} quizRandomizeOptions={quiz.randomize_options} onSave={handleSaveQuestion} onCancel={() => setEditingId(null)} />;
            }
            const imgSizeCls = IMAGE_SIZE_MAP[q.image_size] || "max-w-md";
            const imgStyle = (q.image_width || q.image_height) ? {
              ...(q.image_width ? { width: `${q.image_width}px`, maxWidth: "100%" } : {}),
              ...(q.image_height ? { height: `${q.image_height}px`, objectFit: "contain" } : {}),
            } : undefined;
            const effectiveShuffle = q.shuffle_options != null ? q.shuffle_options : (quiz.randomize_options || false);

            return (
              <div key={q.question_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800/50">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-400">{i + 1}</span>
                    <TypeBadge type={q.type} />
                    <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                    {q.categories?.[0]?.name && <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>}
                    {effectiveShuffle && <span className="text-[10px] px-2 py-0.5 rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-medium">🔀 Shuffle</span>}
                    {q.voice_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20 font-medium">🔊 Audio</span>}
                    {q.video_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/20 font-medium">🎬 Video</span>}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => { setEditingId(q.question_id); setShowAddForm(false); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                    <button onClick={() => handleDeleteQuestion(q.question_id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Delete</button>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <HtmlContent html={q.text} className={`text-sm text-white leading-relaxed [&_img]:${imgSizeCls} [&_img]:rounded-lg [&_img]:mt-2 [&_img]:border [&_img]:border-slate-700`} />
                  {q.image_url && !q.text?.includes(q.image_url) && (
                    <div className="mt-3"><img src={q.image_url} alt="Question" style={imgStyle} className={`${!q.image_width ? imgSizeCls : ""} rounded-lg border border-slate-700`} /></div>
                  )}
                  {q.options?.length > 0 && (
                    <div className="space-y-1.5 mt-4 ml-6">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        return (
                          <div key={opt.option_id || oi} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"}`}>
                            <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                              {opt.correct ? "✓" : letter}
                            </span>
                            <span className="text-slate-300 text-sm">{opt.text}</span>
                            {opt.image_url && <img src={opt.image_url} alt={`Option ${letter}`} className="w-16 h-16 rounded-lg object-cover border border-slate-700" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {q.explanation && (
                    <div className="mt-4 ml-6 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-0.5">Explanation</p>
                      <p className="text-xs text-amber-400/80">{q.explanation}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {questions.length > 0 && !showAddForm && (
          <button onClick={() => { setShowAddForm(true); setEditingId(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-sm text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30 transition flex items-center justify-center gap-2">
            <span className="text-lg leading-none">+</span> Add Another Question
          </button>
        )}
      </main>
    </div>
  );
}