/**
 * ManualQuizCreator.jsx  (v2 — PER-QUESTION MEDIA + IMAGE SIZE)
 *
 * Modal form to manually create quizzes with full per-question controls:
 *   ✅ voice_url, video_url per question
 *   ✅ shuffle_options per question
 *   ✅ image_size per question (small/medium/large/full)
 *
 * Place in: src/app/components/admin/ManualQuizCreator.jsx
 */

import { useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

/* ─── Add Question Form ─── */
function AddQuestionForm({ onAdd, onCancel }) {
  const [q, setQ] = useState({
    question_text: "",
    type: "radio_button",
    options: [
      { label: "A", text: "", image_url: "", correct: false },
      { label: "B", text: "", image_url: "", correct: false },
    ],
    points: 1,
    category: "",
    image_url: "",
    image_size: "medium",
    explanation: "",
    voice_url: "",
    video_url: "",
    shuffle_options: false,
  });

  const updateOption = (idx, field, value) => {
    setQ((prev) => {
      const opts = [...prev.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && prev.type === "radio_button") {
        opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      }
      return { ...prev, options: opts };
    });
  };

  const addOption = () => {
    if (q.options.length >= 6) return;
    const label = String.fromCharCode(65 + q.options.length);
    setQ((prev) => ({ ...prev, options: [...prev.options, { label, text: "", image_url: "", correct: false }] }));
  };

  const removeOption = (idx) => {
    if (q.options.length <= 2 && q.type !== "free_text") return;
    setQ((prev) => {
      const opts = prev.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) }));
      return { ...prev, options: opts };
    });
  };

  const handleSave = () => {
    if (!q.question_text.trim()) return alert("Question text is required");
    if (q.type !== "free_text") {
      if (q.options.filter((o) => o.text.trim()).length < 2) return alert("At least 2 options required");
      if (!q.options.some((o) => o.correct)) return alert("Mark at least one correct answer");
    }
    const correct_answer = q.options.filter((o) => o.correct).map((o) => o.label).join(",");
    onAdd({
      question_text: q.question_text.trim(),
      type: q.type,
      options: q.type === "free_text" ? [] : q.options.filter((o) => o.text.trim()).map((o) => ({
        label: o.label, text: o.text.trim(), image_url: o.image_url.trim() || null,
      })),
      correct_answer: q.type === "free_text" ? "" : correct_answer,
      points: q.points,
      category: q.category.trim(),
      image_url: q.image_url.trim(),
      image_size: q.image_size,
      explanation: q.explanation.trim(),
      voice_url: q.voice_url.trim() || null,
      video_url: q.video_url.trim() || null,
      shuffle_options: q.shuffle_options,
    });
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Add New Question</h4>
        <button onClick={onCancel} className="text-slate-400 hover:text-white text-sm">Cancel</button>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text *</label>
        <textarea rows={3} value={q.question_text}
          onChange={(e) => setQ((p) => ({ ...p, question_text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
          placeholder="Enter the question..." />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type *</label>
          <select value={q.type} onChange={(e) => setQ((p) => ({ ...p, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="radio_button">Single Choice (MCQ)</option>
            <option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option>
            <option value="free_text">Free Text / Writing</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min={1} value={q.points}
            onChange={(e) => setQ((p) => ({ ...p, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={q.category}
            onChange={(e) => setQ((p) => ({ ...p, category: e.target.value }))}
            placeholder="e.g. Number patterns"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-slate-400 mb-1">Image URL</label>
          <input type="text" value={q.image_url}
            onChange={(e) => setQ((p) => ({ ...p, image_url: e.target.value }))}
            placeholder="https://..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">🖼 Image Size</label>
          <select value={q.image_size} onChange={(e) => setQ((p) => ({ ...p, image_size: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="small">Small</option><option value="medium">Medium</option>
            <option value="large">Large</option><option value="full">Full Width</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation (shown after answer)</label>
        <input type="text" value={q.explanation}
          onChange={(e) => setQ((p) => ({ ...p, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
      </div>

      {/* Per-question settings */}
      <div className="pt-3 border-t border-slate-700 space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Question Settings</p>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={q.shuffle_options}
            onChange={(e) => setQ((p) => ({ ...p, shuffle_options: e.target.checked }))}
            className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500" />
          🔀 Shuffle Options
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">🔊 Voice / Audio URL</label>
            <input type="url" value={q.voice_url}
              onChange={(e) => setQ((p) => ({ ...p, voice_url: e.target.value }))}
              placeholder="https://... .mp3 / .wav"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">🎬 Video URL</label>
            <input type="url" value={q.video_url}
              onChange={(e) => setQ((p) => ({ ...p, video_url: e.target.value }))}
              placeholder="https://... YouTube / .mp4"
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
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button onClick={() => updateOption(i, "correct", !opt.correct)}
                  className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${
                    opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500"
                  }`}>{opt.correct ? "✓" : opt.label}</button>
                <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder={`Option ${opt.label}...`}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                <input type="text" value={opt.image_url} onChange={(e) => updateOption(i, "image_url", e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                {q.options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-red-500 hover:text-red-400 text-sm font-bold">✕</button>
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
    if (editingIdx !== null) {
      setQuestions((prev) => prev.map((old, i) => (i === editingIdx ? q : old)));
      setEditingIdx(null);
    } else {
      setQuestions((prev) => [...prev, q]);
    }
    setShowAddForm(false);
  };

  const handleRemoveQuestion = (idx) => setQuestions((prev) => prev.filter((_, i) => i !== idx));

  const moveQuestion = (idx, dir) => {
    setQuestions((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
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
        body: JSON.stringify({ quiz: {
          quiz_name: meta.quiz_name.trim(), year_level: meta.year_level, subject: meta.subject,
          tier: meta.tier, time_limit_minutes: meta.time_limit_minutes || null,
          difficulty: meta.difficulty || null, set_number: meta.set_number || 1, is_trial: meta.is_trial,
        }, questions }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Upload failed (${res.status})`); }
      onSuccess?.();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Create New Quiz</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && <div className="bg-red-900/20 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Quiz Title *</label>
            <input type="text" value={meta.quiz_name}
              onChange={(e) => setMeta((m) => ({ ...m, quiz_name: e.target.value }))}
              placeholder="e.g. Year 3 Maths Set 1"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Year Level *</label>
              <select value={meta.year_level} onChange={(e) => setMeta((m) => ({ ...m, year_level: parseInt(e.target.value) || 0 }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value={0}>Select...</option><option value={3}>Year 3</option><option value={5}>Year 5</option>
                <option value={7}>Year 7</option><option value={9}>Year 9</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Subject *</label>
              <select value={meta.subject} onChange={(e) => setMeta((m) => ({ ...m, subject: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value="">Select...</option><option value="Maths">Maths</option><option value="Reading">Reading</option>
                <option value="Writing">Writing</option><option value="Conventions">Conventions</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Time (min)</label>
              <input type="number" value={meta.time_limit_minutes || ""}
                onChange={(e) => setMeta((m) => ({ ...m, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="No limit"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Tier</label>
              <select value={meta.tier} onChange={(e) => setMeta((m) => ({ ...m, tier: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                <option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </select>
            </div>
          </div>

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
                  <div key={i} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 group">
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