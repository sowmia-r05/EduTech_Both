/**
 * QuizDetailPage.jsx
 * 
 * Standalone page to view & edit all questions in a quiz.
 * Navigate to: /admin/quiz/:quizId
 * 
 * Place in: src/app/components/admin/QuizDetailPage.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

/* ─── Render HTML content safely (images, formatting) ─── */
function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ─── Type Badge ─── */
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

/* ═══════════════════════════════════════
   Inline Question Editor
   ═══════════════════════════════════════ */
function QuestionEditor({ question, onSave, onCancel }) {
  const [form, setForm] = useState({
    text: question.text || "",
    type: question.type || "radio_button",
    points: question.points || 1,
    category: question.categories?.[0]?.name || "",
    image_url: question.image_url || "",
    explanation: question.explanation || "",
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
    setForm((f) => ({ ...f, options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }] }));
  };

  const removeOption = (idx) => {
    if (form.options.length <= 2 && form.type !== "free_text") return;
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, form);
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border-2 border-indigo-500/40 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-indigo-400">✏️ Editing Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-700">Cancel</button>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Question Text (supports HTML for images)</label>
        <textarea rows={5} value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white font-mono resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
        {/* Preview */}
        {form.text && (
          <div className="mt-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Preview:</p>
            <HtmlContent html={form.text} className="text-sm text-white [&_img]:max-w-sm [&_img]:rounded-lg [&_img]:mt-1" />
          </div>
        )}
      </div>

      {/* Type / Points / Category / Image */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="radio_button">Single Choice</option>
            <option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option>
            <option value="free_text">Free Text</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points</label>
          <input type="number" min={1} value={form.points}
            onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input type="text" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Fractions"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Image URL</label>
          <input type="text" value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            placeholder="https://..."
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none" />
        </div>
      </div>

      {/* Explanation */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation (shown after answer)</label>
        <input type="text" value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none" />
      </div>

      {/* Options */}
      {form.type !== "free_text" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">Options — click checkbox to mark correct answer{form.type === "checkbox" ? "s" : ""}</label>
            <button onClick={addOption} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">+ Add Option</button>
          </div>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-900/50 rounded-lg px-3 py-2">
                <button onClick={() => updateOption(i, "correct", !opt.correct)}
                  className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center border-2 text-xs font-bold transition ${
                    opt.correct ? "bg-emerald-600 border-emerald-400 text-white" : "bg-slate-800 border-slate-600 text-transparent hover:border-slate-400"
                  }`}>✓</button>
                <span className="text-xs font-bold text-slate-500 w-5">{String.fromCharCode(65 + i)}</span>
                <input type="text" value={opt.text}
                  onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)} text...`}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none" />
                {(form.type === "picture_choice") && (
                  <input type="text" value={opt.image_url || ""}
                    onChange={(e) => updateOption(i, "image_url", e.target.value)}
                    placeholder="Image URL..."
                    className="w-40 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-white outline-none" />
                )}
                {form.options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-red-400 text-sm font-bold">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
          {saving ? "Saving..." : "Save Changes"}
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (res.status === 401 || res.status === 403) { navigate("/admin"); return; }
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
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [quizId, navigate]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  /* ── Save question ── */
  const handleSaveQuestion = async (questionId, updates) => {
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (res.ok) { setEditingId(null); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  /* ── Delete question ── */
  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
      if (res.ok) fetchDetail();
      else alert("Delete failed");
    } catch (err) { alert(err.message); }
  };

  /* ── Save quiz settings ── */
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...settingsForm,
          time_limit_minutes: settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          year_level: Number(settingsForm.year_level),
          difficulty: settingsForm.difficulty || null,
        }),
      });
      if (res.ok) { setShowSettings(false); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
    setSavingSettings(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-lg">Quiz not found</p>
          <button onClick={() => navigate("/admin/dashboard")} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/admin/dashboard")}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>
            <div className="h-5 w-px bg-slate-700" />
            <div>
              <h1 className="text-sm font-semibold">{quiz.quiz_name}</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Year {quiz.year_level}</span>
                <span>•</span>
                <span>{quiz.subject}</span>
                <span>•</span>
                <span>Tier {quiz.tier}</span>
                <span>•</span>
                <span>{questions.length} questions</span>
                <span>•</span>
                <span>{quiz.total_points} pts</span>
                {quiz.time_limit_minutes && (
                  <><span>•</span><span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span></>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-1.5 text-xs rounded-lg transition ${showSettings ? "bg-indigo-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}>
            ⚙️ Quiz Settings
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-t border-slate-800 bg-slate-900/80">
            <div className="max-w-5xl mx-auto px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
                  <input type="text" value={settingsForm.quiz_name}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time Limit (minutes)</label>
                  <input type="number" value={settingsForm.time_limit_minutes}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                    placeholder="No limit"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Year Level</label>
                  <select value={settingsForm.year_level}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, year_level: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <option value={3}>Year 3</option><option value={5}>Year 5</option>
                    <option value={7}>Year 7</option><option value={9}>Year 9</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Subject</label>
                  <select value={settingsForm.subject}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <option value="Maths">Maths</option><option value="Reading">Reading</option>
                    <option value="Writing">Writing</option><option value="Conventions">Conventions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                  <select value={settingsForm.difficulty}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <option value="">Auto</option><option value="easy">Easy</option>
                    <option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tier</label>
                  <select value={settingsForm.tier}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, tier: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <option value="A">A — Full Tests</option><option value="B">B — Topic Standard</option><option value="C">C — Topic Hard</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={settingsForm.is_active}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-slate-600 bg-slate-800" /> Active
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={settingsForm.is_trial}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))}
                      className="rounded border-slate-600 bg-slate-800" /> Trial (free)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
                  <button onClick={handleSaveSettings} disabled={savingSettings}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
                    {savingSettings ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ─── Questions List ─── */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {questions.length === 0 ? (
          <div className="text-center py-20 text-slate-500">No questions in this quiz.</div>
        ) : (
          questions.map((q, i) => {
            if (editingId === q.question_id) {
              return <QuestionEditor key={q.question_id} question={q} onSave={handleSaveQuestion} onCancel={() => setEditingId(null)} />;
            }

            return (
              <div key={q.question_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-slate-700 transition">
                {/* Question Header Bar */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-400">
                      {i + 1}
                    </span>
                    <TypeBadge type={q.type} />
                    <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                    {q.categories?.[0]?.name && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => setEditingId(q.question_id)}
                      className="px-3 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition">
                      ✏️ Edit
                    </button>
                    <button onClick={() => handleDeleteQuestion(q.question_id)}
                      className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition">
                      🗑 Delete
                    </button>
                  </div>
                </div>

                {/* Question Body */}
                <div className="px-5 py-4">
                  {/* Question Text — renders HTML with embedded images */}
                  <HtmlContent
                    html={q.text}
                    className="text-sm text-white leading-relaxed [&_img]:max-w-lg [&_img]:rounded-lg [&_img]:my-3 [&_img]:border [&_img]:border-slate-700 [&_p]:mb-2"
                  />

                  {/* Separate image_url field */}
                  {q.image_url && !q.text?.includes(q.image_url) && (
                    <img src={q.image_url} alt="Question" className="max-w-lg rounded-lg border border-slate-700 mt-2" />
                  )}

                  {/* Options */}
                  {q.options && q.options.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        return (
                          <div key={opt.option_id || oi}
                            className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm transition ${
                              opt.correct
                                ? "bg-emerald-500/10 border border-emerald-500/20 ring-1 ring-emerald-500/10"
                                : "bg-slate-800/40 border border-slate-800"
                            }`}>
                            <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                              opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"
                            }`}>{letter}</span>
                            <div className="flex-1 min-w-0">
                              {opt.text && (
                                <HtmlContent html={opt.text} className="text-slate-300 [&_img]:max-w-xs [&_img]:rounded [&_img]:mt-1 [&_img]:border [&_img]:border-slate-700" />
                              )}
                              {opt.image_url && (
                                <img src={opt.image_url} alt={`Option ${letter}`} className="max-w-xs rounded-lg mt-2 border border-slate-700" />
                              )}
                            </div>
                            {opt.correct && (
                              <span className="flex-shrink-0 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">✓ Correct</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="mt-4 px-4 py-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">Explanation</span>
                      <HtmlContent html={q.explanation} className="text-xs text-amber-300/80 mt-1" />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
