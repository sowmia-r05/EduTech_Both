/**
 * QuizDetailModal.jsx  (v9 — FILE UPLOAD FOR VOICE/VIDEO/IMAGE)
 *
 *   ✅ Shuffle cascade: quiz-level master → per-question override
 *   ✅ Per-question: voice_url, video_url, image resize (width + height)
 *   ✅ No quiz-level voice/video
 *   ✅ Collapsible image resize widget (no more endless scrolling)
 *   ✅ Student writing area preview when writing is selected
 *   ✅ Voice/Audio URL and Video URL inputs visible in Edit Question form
 *   ✅ File upload buttons for Audio (.mp3/.wav/.ogg), Video (.mp4/.webm/.mov), and Images
 *   ✅ writing type support + image_width/height fix (?? null)
 *   ✅ Right-click context menu: Edit / Insert Before / Insert After / Delete
 *   ✅ Live image preview in editor reflects width/height changes
 *
 * Place in: src/app/components/admin/QuizDetailModal.jsx
 */

import { useState, useEffect, useRef } from "react";
import QuizSettingsExtras from "./QuizSettingsExtras";
import CollapsibleImageResize from "./CollapsibleImageResize";
import FreeTextPreview from "./FreeTextPreview";
import { AddQuestionForm } from "./ManualQuizCreator"; // ← PATCH 1

const API = import.meta.env.VITE_API_BASE_URL || "";


/* ─── Text settings ─────────────────────────────────────── */
const FONT_OPTIONS = [
  { label: "Default",  value: "system-ui, sans-serif" },
  { label: "Serif",    value: "'Georgia', 'Times New Roman', serif" },
  { label: "Verdana",  value: "'Verdana', 'Geneva', sans-serif" },
  { label: "Dyslexic", value: "'Comic Sans MS', 'Trebuchet MS', sans-serif" },
  { label: "Mono",     value: "'Courier New', 'Courier', monospace" },
];
const MIN_FONT = 12;
const MAX_FONT = 26;
const DEFAULT_TEXT = { fontSize: 16, fontFamily: FONT_OPTIONS[0].value, bold: false };

function adminFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
  return fetch(`${API}${url}`, { ...opts, headers: { "Content-Type": "application/json", ...opts.headers, Authorization: `Bearer ${token}` } });
}

/* ── File Upload Button (reusable) ── */
function FileUploadButton({ onUploaded, accept = "image/*,.pdf", label = "Upload" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
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
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} style={{ overflowWrap: "break-word" }} />;
}

