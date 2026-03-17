/**
 * QuizDetailPage.jsx — Full page version of quiz detail
 * Route: /admin/quiz/:quizId
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";
import DownloadXlsxButton from "./DownloadExcelButton";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  if (!headers["Content-Type"] && typeof opts.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API}${url}`, { ...opts, headers });
}

function getAdminRole() {
  try {
    const token = localStorage.getItem("admin_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch { return null; }
}

// ─── File Upload Button ───────────────────────────────────────────────────────
function FileUploadButton({ onUploaded, accept = "image/*", label = "Upload" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Upload failed"); }
      const data = await res.json();
      onUploaded(data.url.startsWith("http") ? data.url : `${API}${data.url}`);
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs text-slate-300 rounded-lg border border-slate-600 transition flex items-center gap-1.5 flex-shrink-0">
        {uploading ? <><span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />Uploading...</> : <><span>📎</span>{label}</>}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} style={{ overflowWrap: "break-word" }} />;
}

function TypeBadge({ type }) {
  const styles = {
    radio_button: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    checkbox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    free_text: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    short_answer: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const labels = { radio_button: "Single Choice", checkbox: "Multiple Choice", picture_choice: "Picture Choice", free_text: "Free Text", short_answer: "Short Answer" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>{labels[type] || type}</span>;
}

// ─── Verification Badge ───────────────────────────────────────────────────────
function VerificationBadge({ status }) {
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      Approved
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <span className="w-2 h-2 rounded-full bg-amber-400" />Pending
    </span>
  );
}

// ─── Verify Controls ─────────────────────────────────────────────────────────
function VerifyControls({ question, onVerified }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const current = question.tutor_verification?.status || "pending";

  const handleVerify = async (status, rejection_reason = null) => {
    setLoading(true);
    try {
      const body = { status };
      if (rejection_reason) body.rejection_reason = rejection_reason;
      const res = await adminFetch(`/api/admin/questions/${question.question_id}/verify`, {
        method: "PATCH", body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      const data = await res.json();
      onVerified(data.question);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); setShowReject(false); setReason(""); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status={current} />
        {current !== "approved" && (
          <button disabled={loading} onClick={() => { setShowReject(false); handleVerify("approved"); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Approve
          </button>
        )}
        {current !== "rejected" && (
          <button disabled={loading} onClick={() => setShowReject((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            Reject
          </button>
        )}
        {current !== "pending" && (
          <button disabled={loading} onClick={() => handleVerify("pending")}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40">Reset</button>
        )}
        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
        )}
      </div>
      {showReject && (
        <div className="flex items-center gap-2 mt-1">
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="flex-1 bg-slate-800 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-red-500"
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleVerify("rejected", reason); }} />
          <button disabled={!reason.trim() || loading} onClick={() => handleVerify("rejected", reason)}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40">Confirm</button>
          <button onClick={() => { setShowReject(false); setReason(""); }} className="text-xs text-slate-500 hover:text-white">Cancel</button>
        </div>
      )}
      {current === "rejected" && question.tutor_verification?.rejection_reason && (
        <p className="text-[10px] text-red-400/80 italic">Reason: {question.tutor_verification.rejection_reason}</p>
      )}
    </div>
  );
}

// ─── Question Editor ──────────────────────────────────────────────────────────
function QuestionEditor({ question, quizRandomizeOptions, onSave, onCancel }) {
  const [form, setForm] = useState({
    text: question.text || "",
    type: question.type || "radio_button",
    points: question.points || 1,
    category: question.categories?.[0]?.name || "",
    image_url: question.image_url || "",
    explanation: question.explanation || "",
    shuffle_options: question.shuffle_options ?? (quizRandomizeOptions || false),
    voice_url: question.voice_url || "",
    video_url: question.video_url || "",
    correct_answer: question.correct_answer || "",
    case_sensitive: question.case_sensitive || false,
    options: (question.options || []).map((o) => ({
      option_id: o.option_id, text: o.text || "", image_url: o.image_url || "", correct: o.correct || false,
    })),
  });
  const [saving, setSaving] = useState(false);

  const updateOption = (idx, field, value) => {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && f.type === "radio_button") opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      return { ...f, options: opts };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, {
      text: form.text, type: form.type, points: form.points, category: form.category,
      image_url: form.image_url, explanation: form.explanation,
      shuffle_options: form.shuffle_options,
      voice_url: form.voice_url || null, video_url: form.video_url || null,
      correct_answer: form.correct_answer || null, case_sensitive: form.case_sensitive,
      options: form.options,
    });
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border-2 border-indigo-500/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-indigo-400">✏️ Edit Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white">Cancel</button>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text</label>
        <textarea rows={3} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            <option value="radio_button">Single Choice</option>
            <option value="checkbox">Multiple Choice</option>
            <option value="picture_choice">Picture Choice</option>
            <option value="free_text">Free Text</option>
            <option value="short_answer">Short Answer</option>
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
          <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Image URL</label>
        <div className="flex items-center gap-2">
          <input type="text" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            placeholder="https://... or upload →"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
          <FileUploadButton accept="image/*" label="Upload" onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation</label>
        <input type="text" value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      </div>

      {form.type === "short_answer" && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Correct Answer (separate multiple with |)</label>
          <input type="text" value={form.correct_answer} onChange={(e) => setForm((f) => ({ ...f, correct_answer: e.target.value }))}
            placeholder='e.g. "42" or "42|forty two"'
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>
      )}

      {form.type !== "free_text" && form.type !== "short_answer" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Options (check = correct)</label>
            <button onClick={() => setForm((f) => ({ ...f, options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }] }))}
              className="text-xs text-indigo-400 hover:text-indigo-300">+ Add</button>
          </div>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button onClick={() => updateOption(i, "correct", !opt.correct)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600"}`}>
                  {opt.correct && "✓"}
                </button>
                <span className="text-xs text-slate-500 w-4">{String.fromCharCode(65 + i)}</span>
                <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder="Option text..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                {form.options.length > 2 && (
                  <button onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))}
                    className="text-slate-500 hover:text-red-400 text-xs">✕</button>
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

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function QuizDetailPage() {
  const { quizId } = useParams();
  const navigate   = useNavigate();

  const [quiz,          setQuiz]          = useState(null);
  const [questions,     setQuestions]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [editingId,     setEditingId]     = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);
  const [settingsForm,  setSettingsForm]  = useState({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [error,         setError]         = useState("");

  const adminRole = getAdminRole();
  const canVerify = ["admin", "tutor"].includes(adminRole);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (res.status === 401 || res.status === 403) { navigate(ADMIN_PATH); return; }
      if (!res.ok) throw new Error("Failed to load quiz");
      const data = await res.json();
      setQuiz(data);
      setQuestions(data.questions || []);
      setSettingsForm({
        quiz_name:           data.quiz_name           || "",
        time_limit_minutes:  data.time_limit_minutes  ?? "",
        difficulty:          data.difficulty          || "",
        is_active:           data.is_active           !== false,
        is_trial:            data.is_trial            || false,
        randomize_questions: data.randomize_questions || false,
        randomize_options:   data.randomize_options   || false,
        max_attempts:        data.max_attempts        ?? "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [quizId, navigate]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleSaveQuestion = async (questionId, updates) => {
    const res = await adminFetch(`/api/admin/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (res.ok) { setEditingId(null); fetchDetail(); }
    else { const d = await res.json(); alert(d.error || "Save failed"); }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
    if (res.ok) fetchDetail(); else alert("Delete failed");
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name:           settingsForm.quiz_name,
          time_limit_minutes:  settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty:          settingsForm.difficulty || null,
          is_active:           settingsForm.is_active,
          is_trial:            settingsForm.is_trial,
          randomize_questions: settingsForm.randomize_questions,
          randomize_options:   settingsForm.randomize_options,
          max_attempts:        settingsForm.max_attempts === "" ? null : Number(settingsForm.max_attempts),
        }),
      });
      if (res.ok) { setShowSettings(false); fetchDetail(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
    finally { setSavingSettings(false); }
  };

  const handleQuestionVerified = (updatedQ) => {
    setQuestions((prev) => prev.map((q) => q.question_id === updatedQ.question_id ? updatedQ : q));
  };

  const verStats = questions.reduce(
    (acc, q) => { const s = q.tutor_verification?.status || "pending"; acc[s] = (acc[s] || 0) + 1; return acc; },
    { approved: 0, rejected: 0, pending: 0 }
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(`${ADMIN_PATH}/dashboard`)}
              className="text-slate-400 hover:text-white transition flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white truncate">{quiz?.quiz_name || "Loading..."}</h1>
              {quiz && (
                <p className="text-[11px] text-slate-500">
                  Year {quiz.year_level} · {quiz.subject} · {questions.length} questions · {quiz.total_points} pts
                  {quiz.time_limit_minutes && ` · ⏱ ${quiz.time_limit_minutes} min`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Verification pill */}
            {questions.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
                <span className="text-emerald-400 font-semibold">{verStats.approved}✓</span>
                <span className="text-slate-600">|</span>
                <span className="text-red-400 font-semibold">{verStats.rejected}✗</span>
                <span className="text-slate-600">|</span>
                <span className="text-amber-400 font-semibold">{verStats.pending}⋯</span>
              </div>
            )}
            <DownloadXlsxButton quizId={quizId} quizName={quiz?.quiz_name} />
            <button onClick={() => setShowSettings(!showSettings)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition">
              ⚙️ Settings
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchDetail} className="text-xs text-red-300 underline mt-1">Retry</button>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && quiz && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mb-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Quiz Settings</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
                <input type="text" value={settingsForm.quiz_name}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Time Limit (min)</label>
                <input type="number" value={settingsForm.time_limit_minutes}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                  placeholder="No limit"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                <select value={settingsForm.difficulty}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none">
                  <option value="">None</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {[
                { label: "Active",              field: "is_active"           },
                { label: "Trial (free)",        field: "is_trial"            },
                { label: "Shuffle Questions",   field: "randomize_questions" },
                { label: "Shuffle Options",     field: "randomize_options"   },
              ].map(({ label, field }) => (
                <label key={field} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={!!settingsForm[field]}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, [field]: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800" />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
                {savingSettings ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-24 text-slate-500">No questions in this quiz yet.</div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => {
              if (editingId === q.question_id) {
                return (
                  <QuestionEditor key={q.question_id} question={q}
                    quizRandomizeOptions={quiz?.randomize_options}
                    onSave={handleSaveQuestion} onCancel={() => setEditingId(null)} />
                );
              }

              const verStatus   = q.tutor_verification?.status || "pending";
              const borderColor = verStatus === "approved" ? "border-emerald-500/30"
                                : verStatus === "rejected"  ? "border-red-500/30"
                                : "border-slate-700/50";

              return (
                <div key={q.question_id} className={`bg-slate-900 border ${borderColor} rounded-xl p-5 group`}>
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">{i + 1}</span>
                      <TypeBadge type={q.type} />
                      <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                      {q.categories?.[0]?.name && <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>}
                      {q.voice_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20">🔊 Audio</span>}
                      {q.video_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/20">🎬 Video</span>}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setEditingId(q.question_id)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                      <button onClick={() => handleDeleteQuestion(q.question_id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Delete</button>
                    </div>
                  </div>

                  {/* Question text */}
                  <div className="mb-3 ml-10">
                    <HtmlContent html={q.text} className="text-sm text-white leading-relaxed" />
                  </div>

                  {/* Image */}
                  {q.image_url && (
                    <div className="mb-3 ml-10">
                      <img src={q.image_url} alt="" className="max-h-48 rounded-lg border border-slate-700 object-contain" />
                    </div>
                  )}

                  {/* Audio */}
                  {q.voice_url && (
                    <div className="mb-3 ml-10 flex items-center gap-3 bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
                      <span className="text-sm">🔊</span>
                      <audio src={q.voice_url} controls preload="metadata" className="h-8 flex-1" />
                    </div>
                  )}

                  {/* Video */}
                  {q.video_url && (
                    <div className="mb-3 ml-10 bg-slate-800/60 rounded-lg border border-slate-700/50 overflow-hidden">
                      {q.video_url.match(/youtube\.com|youtu\.be/) ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${q.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1]}`}
                          className="w-full aspect-video max-h-48" allowFullScreen title="Video" />
                      ) : (
                        <video src={q.video_url} controls preload="metadata" className="w-full max-h-48" />
                      )}
                    </div>
                  )}

                  {/* Options */}
                  {q.options?.length > 0 && (
                    <div className="space-y-1.5 ml-10 mb-3">
                      {q.options.map((opt, oi) => (
                        <div key={opt.option_id || oi}
                          className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"}`}>
                          <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                            {opt.correct ? "✓" : String.fromCharCode(65 + oi)}
                          </span>
                          <span className="text-slate-300">{opt.text}</span>
                          {opt.image_url && <img src={opt.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-700" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Short answer */}
                  {q.type === "short_answer" && q.correct_answer && (
                    <div className="mt-2 ml-10 px-3 py-2 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                      <p className="text-[10px] text-orange-500 font-bold mb-0.5">✍️ Answer</p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.correct_answer.split("|").map((a, ai) => (
                          <span key={ai} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-xs">{a.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="mt-2 ml-10 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <p className="text-[10px] text-amber-500 font-bold mb-0.5">Explanation</p>
                      <p className="text-xs text-amber-400/80">{q.explanation}</p>
                    </div>
                  )}

                  {/* Verification controls */}
                  {canVerify && (
                    <div className="mt-3 pt-3 border-t border-slate-800 ml-10">
                      <VerifyControls question={q} onVerified={handleQuestionVerified} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}