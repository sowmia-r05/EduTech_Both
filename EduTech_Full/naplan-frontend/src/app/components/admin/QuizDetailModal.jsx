/**
 * QuizDetailModal.jsx  (v2 — SHUFFLE PER QUESTION + VOICE/VIDEO SETTINGS)
 *
 * Full quiz viewer & editor:
 *   ✅ View all questions with rendered HTML/images
 *   ✅ Edit question text, options, correct answers
 *   ✅ Delete individual questions
 *   ✅ Edit quiz settings (time, name, etc.)
 *   ✅ NEW: Per-question shuffle_options toggle
 *   ✅ NEW: Quiz-level randomize + voice/video via QuizSettingsExtras
 *
 * Place in: src/app/components/admin/QuizDetailModal.jsx
 */

import { useState, useEffect } from "react";
import QuizSettingsExtras from "./QuizSettingsExtras"; // ✅ NEW

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

/* ─── Render HTML content safely (for question text with images) ─── */
function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ overflowWrap: "break-word" }}
    />
  );
}

/* ─── Type Badge ─── */
function TypeBadge({ type }) {
  const styles = {
    radio_button: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    free_text: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    checkbox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  const labels = {
    radio_button: "Single Choice",
    picture_choice: "Picture Choice",
    free_text: "Free Text",
    checkbox: "Multiple Choice",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>
      {labels[type] || type}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   Question Edit Form (inline)
   ═══════════════════════════════════════════════════════ */
function QuestionEditor({ question, onSave, onCancel }) {
  const [form, setForm] = useState({
    text: question.text || "",
    type: question.type || "radio_button",
    points: question.points || 1,
    category: question.categories?.[0]?.name || "",
    image_url: question.image_url || "",
    explanation: question.explanation || "",
    shuffle_options: question.shuffle_options || false, // ✅ NEW
    options: (question.options || []).map((o) => ({
      option_id: o.option_id,
      text: o.text || "",
      image_url: o.image_url || "",
      correct: o.correct || false,
    })),
  });
  const [saving, setSaving] = useState(false);

  const updateOption = (idx, field, value) => {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && f.type === "radio_button") {
        opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      }
      return { ...f, options: opts };
    });
  };

  const addOption = () => {
    setForm((f) => ({
      ...f,
      options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }],
    }));
  };

  const removeOption = (idx) => {
    if (form.options.length <= 2 && form.type !== "free_text") return;
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, {
      text: form.text,
      type: form.type,
      points: form.points,
      category: form.category,
      image_url: form.image_url,
      explanation: form.explanation,
      shuffle_options: form.shuffle_options, // ✅ NEW
      options: form.options,
    });
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border border-indigo-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-indigo-400">Edit Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white">Cancel</button>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text (HTML supported)</label>
        <textarea rows={3} value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none" />
      </div>

      {/* Type / Points / Category / Image */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            <option value="radio_button">Single Choice</option>
            <option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option>
            <option value="free_text">Free Text</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min="1" value={form.points}
            onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Image URL</label>
          <input type="text" value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation</label>
        <input type="text" value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      </div>

      {/* ✅ NEW: Per-question shuffle toggle */}
      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={form.shuffle_options}
          onChange={(e) => setForm((f) => ({ ...f, shuffle_options: e.target.checked }))}
          className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
        />
        🔀 Shuffle Options (randomize answer order for this question)
      </label>

      {/* Options */}
      {form.type !== "free_text" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Options (check = correct)</label>
            <button onClick={addOption} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add</button>
          </div>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  onClick={() => updateOption(i, "correct", !opt.correct)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${
                    opt.correct
                      ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600 hover:border-slate-500"
                  }`}
                >
                  {opt.correct && "✓"}
                </button>
                <span className="text-xs text-slate-500 w-4">{String.fromCharCode(65 + i)}</span>
                <input type="text" value={opt.text}
                  onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder="Option text..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                {form.type === "picture_choice" && (
                  <input type="text" value={opt.image_url || ""}
                    onChange={(e) => updateOption(i, "image_url", e.target.value)}
                    placeholder="Image URL..."
                    className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                )}
                {form.options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

/* ═══════════════════════════════════════════════════════
   MAIN: QuizDetailModal
   ═══════════════════════════════════════════════════════ */
export default function QuizDetailModal({ quizId, onClose, onRefresh }) {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editSettings, setEditSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed to fetch quiz");
      const data = await res.json();
      setQuiz(data);
      setQuestions(data.questions || []);
      setSettingsForm({
        quiz_name: data.quiz_name || "",
        time_limit_minutes: data.time_limit_minutes ?? "",
        difficulty: data.difficulty || "",
        tier: data.tier || "A",
        year_level: data.year_level || 3,
        subject: data.subject || "",
        is_active: data.is_active !== false,
        is_trial: data.is_trial || false,
        // ✅ NEW: randomization + media
        randomize_questions: data.randomize_questions || false,
        randomize_options: data.randomize_options || false,
        voice_url: data.voice_url || null,
        video_url: data.video_url || null,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (quizId) fetchDetail(); }, [quizId]);

  const handleSaveQuestion = async (questionId, updates) => {
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setEditingId(null);
        fetchDetail();
      } else {
        const d = await res.json();
        alert(d.error || "Save failed");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchDetail();
      else alert("Delete failed");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name: settingsForm.quiz_name,
          time_limit_minutes: settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty: settingsForm.difficulty || null,
          tier: settingsForm.tier,
          year_level: Number(settingsForm.year_level),
          subject: settingsForm.subject,
          is_active: settingsForm.is_active,
          is_trial: settingsForm.is_trial,
          // ✅ NEW: randomization + media
          randomize_questions: settingsForm.randomize_questions,
          randomize_options: settingsForm.randomize_options,
          voice_url: settingsForm.voice_url || null,
          video_url: settingsForm.video_url || null,
        }),
      });
      if (res.ok) {
        setEditSettings(false);
        fetchDetail();
        onRefresh?.();
      } else {
        const d = await res.json();
        alert(d.error || "Save failed");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  if (!quizId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl mx-4 my-8 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 rounded-t-2xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{quiz?.quiz_name || "Loading..."}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                {quiz && (
                  <>
                    <span>Year {quiz.year_level}</span>
                    <span>•</span>
                    <span>{quiz.subject}</span>
                    <span>•</span>
                    <span>Tier {quiz.tier}</span>
                    <span>•</span>
                    <span>{questions.length} questions</span>
                    <span>•</span>
                    <span>{quiz.total_points} points</span>
                    {quiz.time_limit_minutes && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditSettings(!editSettings)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition">
                ⚙️ Settings
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Settings Panel (collapsible) */}
          {editSettings && (
            <div className="mt-4 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
                  <input type="text" value={settingsForm.quiz_name}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time Limit (min)</label>
                  <input type="number" value={settingsForm.time_limit_minutes}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                    placeholder="No limit"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Year</label>
                  <select value={settingsForm.year_level}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, year_level: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                    <option value="3">Year 3</option><option value="5">Year 5</option>
                    <option value="7">Year 7</option><option value="9">Year 9</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Subject</label>
                  <select value={settingsForm.subject}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                    <option value="Maths">Maths</option><option value="Reading">Reading</option>
                    <option value="Writing">Writing</option><option value="Conventions">Conventions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                  <select value={settingsForm.difficulty}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                    <option value="">None</option><option value="easy">Easy</option>
                    <option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tier</label>
                  <select value={settingsForm.tier}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, tier: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                    <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                  </select>
                </div>
              </div>

              {/* ✅ NEW: Randomization + Voice/Video settings */}
              <QuizSettingsExtras form={settingsForm} onChange={setSettingsForm} compact />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_active}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800" />
                  Active
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_trial}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800" />
                  Trial (free)
                </label>
                <div className="flex-1" />
                <button onClick={() => setEditSettings(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                <button onClick={handleSaveSettings}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg">
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Body — Questions List */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No questions found</div>
          ) : (
            questions.map((q, i) => {
              const isEditing = editingId === q.question_id;

              if (isEditing) {
                return (
                  <QuestionEditor
                    key={q.question_id}
                    question={q}
                    onSave={handleSaveQuestion}
                    onCancel={() => setEditingId(null)}
                  />
                );
              }

              return (
                <div key={q.question_id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 group hover:border-slate-700 transition">
                  {/* Question Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">
                        {i + 1}
                      </span>
                      <TypeBadge type={q.type} />
                      <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                      {q.categories?.[0]?.name && (
                        <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>
                      )}
                      {/* ✅ NEW: Shuffle badge */}
                      {q.shuffle_options && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                          🔀 Shuffle
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setEditingId(q.question_id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                      <button onClick={() => handleDeleteQuestion(q.question_id)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium">Delete</button>
                    </div>
                  </div>

                  {/* Question Text — renders HTML for images */}
                  <div className="mb-3">
                    <HtmlContent
                      html={q.text}
                      className="text-sm text-white leading-relaxed [&_img]:max-w-md [&_img]:rounded-lg [&_img]:mt-2 [&_img]:border [&_img]:border-slate-700"
                    />
                  </div>

                  {/* Question image (if separate from text) */}
                  {q.image_url && !q.text?.includes(q.image_url) && (
                    <div className="mb-3">
                      <img src={q.image_url} alt="Question" className="max-w-md rounded-lg border border-slate-700" />
                    </div>
                  )}

                  {/* Options */}
                  {q.options && q.options.length > 0 && (
                    <div className="space-y-1.5 ml-10">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        return (
                          <div key={opt.option_id || oi}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                              opt.correct
                                ? "bg-emerald-500/10 border border-emerald-500/20"
                                : "bg-slate-800/50"
                            }`}>
                            <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                              opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"
                            }`}>
                              {opt.correct ? "✓" : letter}
                            </span>
                            <span className="text-slate-300 text-sm">{opt.text}</span>
                            {opt.image_url && (
                              <img src={opt.image_url} alt={`Option ${letter}`} className="w-16 h-16 rounded-lg object-cover border border-slate-700" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="mt-3 ml-10 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <p className="text-xs text-amber-400/80">💡 {q.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-6 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Close</button>
        </div>
      </div>
    </div>
  );
}