function TypeBadge({ type }) {
  const styles = {
    radio_button:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    checkbox:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
    picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    free_text:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    short_answer:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
    writing:        "bg-pink-500/10 text-pink-400 border-pink-500/20",
  };
  const labels = {
    radio_button:   "Single Choice",
    checkbox:       "Multiple Choice",
    picture_choice: "Picture Choice",
    free_text:      "Free Text",
    short_answer:   "Short Answer",
    writing:        "Writing",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>{labels[type] || type}</span>;
}

const IMAGE_SIZE_MAP = { small: "max-w-[200px]", medium: "max-w-md", large: "max-w-xl", full: "max-w-full" };

/* ── PATCH 2: Context Menu ── */
function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, [onClose]);

  return (
    <div
      className="fixed z-[9999] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 min-w-[190px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === "divider" ? (
          <div key={i} className="my-1 border-t border-slate-700" />
        ) : (
          <button key={i} onClick={() => { item.onClick(); onClose(); }}
            className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition hover:bg-slate-700 ${item.danger ? "text-red-400 hover:text-red-300" : "text-slate-300 hover:text-white"}`}>
            <span>{item.icon}</span><span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}

/* ── Short Answer correct answer input ── */
function ShortAnswerEditor({ form, setForm }) {
  if (form.type !== "short_answer") return null;
  const answers = (form.correct_answer || "").split("|").filter(Boolean);
  return (
    <div className="pt-3 border-t border-slate-700 space-y-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">✍️ Correct Answer</p>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Expected Answer(s) <span className="text-slate-600">— separate multiple accepted answers with | (pipe)</span>
        </label>
        <input type="text" value={form.correct_answer}
          onChange={(e) => setForm((f) => ({ ...f, correct_answer: e.target.value }))}
          placeholder='e.g. "1025" or "1 025|1025|one thousand twenty-five"'
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-orange-500" />
        {answers.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {answers.map((a, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-[10px] font-medium">
                ✓ {a.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={form.case_sensitive}
          onChange={(e) => setForm((f) => ({ ...f, case_sensitive: e.target.checked }))}
          className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500" />
        Case-sensitive grading
        <span className="text-[10px] text-slate-500">(default: ignores case)</span>
      </label>
    </div>
  );
}
function MoveToQuizModal({ question, currentQuizId, onClose, onMoved }) {
  const [quizzes, setQuizzes]   = useState([]);
  const [search,  setSearch]    = useState("");
  const [targetId, setTargetId] = useState("");
  const [moving,  setMoving]    = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/quizzes?limit=200")
      .then((r) => r.json())
      .then((data) => {
        // Exclude current quiz
        const list = (data.quizzes || data || []).filter(
          (q) => String(q.quiz_id || q._id) !== String(currentQuizId)
        );
        setQuizzes(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentQuizId]);

  const filtered = quizzes.filter((q) =>
    q.quiz_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const handleMove = async () => {
    if (!targetId) return;
    setMoving(true);
    try {
      const res = await adminFetch(
        `/api/admin/questions/${question.question_id}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            from_quiz_id: currentQuizId,
            to_quiz_id:   targetId,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Move failed");
      }
      onMoved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Move Question to Another Quiz</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              "{question.text?.replace(/<[^>]+>/g, "").slice(0, 60)}..."
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-800">
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quizzes..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Quiz List */}
        <div className="overflow-y-auto max-h-72">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-10">No quizzes found</p>
          ) : (
            filtered.map((q) => {
              const id = String(q.quiz_id || q._id);
              const selected = targetId === id;
              return (
                <button
                  key={id}
                  onClick={() => setTargetId(id)}
                  className={`w-full text-left px-5 py-3 flex items-center gap-3 transition border-b border-slate-800/50 last:border-0 ${
                    selected
                      ? "bg-indigo-600/20 border-l-2 border-l-indigo-500"
                      : "hover:bg-slate-800"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? "border-indigo-500 bg-indigo-500" : "border-slate-600"
                  }`}>
                    {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{q.quiz_name}</p>
                    <p className="text-[11px] text-slate-500">
                      {q.subject} · Year {q.year_level}
                      {q.question_count != null && ` · ${q.question_count} questions`}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {targetId
              ? `→ Moving to: ${quizzes.find((q) => String(q.quiz_id || q._id) === targetId)?.quiz_name}`
              : "Select a destination quiz"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleMove}
              disabled={!targetId || moving}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition flex items-center gap-2"
            >
              {moving && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
              {moving ? "Moving..." : "Move Question"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Admin Verify Controls ── */
function AdminVerifyControls({ question, onVerified }) {
  const [mode,    setMode]    = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const adminStatus = question.admin_verification?.status || "pending";

  const handleSubmit = async (status) => {
    if (status === "rejected" && !message.trim()) return;
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/questions/${question.question_id}/admin-verify`,
        { method: "PATCH", body: JSON.stringify({ status, message: message.trim() || null }) }
      );
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      onVerified((await res.json()).question);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); setMode(null); setMessage(""); }
  };

  return (
    <div className="mt-3 ml-10 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-slate-700/60" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1">Admin Review</span>
        <div className="flex-1 border-t border-slate-700/60" />
      </div>

      {adminStatus !== "pending" && (
        <div className={`px-3 py-2 rounded-lg border ${
          adminStatus === "approved" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${
                adminStatus === "approved" ? "text-emerald-400" : "text-red-400"
              }`}>
                {adminStatus === "approved" ? "✓ Admin Approved" : "✗ Admin Rejected"}
                {question.admin_verification?.verified_by && (
                  <span className="font-normal normal-case tracking-normal ml-1.5 opacity-60">
                    by {question.admin_verification.verified_by}
                  </span>
                )}
              </p>
              {question.admin_verification?.message && (
                <p className={`text-xs mt-0.5 ${
                  adminStatus === "approved" ? "text-emerald-400/70" : "text-red-400/70"
                }`}>
                  {question.admin_verification.message}
                </p>
              )}
            </div>
            <button disabled={loading} onClick={() => handleSubmit("pending")}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40 flex-shrink-0">
              Reset
            </button>
          </div>
        </div>
      )}

      {adminStatus === "pending" && !mode && (
        <div className="flex items-center gap-2">
          <button disabled={loading} onClick={() => { setMode("approve"); setMessage(""); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Admin Approve
          </button>
          <button disabled={loading} onClick={() => { setMode("reject"); setMessage(""); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            Admin Reject
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-emerald-400 font-semibold">Approval note (optional)</p>
          <div className="flex items-center gap-2">
            <input autoFocus type="text" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Add an optional note…"
              className="flex-1 bg-slate-800 border border-emerald-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-emerald-500"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit("approved"); }} />
            <button disabled={loading} onClick={() => handleSubmit("approved")}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-40">Confirm</button>
            <button onClick={() => { setMode(null); setMessage(""); }} className="text-xs text-slate-500 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-red-400 font-semibold">Rejection reason (required)</p>
          <div className="flex items-center gap-2">
            <input autoFocus type="text" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Reason for rejection…"
              className="flex-1 bg-slate-800 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-red-500"
              onKeyDown={(e) => { if (e.key === "Enter" && message.trim()) handleSubmit("rejected"); }} />
            <button disabled={!message.trim() || loading} onClick={() => handleSubmit("rejected")}
              className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40">Confirm</button>
            <button onClick={() => { setMode(null); setMessage(""); }} className="text-xs text-slate-500 hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Question Editor ── */
function QuestionEditor({ question, quizRandomizeOptions, onSave, onCancel }) {
  const resolvedShuffle = question.shuffle_options != null ? question.shuffle_options : (quizRandomizeOptions || false);
  const [form, setForm] = useState({
    text:            question.text || question.question_text || "",
    type:            question.type || "radio_button",
    points:          question.points || 1,
    category:        question.categories?.[0]?.name || "",
    image_url:       question.image_url || "",
    image_size:      question.image_size || "medium",
    image_width:     question.image_width  ?? null,
    image_height:    question.image_height ?? null,
    explanation:     question.explanation || "",
    shuffle_options: resolvedShuffle,
    voice_url:       question.voice_url || "",
    video_url:       question.video_url || "",
    correct_answer:  question.correct_answer || "",
    case_sensitive:  question.case_sensitive || false,
    options: (question.options || []).map((o) => ({
      option_id: o.option_id, text: o.text || "", image_url: o.image_url || "", correct: o.correct || false,
    })),
  });
  const [saving, setSaving] = useState(false);

  const updateOption = (idx, field, value) => {
    setForm((f) => {
      const opts = [...f.options]; opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && f.type === "radio_button") opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      return { ...f, options: opts };
    });
  };
  const addOption    = () => setForm((f) => ({ ...f, options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }] }));
  const removeOption = (idx) => { if (form.options.length <= 2) return; setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) })); };

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, {
      text: form.text, type: form.type, points: form.points, category: form.category,
      image_url: form.image_url, image_size: form.image_size,
      image_width: form.image_width, image_height: form.image_height,
      explanation: form.explanation, shuffle_options: form.shuffle_options,
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
        <label className="block text-xs text-slate-400 mb-1">Question Text (HTML supported)</label>
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
            <option value="writing">Writing (text box)</option>
            <option value="free_text">Free Text (display only)</option>
            <option value="short_answer">Short Answer</option>
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

      {/* Image field with live preview */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Image (paste URL or upload)</label>
        <div className="flex items-center gap-2">
          <input type="text" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://... or upload →"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
          <FileUploadButton accept="image/*,.pdf" label="Upload" onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} />
          {form.image_url && (
            <button onClick={() => setForm((f) => ({ ...f, image_url: "", image_size: "medium", image_width: null, image_height: null }))}
              className="text-red-400 hover:text-red-300 text-xs flex-shrink-0">✕</button>
          )}
        </div>

        {/* Live preview — updates as width/height change */}
        {form.image_url && !form.image_url.toLowerCase().endsWith(".pdf") && (
          <div className="mt-2 relative inline-block max-w-full">
            <img
              src={form.image_url}
              alt="Question preview"
              style={{
                ...(form.image_width  ? { width: `${form.image_width}px`, maxWidth: "100%" } : { maxWidth: "100%" }),
                ...(form.image_height ? { height: `${form.image_height}px` } : { maxHeight: "12rem" }),
                objectFit: "contain",
              }}
              className="rounded-lg border border-slate-600 bg-slate-900"
              onError={(e) => { e.target.style.display = "none"; }}
            />
            <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] rounded font-medium">Preview</span>
            {(form.image_width || form.image_height) && (
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-indigo-600/80 text-white text-[9px] rounded font-mono">
                {form.image_width ? `${form.image_width}px` : "auto"} × {form.image_height ? `${form.image_height}px` : "auto"}
              </span>
            )}
          </div>
        )}
        {form.image_url && form.image_url.toLowerCase().endsWith(".pdf") && (
          <a href={form.image_url} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition">
            📄 PDF — click to preview
          </a>
        )}
      </div>

      <CollapsibleImageResize form={form} setForm={setForm} />
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation</label>
        <input type="text" value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      </div>

      <div className="pt-3 border-t border-slate-700 space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Question Settings</p>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={form.shuffle_options} onChange={(e) => setForm((f) => ({ ...f, shuffle_options: e.target.checked }))}
            className="rounded border-slate-600 bg-slate-800 text-indigo-500" />
          🔀 Shuffle Options
          {quizRandomizeOptions && <span className="text-[10px] text-slate-500 ml-1">(quiz default: ON)</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">🔊 Audio File (.mp3 / .wav / .ogg)</label>
            <div className="flex items-center gap-2">
              <input type="url" value={form.voice_url} onChange={(e) => setForm((f) => ({ ...f, voice_url: e.target.value }))} placeholder="Paste URL or upload →"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <FileUploadButton accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg" label="Upload MP3" onUploaded={(url) => setForm((f) => ({ ...f, voice_url: url }))} />
            </div>
            {form.voice_url && (
              <div className="mt-1.5 flex items-center gap-2">
                <audio src={form.voice_url} controls className="h-7 flex-1" preload="metadata" />
                <button onClick={() => setForm((f) => ({ ...f, voice_url: "" }))} className="text-red-400 hover:text-red-300 text-xs flex-shrink-0">✕</button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">🎬 Video File (.mp4 / .webm / YouTube)</label>
            <div className="flex items-center gap-2">
              <input type="url" value={form.video_url} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))} placeholder="Paste URL or upload →"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <FileUploadButton accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov" label="Upload MP4" onUploaded={(url) => setForm((f) => ({ ...f, video_url: url }))} />
            </div>
            {form.video_url && (
              <div className="mt-1.5 flex items-center gap-2">
                {form.video_url.match(/youtube\.com|youtu\.be/) ? (
                  <span className="text-xs text-green-400">✓ YouTube link attached</span>
                ) : (
                  <video src={form.video_url} controls className="w-full max-h-24 rounded border border-slate-700" preload="metadata" />
                )}
                <button onClick={() => setForm((f) => ({ ...f, video_url: "" }))} className="text-red-400 hover:text-red-300 text-xs flex-shrink-0">✕</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <FreeTextPreview form={form} />
      <ShortAnswerEditor form={form} setForm={setForm} />

      {/* Options — hidden for free_text, short_answer, writing */}
      {form.type !== "free_text" && form.type !== "short_answer" && form.type !== "writing" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Options (check = correct)</label>
            <button onClick={addOption} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add</button>
          </div>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button onClick={() => updateOption(i, "correct", !opt.correct)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border text-xs transition ${opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600"}`}>
                  {opt.correct && "✓"}
                </button>
                <span className="text-xs text-slate-500 w-4">{String.fromCharCode(65 + i)}</span>
                <input type="text" value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)} placeholder="Option text..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                  {form.type === "picture_choice" && (
                  <div className="flex items-center gap-1">
                    <input type="text" value={opt.image_url || ""} onChange={(e) => updateOption(i, "image_url", e.target.value)} placeholder="Image URL..."
                      className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                    <FileUploadButton
                      accept="image/*"
                      label="📷"
                      onUploaded={(url) => updateOption(i, "image_url", url)}
                    />
                    {opt.image_url && (
                      <img src={opt.image_url} alt="" className="w-8 h-8 rounded object-cover border border-slate-600" />
                    )}
                  </div>
                )}
                {form.options.length > 2 && <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>}
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
function TextSettingsBar({ settings, onChange }) {
  const { fontSize, fontFamily, bold } = settings;
  const isDefault = fontSize === DEFAULT_TEXT.fontSize && fontFamily === DEFAULT_TEXT.fontFamily && !bold;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs select-none">
      <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wide mr-1">Preview</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange({ ...settings, fontSize: Math.max(MIN_FONT, fontSize - 1) })} disabled={fontSize <= MIN_FONT}
          className="w-7 h-7 rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center font-bold text-slate-300 transition">A−</button>
        <span className="w-8 text-center text-slate-400 font-mono text-[11px]">{fontSize}px</span>
        <button onClick={() => onChange({ ...settings, fontSize: Math.min(MAX_FONT, fontSize + 1) })} disabled={fontSize >= MAX_FONT}
          className="w-7 h-7 rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center font-bold text-slate-300 transition">A+</button>
      </div>
      <div className="w-px h-5 bg-slate-600" />
      <button onClick={() => onChange({ ...settings, bold: !bold })}
        className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-sm transition ${bold ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-900 border-slate-600 text-slate-300 hover:bg-slate-700"}`}>B</button>
      <div className="w-px h-5 bg-slate-600" />
      <select value={fontFamily} onChange={(e) => onChange({ ...settings, fontFamily: e.target.value })}
        className="h-7 rounded-lg border border-slate-600 bg-slate-900 text-slate-300 text-[11px] px-2 outline-none hover:border-indigo-400 transition cursor-pointer">
        {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      {!isDefault && (
        <button onClick={() => onChange({ ...DEFAULT_TEXT })} className="text-[10px] text-slate-500 hover:text-slate-300 underline transition">Reset</button>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════
   MAIN: QuizDetailModal
   ═══════════════════════════════════════ */
export default function QuizDetailModal({ quizId, onClose, onRefresh }) {
  const [quiz,         setQuiz]         = useState(null);
  const [questions,    setQuestions]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editingId,    setEditingId]    = useState(null);
  const [editSettings, setEditSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  // ── PATCH 3: new state for context menu + inline insert ──
  const [contextMenu,   setContextMenu]   = useState(null);
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const addingRef = useRef(false); 
  const [moveQuestion, setMoveQuestion] = useState(null);
  // ── Text preview settings ──
  const [textSettings, setTextSettings] = useState({ ...DEFAULT_TEXT });
  const textStyle = { fontSize: `${textSettings.fontSize}px`, fontFamily: textSettings.fontFamily, fontWeight: textSettings.bold ? "700" : "400" };

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setQuiz(data); setQuestions(data.questions || []);
      setSettingsForm({
        quiz_name:           data.quiz_name           || "",
        time_limit_minutes:  data.time_limit_minutes  ?? "",
        difficulty:          data.difficulty          || "",
        is_active:           data.is_active           !== false,
        is_trial:            data.is_trial            || false,
        randomize_questions: data.randomize_questions || false,
        randomize_options:   data.randomize_options   || false,
        max_attempts:        data.max_attempts        ?? null,
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
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

  // ── PATCH 4: handleAddQuestion with position-aware ordering ──
  const handleAddQuestion = async (newQ) => {
  if (addingRef.current) return;
  addingRef.current = true;
  try {
    const getEffectiveOrder = (q, idx) =>
      q?.order != null ? q.order : idx * 1000;

    // ✅ FIX: Normalize null-order questions before positional insert
    if (insertAtIndex !== null) {
      // ✅ WITH THIS:
        const allSameOrder = new Set(questions.map(q => q.order ?? 0)).size === 1;
        const hasNullOrders = questions.some(q => q.order == null) || allSameOrder;
        if (hasNullOrders) {
        await Promise.all(
          questions.map((q, idx) =>
            adminFetch(`/api/admin/questions/${q.question_id}`, {
              method: "PATCH",
              body: JSON.stringify({ order: idx * 1000 }),
              headers: { "Content-Type": "application/json" },
            })
          )
        );
        questions.forEach((q, idx) => { q.order = idx * 1000; });
      }
    }

    let order;
    if (insertAtIndex === null) {
      const lastIdx = questions.length - 1;
      order = questions.length > 0
        ? getEffectiveOrder(questions[lastIdx], lastIdx) + 1000
        : 0;
    } else if (insertAtIndex === -1) {
      // ✅ FIX: also added explicit -1 check (was missing in modal)
      const first = questions[0];
      order = first ? getEffectiveOrder(first, 0) - 1000 : -1000;
    } else {
      const prev = questions[insertAtIndex];
      const next = questions[insertAtIndex + 1];
      const prevOrder = getEffectiveOrder(prev, insertAtIndex);
      const nextOrder = next
        ? getEffectiveOrder(next, insertAtIndex + 1)
        : prevOrder + 1000;
      order = (prevOrder + nextOrder) / 2;
    }

    order = Math.round(order);

    const res = await adminFetch(`/api/admin/quizzes/${quizId}/questions`, {
      method: "POST",
      body: JSON.stringify({ ...newQ, order }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
    setShowAddForm(false); setInsertAtIndex(null); fetchDetail();
  } catch (err) { alert(err.message); }
  finally { addingRef.current = false; }
};

  const handleSaveSettings = async () => {
    try {
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name:           settingsForm.quiz_name,
          time_limit_minutes:  settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty:          settingsForm.difficulty          || null,
          is_active:           settingsForm.is_active,
          is_trial:            settingsForm.is_trial,
          randomize_questions: settingsForm.randomize_questions,
          randomize_options:   settingsForm.randomize_options,
          max_attempts:        settingsForm.max_attempts,
        }),
      });
      if (res.ok) { setEditSettings(false); fetchDetail(); onRefresh?.(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
  };

  if (!quizId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl mx-4 my-8 shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 rounded-t-2xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{quiz?.quiz_name || "Loading..."}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                {quiz && (<>
                  <span>Year {quiz.year_level}</span><span>•</span><span>{quiz.subject}</span><span>•</span>
                  <span>Tier {quiz.tier}</span><span>•</span><span>{questions.length} questions</span><span>•</span>
                  <span>{quiz.total_points} points</span>
                  {quiz.time_limit_minutes && <><span>•</span><span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span></>}
                </>)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditSettings(!editSettings)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition">⚙️ Settings</button>
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition">✕</button>
            </div>
          </div>

          {editSettings && (
            <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Quiz Name</label>
                  <input type="text" value={settingsForm.quiz_name} onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Time Limit (min)</label>
                  <input type="number" value={settingsForm.time_limit_minutes} onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))} placeholder="No limit"
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Difficulty</label>
                  <select value={settingsForm.difficulty} onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none">
                    <option value="">Auto</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <QuizSettingsExtras form={settingsForm} onChange={setSettingsForm} compact />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_active} onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Active
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={settingsForm.is_trial} onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))} className="rounded border-slate-600 bg-slate-800" /> Trial (free)
                </label>
                <div className="flex-1" />
                <button onClick={() => setEditSettings(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                <button onClick={handleSaveSettings} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg">Save Settings</button>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        {/* Body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-4">

          {/* ── Text Preview Settings Toolbar ── */}
          <TextSettingsBar settings={textSettings} onChange={setTextSettings} />

          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No questions found</div>
          ) : (
            // ── PATCH 5 + 6: cards with insert forms + right-click + hint ──
            questions.map((q, i) => {
              if (editingId === q.question_id) {
                return <QuestionEditor key={q.question_id} question={q} quizRandomizeOptions={quiz.randomize_options} onSave={handleSaveQuestion} onCancel={() => setEditingId(null)} />;
              }
              const imgSizeCls = IMAGE_SIZE_MAP[q.image_size] || "max-w-md";
              const imgStyle = (q.image_width || q.image_height) ? {
                ...(q.image_width  ? { width:  `${q.image_width}px`,  maxWidth: "100%" } : {}),
                ...(q.image_height ? { height: `${q.image_height}px`, objectFit: "contain" } : {}),
              } : undefined;
              const effectiveShuffle = q.shuffle_options != null ? q.shuffle_options : (quiz.randomize_options || false);
              const showInsertBefore = showAddForm && i === 0 && insertAtIndex === -1;
              const showInsertAfter  = showAddForm && insertAtIndex === i;

              return (
                <div key={q.question_id}>

                  {/* Insert form BEFORE this card */}
                  {showInsertBefore && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 border-t border-indigo-500/40" />
                        <span className="text-[10px] text-indigo-400 font-medium px-2">Inserting before Q{i + 1}</span>
                        <div className="flex-1 border-t border-indigo-500/40" />
                      </div>
                      <AddQuestionForm
                        onAdd={handleAddQuestion}
                        onCancel={() => { setShowAddForm(false); setInsertAtIndex(null); }}
                      />
                    </div>
                  )}

                  {/* Question card */}
                  <div
                    className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 group hover:border-slate-600 transition select-none"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, questionId: q.question_id, index: i });
                    }}
                  >
                    {/* Question header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">{i + 1}</span>
                        <TypeBadge type={q.type} />
                        <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                        {q.categories?.[0]?.name && <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>}
                        {effectiveShuffle && <span className="text-[10px] px-2 py-0.5 rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-medium">🔀 Shuffle</span>}
                        {q.voice_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20 font-medium">🔊 Audio</span>}
                        {q.video_url && <span className="text-[10px] px-2 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/20 font-medium">🎬 Video</span>}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => setEditingId(q.question_id)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                        <button onClick={() => handleDeleteQuestion(q.question_id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Delete</button>
                        <span className="text-[10px] text-slate-600 italic">right-click for more</span>
                      </div>
                    </div>

                    {/* Question text */}
                    <div style={textStyle}>
                      <HtmlContent html={q.text} className={`leading-relaxed [&_img]:${imgSizeCls} [&_img]:rounded-lg [&_img]:mt-2 [&_img]:border [&_img]:border-slate-700`} />
                    </div>

                    {/* Question image */}
                    {q.image_url && !q.text?.includes(q.image_url) && (
                      <div className="mb-3 ml-10">
                        <img src={q.image_url} alt="Question" style={imgStyle} className={`${!q.image_width ? imgSizeCls : ""} rounded-lg border border-slate-700`} />
                      </div>
                    )}

                    {/* Audio & Video players */}
                    {(q.voice_url || q.video_url) && (
                      <div className="mb-3 ml-10 space-y-2">
                        {q.voice_url && (
                          <div className="flex items-center gap-3 bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
                            <span className="text-sm">🔊</span>
                            <audio src={q.voice_url} controls preload="metadata" className="h-8 flex-1" />
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{q.voice_url.split('/').pop()?.slice(0, 30)}</span>
                          </div>
                        )}
                        {q.video_url && (
                          <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 overflow-hidden">
                            {q.video_url.match(/youtube\.com|youtu\.be/) ? (
                              <iframe
                                src={`https://www.youtube.com/embed/${q.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1]}`}
                                className="w-full aspect-video max-h-48 rounded-lg"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen title="Quiz Video"
                              />
                            ) : (
                              <video src={q.video_url} controls preload="metadata" className="w-full max-h-48 rounded-lg" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Options */}
                    {q.options?.length > 0 && (
                      <div className="space-y-1.5 ml-10">
                        {q.options.map((opt, oi) => {
                          const letter = String.fromCharCode(65 + oi);
                          return (
                            <div key={opt.option_id || oi} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"}`}>
                              <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                                {opt.correct ? "✓" : letter}
                              </span>
                              <span className="text-slate-300" style={textStyle}>{opt.text}</span>
                              {opt.image_url && <img src={opt.image_url} alt={`Option ${letter}`} className="w-16 h-16 rounded-lg object-cover border border-slate-700" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Writing indicator */}
                    {q.type === "writing" && (
                      <div className="mt-3 ml-10 px-3 py-2 bg-pink-500/5 border border-pink-500/10 rounded-lg">
                        <p className="text-[10px] text-pink-400 font-medium">✏️ Student will write a text response</p>
                      </div>
                    )}

                    {/* Short answer correct answer */}
                    {q.type === "short_answer" && q.correct_answer && (
                      <div className="mt-3 ml-10 px-3 py-2 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                        <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider mb-1">✍️ Correct Answer</p>
                        <div className="flex flex-wrap gap-1.5">
                          {q.correct_answer.split("|").map((a, i) => (
                            <span key={i} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-xs font-medium">
                              {a.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                   {/* Explanation */}
                    {q.explanation && (
                      <div className="mt-3 ml-10 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-0.5">Explanation</p>
                        <p className="text-xs text-amber-400/80">{q.explanation}</p>
                      </div>
                    )}
                    {/* ── Tutor edited indicator ── */}
                      {q.tutor_edited_at && (
                        <div className="mt-2 ml-10 inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                          <svg className="w-3 h-3 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 013.182 3.182L6.75 19.963l-4.5 1.125 1.125-4.5L16.862 3.487z" />
                          </svg>
                          <span className="text-[10px] font-semibold text-violet-400">
                            Edited by tutor
                            {q.tutor_edited_by && (
                              <span className="font-normal opacity-70 ml-1">({q.tutor_edited_by})</span>
                            )}
                          </span>
                        </div>
                      )}

                    {/* ✅ Tutor verification — standalone, always visible */}
                     {q.tutor_verification?.status && q.tutor_verification.status !== "pending" && (
                  <div className="mt-3 ml-10 space-y-2">
                    {/* Tutor section header */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-slate-700/60" />
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1">
                        Tutor Review
                      </span>
                      <div className="flex-1 border-t border-slate-700/60" />
                    </div>
                    <div className={`px-3 py-2 rounded-lg border ${
                      q.tutor_verification.status === "approved"
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${
                        q.tutor_verification.status === "approved" ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {q.tutor_verification.status === "approved" ? "✓ Tutor Approved" : "✗ Tutor Rejected"}
                      </p>
                      {q.tutor_verification.status === "rejected" && q.tutor_verification.rejection_reason && (
                        <p className="text-xs text-red-400/70 mt-0.5">
                          {q.tutor_verification.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                )}


                    {/* ── Admin review controls ── */}
                    <AdminVerifyControls
                      question={q}
                      onVerified={(updatedQ) =>
                        setQuestions((prev) =>
                          prev.map((x) => x.question_id === updatedQ.question_id ? updatedQ : x)
                        )
                      }
                    />
                      </div>
                      
                    

                  {/* Insert form AFTER this card */}
                  {showInsertAfter && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 border-t border-indigo-500/40" />
                        <span className="text-[10px] text-indigo-400 font-medium px-2">Inserting after Q{i + 1}</span>
                        <div className="flex-1 border-t border-indigo-500/40" />
                      </div>
                      <AddQuestionForm
                        onAdd={handleAddQuestion}
                        onCancel={() => { setShowAddForm(false); setInsertAtIndex(null); }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-800 px-6 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Close</button>
        </div>
      </div>

      {/* ── PATCH 7: Right-click Context Menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
                    { icon: "✏️", label: "Edit Question", onClick: () => { setEditingId(contextMenu.questionId); setShowAddForm(false); setInsertAtIndex(null); } },
                    "divider",
                    { icon: "⬆️", label: `Insert Before Q${contextMenu.index + 1}`, onClick: () => { setInsertAtIndex(contextMenu.index - 1); setShowAddForm(true); setEditingId(null); } },
                    { icon: "⬇️", label: `Insert After Q${contextMenu.index + 1}`,  onClick: () => { setInsertAtIndex(contextMenu.index);     setShowAddForm(true); setEditingId(null); } },
                    "divider",
                    { icon: "↗️", label: "Move to Another Quiz", onClick: () => { const q = questions.find((q) => q.question_id === contextMenu.questionId); setMoveQuestion(q); } },
                    "divider",
                    { icon: "🗑️", label: "Delete Question", danger: true, onClick: () => handleDeleteQuestion(contextMenu.questionId) },
                  ]}      
        />
      )}
       {/* ── Move Modal — OUTSIDE contextMenu block ── */}
      {moveQuestion && (
        <MoveToQuizModal
          question={moveQuestion}
          currentQuizId={quizId}
          onClose={() => setMoveQuestion(null)}
          onMoved={() => { setMoveQuestion(null); fetchDetail(); }}
        />
      )}
    </div>
  );
}