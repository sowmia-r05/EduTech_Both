/**
 * AdminDashboard.jsx
 *
 * SELF-CONTAINED admin panel — includes QuizDetailModal and QuizSettingsModal inline.
 * No separate QuizDetailModal.jsx import needed.
 *
 * Place in: src/app/components/admin/AdminDashboard.jsx
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QuizUploader from "./QuizUploader";
import ManualQuizCreator from "./ManualQuizCreator";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` },
  });
}

/* ─── Render HTML content (for question text with images) ─── */
function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} style={{ overflowWrap: "break-word" }} />
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, icon, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-2xl opacity-60">{icon}</span>
      </div>
    </div>
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
   Question Editor (inline edit form)
   ═══════════════════════════════════════════════════════ */
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
      text: form.text, type: form.type, points: form.points,
      category: form.category, image_url: form.image_url,
      explanation: form.explanation, options: form.options,
    });
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border border-indigo-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-indigo-400">Edit Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white">Cancel</button>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text (supports HTML)</label>
        <textarea rows={4} value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono resize-y focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
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
          <input type="number" min={1} value={form.points}
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
      {form.type !== "free_text" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Options (check = correct)</label>
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
                <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder="Option text..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                {form.type === "picture_choice" && (
                  <input type="text" value={opt.image_url || ""} onChange={(e) => updateOption(i, "image_url", e.target.value)}
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
   Quiz Detail Modal — view & edit all questions
   ═══════════════════════════════════════════════════════ */
function QuizDetailModal({ quizId, onClose, onRefresh }) {
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
        quiz_name: data.quiz_name || "", time_limit_minutes: data.time_limit_minutes ?? "",
        difficulty: data.difficulty || "", tier: data.tier || "A",
        year_level: data.year_level || 3, subject: data.subject || "",
        is_active: data.is_active !== false, is_trial: data.is_trial || false,
      });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { if (quizId) fetchDetail(); }, [quizId]);

  const handleSaveQuestion = async (questionId, updates) => {
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(updates) });
      if (res.ok) { setEditingId(null); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question?")) return;
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
      if (res.ok) fetchDetail(); else alert("Delete failed");
    } catch (err) { alert(err.message); }
  };

  const handleSaveQuizSettings = async () => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name: settingsForm.quiz_name,
          time_limit_minutes: settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty: settingsForm.difficulty || null, tier: settingsForm.tier,
          year_level: Number(settingsForm.year_level), subject: settingsForm.subject,
          is_active: settingsForm.is_active, is_trial: settingsForm.is_trial,
        }),
      });
      if (res.ok) { setEditSettings(false); fetchDetail(); onRefresh?.(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  if (!quizId) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl mx-4 my-8 shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 rounded-t-2xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{quiz?.quiz_name || "Loading..."}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                {quiz && (<>
                  <span>Year {quiz.year_level}</span><span>•</span>
                  <span>{quiz.subject}</span><span>•</span>
                  <span>Tier {quiz.tier}</span><span>•</span>
                  <span>{questions.length} questions</span><span>•</span>
                  <span>{quiz.total_points} pts</span>
                  {quiz.time_limit_minutes && (<><span>•</span><span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span></>)}
                </>)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditSettings(!editSettings)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition">⚙️ Settings</button>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {editSettings && (
            <div className="mt-4 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
                  <input type="text" value={settingsForm.quiz_name} onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time Limit (min)</label>
                  <input type="number" value={settingsForm.time_limit_minutes} onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                    placeholder="No limit" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { key: "year_level", label: "Year", opts: [[3,"Year 3"],[5,"Year 5"],[7,"Year 7"],[9,"Year 9"]] },
                  { key: "subject", label: "Subject", opts: [["Maths","Maths"],["Reading","Reading"],["Writing","Writing"],["Conventions","Conventions"]] },
                  { key: "difficulty", label: "Difficulty", opts: [["","Auto"],["easy","Easy"],["medium","Medium"],["hard","Hard"]] },
                  { key: "tier", label: "Tier", opts: [["A","A"],["B","B"],["C","C"]] },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                    <select value={settingsForm[f.key]} onChange={(e) => setSettingsForm((s) => ({ ...s, [f.key]: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                      {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_active} onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Active
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_trial} onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Trial (free)
                </label>
                <div className="flex-1" />
                <button onClick={() => setEditSettings(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                <button onClick={handleSaveQuizSettings} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg">Save Settings</button>
              </div>
            </div>
          )}
        </div>

        {/* Questions List */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No questions found</div>
          ) : (
            questions.map((q, i) => {
              if (editingId === q.question_id) {
                return <QuestionEditor key={q.question_id} question={q} onSave={handleSaveQuestion} onCancel={() => setEditingId(null)} />;
              }
              return (
                <div key={q.question_id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 group hover:border-slate-700 transition">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">{i + 1}</span>
                      <TypeBadge type={q.type} />
                      <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                      {q.categories?.[0]?.name && <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setEditingId(q.question_id)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                      <button onClick={() => handleDeleteQuestion(q.question_id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Delete</button>
                    </div>
                  </div>
                  {/* Question text — renders HTML */}
                  <div className="mb-3">
                    <HtmlContent html={q.text} className="text-sm text-white leading-relaxed [&_img]:max-w-md [&_img]:rounded-lg [&_img]:mt-2 [&_img]:border [&_img]:border-slate-700" />
                  </div>
                  {/* Separate image */}
                  {q.image_url && !q.text?.includes(q.image_url) && (
                    <div className="mb-3"><img src={q.image_url} alt="Question" className="max-w-md rounded-lg border border-slate-700" /></div>
                  )}
                  {/* Options */}
                  {q.options && q.options.length > 0 && (
                    <div className="space-y-1.5 ml-10">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        return (
                          <div key={opt.option_id || oi}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"}`}>
                            <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>{letter}</span>
                            <div className="flex-1">
                              {opt.text && <HtmlContent html={opt.text} className="text-slate-300 [&_img]:max-w-xs [&_img]:rounded [&_img]:mt-1" />}
                              {opt.image_url && <img src={opt.image_url} alt={`Option ${letter}`} className="max-w-xs rounded mt-1 border border-slate-700" />}
                            </div>
                            {opt.correct && <span className="text-[10px] text-emerald-400 font-medium flex-shrink-0 mt-0.5">✓ Correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Explanation */}
                  {q.explanation && (
                    <div className="mt-3 ml-10 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <span className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Explanation</span>
                      <HtmlContent html={q.explanation} className="text-xs text-amber-300/80 mt-0.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-950 border-t border-slate-800 px-6 py-3 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {questions.length} questions · {quiz?.total_points || 0} total points
              {quiz?.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : " · No time limit"}
            </p>
            <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Quiz Settings Modal (quick edit from table)
   ═══════════════════════════════════════════════════════ */
function QuizSettingsModal({ quiz, onClose, onSave }) {
  const [form, setForm] = useState({
    quiz_name: quiz.quiz_name || "", time_limit_minutes: quiz.time_limit_minutes ?? "",
    difficulty: quiz.difficulty || "", tier: quiz.tier || "A",
    year_level: quiz.year_level || 3, subject: quiz.subject || "",
    is_active: quiz.is_active !== false, is_trial: quiz.is_trial || false,
    set_number: quiz.set_number || 1,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.quiz_name.trim()) return alert("Quiz name is required");
    setSaving(true);
    await onSave({
      quiz_name: form.quiz_name.trim(),
      time_limit_minutes: form.time_limit_minutes === "" ? null : Number(form.time_limit_minutes),
      difficulty: form.difficulty || null, tier: form.tier,
      year_level: Number(form.year_level), subject: form.subject,
      is_active: form.is_active, is_trial: form.is_trial,
      set_number: Number(form.set_number) || 1,
    });
    setSaving(false);
  };

  const u = (field) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Quiz Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Quiz Name</label>
            <input type="text" value={form.quiz_name} onChange={u("quiz_name")}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Time Limit (min)</label>
              <input type="number" min={0} value={form.time_limit_minutes} onChange={u("time_limit_minutes")} placeholder="No limit"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
              <p className="text-[10px] text-slate-500 mt-1">Leave empty for no time limit</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Difficulty</label>
              <select value={form.difficulty} onChange={u("difficulty")}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Auto</option><option value="easy">Easy</option>
                <option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Year Level</label>
              <select value={form.year_level} onChange={u("year_level")}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value={3}>Year 3</option><option value={5}>Year 5</option>
                <option value={7}>Year 7</option><option value={9}>Year 9</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
              <select value={form.subject} onChange={u("subject")}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select...</option><option value="Maths">Maths</option>
                <option value="Reading">Reading</option><option value="Writing">Writing</option>
                <option value="Conventions">Conventions</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Tier</label>
              <select value={form.tier} onChange={u("tier")}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="A">A — Full Tests</option><option value="B">B — Topic Standard</option>
                <option value="C">C — Topic Hard</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={u("is_active")} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600" />
              <span className="text-sm text-slate-300">Active</span><span className="text-[10px] text-slate-500">(visible to students)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_trial} onChange={u("is_trial")} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600" />
              <span className="text-sm text-slate-300">Trial Quiz</span><span className="text-[10px] text-slate-500">(free)</span>
            </label>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-3 mt-2">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><span className="text-slate-500">Quiz ID:</span> <span className="text-slate-400 font-mono">{quiz.quiz_id?.slice(0, 8)}...</span></div>
              <div><span className="text-slate-500">Questions:</span> <span className="text-white font-medium">{quiz.question_count || 0}</span></div>
              <div><span className="text-slate-500">Total Points:</span> <span className="text-white font-medium">{quiz.total_points || 0}</span></div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN: AdminDashboard
   ═══════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("quizzes");
  const [error, setError] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showManualCreator, setShowManualCreator] = useState(false);
  const [bundles, setBundles] = useState([]);
  const [assignQuiz, setAssignQuiz] = useState(null);
  const [editQuiz, setEditQuiz] = useState(null);
  const [viewQuizId, setViewQuizId] = useState(null);

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch("/api/admin/quizzes");
      if (res.status === 401 || res.status === 403) { localStorage.removeItem("admin_token"); navigate("/admin"); return; }
      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : data.quizzes || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const fetchBundles = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/bundles");
      if (res.ok) { const data = await res.json(); setBundles(Array.isArray(data) ? data : []); }
    } catch (err) { console.error("Failed to fetch bundles:", err); }
  }, []);

  useEffect(() => { fetchBundles(); }, [fetchBundles]);

  const handleLogout = () => { localStorage.removeItem("admin_token"); navigate("/admin"); };

  const handleDelete = async (quizId) => {
    if (!confirm("Delete this quiz and all its questions?")) return;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });
      if (res.ok) fetchQuizzes(); else { const d = await res.json(); alert(d.error || "Delete failed"); }
    } catch (err) { alert(err.message); }
  };

  const handleAssignBundle = async (quizId, bundleId) => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}/assign-bundle`, {
        method: "POST", body: JSON.stringify({ bundle_id: bundleId }),
      });
      const data = await res.json();
      if (res.ok) { alert(`✅ ${data.message}\n${data.children_updated} children updated`); setAssignQuiz(null); fetchBundles(); }
      else alert(data.error || "Assignment failed");
    } catch (err) { alert(err.message); }
  };

  const handleUnassignBundle = async (quizId, bundleId) => {
    if (!confirm("Remove this quiz from the bundle?")) return;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}/unassign-bundle`, {
        method: "POST", body: JSON.stringify({ bundle_id: bundleId }),
      });
      if (res.ok) { alert("Quiz removed from bundle"); fetchBundles(); }
    } catch (err) { alert(err.message); }
  };

  const handleSaveSettings = async (updates) => {
    if (!editQuiz) return;
    const qid = editQuiz.quiz_id || editQuiz._id;
    try {
      const res = await adminFetch(`/api/admin/quizzes/${qid}`, { method: "PATCH", body: JSON.stringify(updates) });
      if (res.ok) { setEditQuiz(null); fetchQuizzes(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  const totalQuizzes = quizzes.length;
  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.question_count || 0), 0);
  const yearLevels = [...new Set(quizzes.map((q) => q.year_level))].sort();
  const subjects = [...new Set(quizzes.map((q) => q.subject).filter(Boolean))].sort();

  const filtered = quizzes.filter((q) => {
    if (filterYear !== "all" && q.year_level !== Number(filterYear)) return false;
    if (filterSubject !== "all" && q.subject !== filterSubject) return false;
    if (searchQuery && !q.quiz_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">EduTech Admin</span>
          </div>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Quizzes" value={totalQuizzes} icon="📝" color="indigo" />
          <StatCard label="Total Questions" value={totalQuestions} icon="❓" color="emerald" />
          <StatCard label="Year Levels" value={yearLevels.length} icon="🎓" color="amber" />
          <StatCard label="Subjects" value={subjects.length} icon="📚" color="rose" />
        </div>

        {/* Tab Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 w-fit">
            {[{ id: "quizzes", label: "Manage Quizzes", icon: "📋" }, { id: "upload", label: "Upload Quiz", icon: "📤" }].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25" : "text-slate-400 hover:text-white"}`}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowManualCreator(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-600/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Create Quiz Manually
          </button>
        </div>

        {error && <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

        {/* Tab Content */}
        {tab === "upload" ? (
          <QuizUploader onUploadSuccess={() => { setTab("quizzes"); fetchQuizzes(); }} />
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <input type="text" placeholder="Search quizzes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Years</option>
                {[3, 5, 7, 9].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
              <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">All Subjects</option>
                {["Maths", "Reading", "Writing", "Conventions"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Quiz Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-lg">No quizzes found</p>
                <p className="text-sm mt-1">Upload your first quiz using the Upload tab above.</p>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Quiz Name</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Year</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Subject</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Tier</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Questions</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Time</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Bundle</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.map((quiz) => {
                      const qid = quiz.quiz_id || quiz._id;
                      const assignedBundles = bundles.filter((b) => b.flexiquiz_quiz_ids?.includes(qid));
                      return (
                        <tr key={qid} className="hover:bg-slate-800/40 transition-colors">
                          {/* CLICKABLE QUIZ NAME */}
                          <td className="px-5 py-3.5">
                            <button onClick={() => setViewQuizId(qid)}
                              className="font-medium text-white hover:text-indigo-400 transition-colors text-left underline decoration-slate-700 hover:decoration-indigo-400">
                              {quiz.quiz_name}
                            </button>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Yr {quiz.year_level}</span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-300">{quiz.subject || "—"}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400">{quiz.tier || "—"}</span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-300">{quiz.question_count || 0}</td>
                          <td className="px-5 py-3.5">
                            {quiz.time_limit_minutes ? <span className="text-slate-300">{quiz.time_limit_minutes} min</span> : <span className="text-slate-600 text-xs">No limit</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {assignedBundles.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {assignedBundles.map((b) => (
                                  <span key={b.bundle_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    {b.bundle_name}
                                    <button onClick={() => handleUnassignBundle(qid, b.bundle_id)} className="ml-0.5 text-cyan-500 hover:text-red-400" title="Remove">×</button>
                                  </span>
                                ))}
                              </div>
                            ) : <span className="text-xs text-slate-600">Not assigned</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${quiz.is_active !== false ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}>
                              {quiz.is_active !== false ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setEditQuiz(quiz)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Settings</button>
                              <span className="text-slate-700">|</span>
                              {assignQuiz === qid ? (
                                <div className="flex items-center gap-1">
                                  <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) handleAssignBundle(qid, e.target.value); }}
                                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                                    <option value="" disabled>Select bundle...</option>
                                    {bundles.filter((b) => !b.flexiquiz_quiz_ids?.includes(qid)).map((b) => (
                                      <option key={b.bundle_id} value={b.bundle_id}>{b.bundle_name} (Yr {b.year_level} {b.tier})</option>
                                    ))}
                                  </select>
                                  <button onClick={() => setAssignQuiz(null)} className="text-xs text-slate-500 hover:text-white">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => setAssignQuiz(qid)} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Assign</button>
                              )}
                              <span className="text-slate-700">|</span>
                              <button onClick={() => handleDelete(qid)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Manual Quiz Creator */}
      <ManualQuizCreator isOpen={showManualCreator} onClose={() => setShowManualCreator(false)}
        onSuccess={() => { fetchQuizzes(); setShowManualCreator(false); }} />

      {/* Quiz Settings Modal */}
      {editQuiz && <QuizSettingsModal quiz={editQuiz} onClose={() => setEditQuiz(null)} onSave={handleSaveSettings} />}

      {/* Quiz Detail Modal — view/edit all questions */}
      {viewQuizId && <QuizDetailModal quizId={viewQuizId} onClose={() => setViewQuizId(null)} onRefresh={fetchQuizzes} />}
    </div>
  );
}
