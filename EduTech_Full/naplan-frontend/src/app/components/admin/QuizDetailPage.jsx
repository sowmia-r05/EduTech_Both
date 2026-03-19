/**
 * QuizDetailPage.jsx — Full page version of quiz detail
 * Route: /admin/quiz/:quizId
 *
 * ✅ Fixed: CollapsibleImageResize now wired into QuestionEditor
 * ✅ Fixed: form state includes image_size, image_width, image_height
 * ✅ Fixed: handleSave sends image_size, image_width, image_height
 * ✅ Fixed: Image preview + remove button
 * ✅ Fixed: showAddForm & handleAddQuestion inside component
 * ✅ Fixed: Short answer support in QuestionEditor
 * ✅ Fixed: Option image upload + preview in QuestionEditor
 * ✅ Fixed: TypeBadge now includes "writing" type
 * ✅ Fixed: Type dropdown now includes "writing" option
 * ✅ Fixed: Card view applies image_width / image_height as inline style
 * ✅ Fixed: Card view shows writing indicator block
 * ✅ Fixed: image_width/image_height use ?? null (not || null)
 * ✅ Fixed: Options hidden for writing type in editor
 * ✅ Added: Right-click context menu — Edit / Insert Before / Insert After / Delete
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";
import DownloadXlsxButton from "./DownloadExcelButton";
import { AddQuestionForm } from "./ManualQuizCreator";
import CollapsibleImageResize from "./CollapsibleImageResize";

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
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed");
      }
      const data = await res.json();
      onUploaded(data.url?.startsWith("http") ? data.url : `${API}${data.url}`);
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs text-slate-300 rounded-lg border border-slate-600 transition flex items-center gap-1.5 flex-shrink-0"
      >
        {uploading
          ? <><span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> Uploading...</>
          : <><span>📎</span>{label}</>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }}
      />
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function HtmlContent({ html, className = "" }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} style={{ overflowWrap: "break-word" }} />;
}

// ✅ FIX 1: Added "writing" to TypeBadge styles and labels
function TypeBadge({ type }) {
  const styles = {
    radio_button:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    checkbox:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
    picture_choice: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    free_text:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    short_answer:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
    writing:        "bg-pink-500/10 text-pink-400 border-pink-500/20",   // ✅ ADDED
  };
  const labels = {
    radio_button:   "Single Choice",
    checkbox:       "Multiple Choice",
    picture_choice: "Picture Choice",
    free_text:      "Free Text",
    short_answer:   "Short Answer",
    writing:        "Writing",   // ✅ ADDED
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[type] || "bg-slate-500/10 text-slate-400"}`}>
      {labels[type] || type}
    </span>
  );
}

const IMAGE_SIZE_MAP = { small: "max-w-[200px]", medium: "max-w-md", large: "max-w-xl", full: "max-w-full" };

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

  if (current === "approved") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="approved" />
        <button disabled={loading} onClick={() => handleVerify("pending")}
          className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40">
          Reset to Pending
        </button>
        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status={current} />
        <button disabled={loading} onClick={() => handleVerify("approved")}
          className="px-2.5 py-1 text-[10px] font-semibold bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40">
          <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Approve
        </button>
        <button disabled={loading} onClick={() => setShowReject((v) => !v)}
          className="px-2.5 py-1 text-[10px] font-semibold bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40">
          <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Reject
        </button>
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
          <button onClick={() => { setShowReject(false); setReason(""); }}
            className="text-xs text-slate-500 hover:text-white">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── ADDED: Context Menu ───────────────────────────────────────────────────────
   // ── ADDED: Context Menu ───────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    return () => { window.removeEventListener("click", close); };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 min-w-[180px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === "divider" ? (
          <div key={i} className="my-1 border-t border-slate-700" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition hover:bg-slate-700 ${item.danger ? "text-red-400 hover:text-red-300" : "text-slate-300 hover:text-white"}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}


// ─── Question Editor ──────────────────────────────────────────────────────────
function QuestionEditor({ question, quizRandomizeOptions, onSave, onCancel }) {

  const [form, setForm] = useState({
    text:            question.text            || "",
    type:            question.type            || "radio_button",
    points:          question.points          || 1,
    category:        question.categories?.[0]?.name || "",
    image_url:       question.image_url       || "",
    image_size:      question.image_size      || "medium",
    image_width:     question.image_width     ?? null,   // ✅ FIX: ?? not ||
    image_height:    question.image_height    ?? null,   // ✅ FIX: ?? not ||
    explanation:     question.explanation     || "",
    shuffle_options: question.shuffle_options ?? (quizRandomizeOptions || false),
    voice_url:       question.voice_url       || "",
    video_url:       question.video_url       || "",
    correct_answer:  question.correct_answer  || "",
    case_sensitive:  question.case_sensitive  || false,
    options: (question.options || []).map((o) => ({
      option_id: o.option_id,
      text:      o.text      || "",
      image_url: o.image_url || "",
      correct:   o.correct   || false,
    })),
  });
  const [saving, setSaving] = useState(false);

  const updateOption = (idx, field, value) => {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "correct" && value && f.type === "radio_button")
        opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      return { ...f, options: opts };
    });
  };

  const addOption    = () => setForm((f) => ({ ...f, options: [...f.options, { option_id: "", text: "", image_url: "", correct: false }] }));
  const removeOption = (idx) => {
    if (form.options.length <= 2) return;
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(question.question_id, {
      text:            form.text,
      type:            form.type,
      points:          form.points,
      category:        form.category,
      image_url:       form.image_url,
      image_size:      form.image_size,
      image_width:     form.image_width,
      image_height:    form.image_height,
      explanation:     form.explanation,
      shuffle_options: form.shuffle_options,
      voice_url:       form.voice_url    || null,
      video_url:       form.video_url    || null,
      correct_answer:  form.correct_answer || null,
      case_sensitive:  form.case_sensitive,
      options:         form.options,
    });
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/50 border-2 border-indigo-500/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-indigo-400">✏️ Edit Question</h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white">Cancel</button>
      </div>

      {/* Question Text */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Question Text</label>
        <textarea
          rows={3}
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Type / Points / Category */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          {/* ✅ FIX 2: Added "writing" option to the dropdown */}
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
          >
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
          <input
            type="number" min="1" value={form.points}
            onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Category</label>
          <input
            type="text" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
          />
        </div>
      </div>

      {/* Image URL + Upload */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Image URL</label>
        <div className="flex items-center gap-2">
          <input
            type="text" value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            placeholder="https://... or upload →"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
          />
          <FileUploadButton
            accept="image/*,.pdf"
            label="Upload"
            onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))}
          />
          {form.image_url && (
            <button
              onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
              className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
            >✕</button>
          )}
        </div>

        {/* Image preview */}
        {form.image_url && (
          <div className="mt-2">
            {form.image_url.toLowerCase().endsWith(".pdf") ? (
              <a
                href={form.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition"
              >
                📄 PDF — click to preview
              </a>
            ) : (
              <div className="relative inline-block max-w-full">
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
                <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] rounded font-medium">
                  Preview
                </span>
                {/* Live size label */}
                {(form.image_width || form.image_height) && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-indigo-600/80 text-white text-[9px] rounded font-mono">
                    {form.image_width ? `${form.image_width}px` : "auto"} × {form.image_height ? `${form.image_height}px` : "auto"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <CollapsibleImageResize form={form} setForm={setForm} />
      </div>

      {/* Explanation */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Explanation</label>
        <input
          type="text" value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
        />
      </div>

      {/* Short Answer */}
      {form.type === "short_answer" && (
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <label className="block text-xs text-slate-400 mb-1">
            Correct Answer <span className="text-slate-600">— separate multiple with | (pipe)</span>
          </label>
          <input
            type="text" value={form.correct_answer}
            onChange={(e) => setForm((f) => ({ ...f, correct_answer: e.target.value }))}
            placeholder='e.g. "Paris" or "Paris|paris|PARIS"'
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
          />
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox" checked={form.case_sensitive}
              onChange={(e) => setForm((f) => ({ ...f, case_sensitive: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800"
            />
            Case-sensitive grading
          </label>
        </div>
      )}

      {/* Settings: Shuffle + Voice + Video */}
      <div className="pt-3 border-t border-slate-700 space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Question Settings</p>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox" checked={form.shuffle_options}
            onChange={(e) => setForm((f) => ({ ...f, shuffle_options: e.target.checked }))}
            className="rounded border-slate-600 bg-slate-800 text-indigo-500"
          />
          🔀 Shuffle Options
          {quizRandomizeOptions && <span className="text-[10px] text-slate-500 ml-1">(quiz default: ON)</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">🔊 Audio URL</label>
            <div className="flex items-center gap-2">
              <input
                type="url" value={form.voice_url}
                onChange={(e) => setForm((f) => ({ ...f, voice_url: e.target.value }))}
                placeholder="Paste URL or upload →"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
              />
              <FileUploadButton
                accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                label="Upload"
                onUploaded={(url) => setForm((f) => ({ ...f, voice_url: url }))}
              />
            </div>
            {form.voice_url && (
              <div className="mt-1.5 flex items-center gap-2">
                <audio src={form.voice_url} controls className="h-7 flex-1" preload="metadata" />
                <button onClick={() => setForm((f) => ({ ...f, voice_url: "" }))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">🎬 Video URL</label>
            <div className="flex items-center gap-2">
              <input
                type="url" value={form.video_url}
                onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                placeholder="Paste URL or upload →"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
              />
              <FileUploadButton
                accept="video/mp4,video/webm,.mp4,.webm,.mov"
                label="Upload"
                onUploaded={(url) => setForm((f) => ({ ...f, video_url: url }))}
              />
            </div>
            {form.video_url && (
              <div className="mt-1.5 flex items-center gap-2">
                {form.video_url.match(/youtube\.com|youtu\.be/) ? (
                  <span className="text-xs text-green-400">✓ YouTube link attached</span>
                ) : (
                  <video src={form.video_url} controls className="w-full max-h-24 rounded border border-slate-700" preload="metadata" />
                )}
                <button onClick={() => setForm((f) => ({ ...f, video_url: "" }))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ FIX: Options hidden for free_text, short_answer, AND writing */}
      {form.type !== "free_text" && form.type !== "short_answer" && form.type !== "writing" && (
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
                    opt.correct ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-900 border-slate-600"
                  }`}
                >
                  {opt.correct && "✓"}
                </button>
                <span className="text-xs text-slate-500 w-4">{String.fromCharCode(65 + i)}</span>
                <input
                  type="text" value={opt.text}
                  onChange={(e) => updateOption(i, "text", e.target.value)}
                  placeholder="Option text..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                />
                {form.type === "picture_choice" && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={opt.image_url || ""}
                    onChange={(e) => updateOption(i, "image_url", e.target.value)}
                    placeholder="Image URL..."
                    className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        const formData = new FormData();
                        formData.append("file", file);

                        try {
                          const res = await fetch("/api/admin/upload", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
                            },
                            body: formData,
                          });
                          const data = await res.json();
                          if (data.url) {
                            updateOption(i, "image_url", data.url);
                          }
                        } catch (err) {
                          console.error("Upload failed:", err);
                        }
                      };
                      input.click();
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-white rounded border border-slate-600 whitespace-nowrap"
                  >
                    📎 Upload
                  </button>
                </div>
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
        <button
          onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
        >
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

  const [quiz,           setQuiz]           = useState(null);
  const [questions,      setQuestions]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [editingId,      setEditingId]      = useState(null);
  const [showSettings,   setShowSettings]   = useState(false);
  const [settingsForm,   setSettingsForm]   = useState({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [error,          setError]          = useState("");
  const [showAddForm,    setShowAddForm]    = useState(false);
  // ── ADDED: state for context menu + positional insert ──
  const [insertAtIndex,  setInsertAtIndex]  = useState(null);
  const [contextMenu,    setContextMenu]    = useState(null);

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
    const res = await adminFetch(`/api/admin/questions/${questionId}`, {
      method: "PATCH", body: JSON.stringify(updates),
    });
    if (res.ok) { setEditingId(null); fetchDetail(); }
    else { const d = await res.json(); alert(d.error || "Save failed"); }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
    if (res.ok) fetchDetail(); else alert("Delete failed");
  };

  // ── ADDED: updated to support positional ordering ──
  const handleAddQuestion = async (newQ) => {
    try {
      let order;
      if (insertAtIndex === null) {
        const last = questions[questions.length - 1];
        order = last ? (last.order ?? questions.length - 1) + 1 : 0;
      } else {
        const prev = questions[insertAtIndex];
        const next = questions[insertAtIndex + 1];
        const prevOrder = prev?.order ?? insertAtIndex;
        const nextOrder = next?.order ?? (insertAtIndex + 2);
        order = (prevOrder + nextOrder) / 2;
      }
      const res = await adminFetch(`/api/admin/quizzes/${quizId}/questions`, {
        method: "POST",
        body: JSON.stringify({ ...newQ, order }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add question");
      }
      setShowAddForm(false);
      setInsertAtIndex(null);
      fetchDetail();
    } catch (err) {
      alert(err.message);
    }
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
            <button
              onClick={() => navigate(`${ADMIN_PATH}/dashboard`)}
              className="text-slate-400 hover:text-white transition flex-shrink-0"
            >
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
            {questions.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
                <span className="text-emerald-400 font-semibold">{verStats.approved}</span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-400">{questions.length}</span>
                <span className="text-slate-500 ml-0.5">verified</span>
              </div>
            )}
            {quiz && (
              <DownloadXlsxButton quizId={quiz.quiz_id || quiz._id} quizName={quiz.quiz_name} />
            )}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg border border-slate-700 transition"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-6 py-8">

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Quiz Settings</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Quiz Name</label>
                <input
                  type="text" value={settingsForm.quiz_name}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Time Limit (min)</label>
                <input
                  type="number" value={settingsForm.time_limit_minutes}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
                  placeholder="No limit"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max Attempts</label>
                <input
                  type="number" value={settingsForm.max_attempts}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, max_attempts: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Difficulty</label>
                <select
                  value={settingsForm.difficulty}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white outline-none"
                >
                  <option value="">Auto</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {[
                ["is_active",           "Active"],
                ["is_trial",            "Trial (free)"],
                ["randomize_questions", "Randomize Questions"],
                ["randomize_options",   "Randomize Options"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm[key] || false}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
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
        ) : (
          <div className="space-y-4">

            {/* Questions Header + Add Button */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Questions ({questions.length})
              </h2>
              {!showAddForm && (
                <button
                  onClick={() => { setShowAddForm(true); setEditingId(null); }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5"
                >
                  + Add Question
                </button>
              )}
            </div>

            {/* Add Question Form (end of list) */}
            {showAddForm && insertAtIndex === null && (
              <AddQuestionForm
                onAdd={handleAddQuestion}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            {/* Empty state */}
            {questions.length === 0 && !showAddForm && (
              <div className="text-center py-24 text-slate-500">
                No questions in this quiz yet.
              </div>
            )}

            {/* Question Cards */}
            {questions.map((q, i) => {
              if (editingId === q.question_id) {
                return (
                  <QuestionEditor
                    key={q.question_id}
                    question={q}
                    quizRandomizeOptions={quiz?.randomize_options}
                    onSave={handleSaveQuestion}
                    onCancel={() => setEditingId(null)}
                  />
                );
              }

              const verStatus   = q.tutor_verification?.status || "pending";
              const borderColor = verStatus === "approved" ? "border-emerald-500/30"
                                : verStatus === "rejected"  ? "border-red-500/30"
                                : "border-slate-700/50";

              // ✅ FIX 3: Compute imgSizeCls and imgStyle for the card view
              const imgSizeCls = IMAGE_SIZE_MAP[q.image_size] || "max-w-md";
              const imgStyle = (q.image_width || q.image_height) ? {
                ...(q.image_width  ? { width: `${q.image_width}px`, maxWidth: "100%" } : {}),
                ...(q.image_height ? { height: `${q.image_height}px`, objectFit: "contain" } : {}),
              } : undefined;

              // ── ADDED: insert form visibility flags ──
              const showInsertBefore = showAddForm && insertAtIndex === i - 1;
              const showInsertAfter  = showAddForm && insertAtIndex === i;

              return (
                <div key={q.question_id}>

                  {/* ── ADDED: Insert form BEFORE this card ── */}
                  {showInsertBefore && (
                    <div className="mb-4">
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

                  {/* ── ADDED: onContextMenu on the card ── */}
                  <div
                    className={`bg-slate-900 border ${borderColor} rounded-xl p-5 group select-none`}
                   onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // ← ADD THIS
                    setContextMenu({ x: e.clientX, y: e.clientY, questionId: q.question_id, index: i });
                  }}
                  >

                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">
                          {i + 1}
                        </span>
                        <TypeBadge type={q.type} />
                        <span className="text-xs text-slate-500">{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                        {q.categories?.[0]?.name && (
                          <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>
                        )}
                        {(q.shuffle_options ?? quiz?.randomize_options) && (
                          <span className="text-[10px] px-2 py-0.5 rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-medium">🔀 Shuffle</span>
                        )}
                        {q.voice_url && (
                          <span className="text-[10px] px-2 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20 font-medium">🔊 Audio</span>
                        )}
                        {q.video_url && (
                          <span className="text-[10px] px-2 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/20 font-medium">🎬 Video</span>
                        )}
                        <VerificationBadge status={verStatus} />
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => { setEditingId(q.question_id); setShowAddForm(false); setInsertAtIndex(null); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.question_id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium"
                        >
                          Delete
                        </button>
                        {/* ── ADDED: hint ── */}
                        <span className="text-[10px] text-slate-600 italic">right-click for more</span>
                      </div>
                    </div>

                    {/* Question text */}
                    <div className="mb-3 ml-10">
                      <HtmlContent
                        html={q.text}
                        className={`text-sm text-white leading-relaxed [&_img]:${imgSizeCls} [&_img]:rounded-lg [&_img]:mt-2 [&_img]:border [&_img]:border-slate-700`}
                      />
                    </div>

                    {/* ✅ FIX 3: Question image with imgStyle applied */}
                    {q.image_url && !q.text?.includes(q.image_url) && (
                      <div className="mb-3 ml-10">
                        <img
                          src={q.image_url}
                          alt="Question"
                          style={imgStyle}
                          className={`${!q.image_width ? imgSizeCls : ""} rounded-lg border border-slate-700 object-contain`}
                        />
                      </div>
                    )}

                    {/* Audio & Video players */}
                    {(q.voice_url || q.video_url) && (
                      <div className="mb-3 ml-10 space-y-2">
                        {q.voice_url && (
                          <div className="flex items-center gap-3 bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
                            <span className="text-sm">🔊</span>
                            <audio src={q.voice_url} controls preload="metadata" className="h-8 flex-1" />
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
                        {q.options.map((opt, oi) => (
                          <div
                            key={opt.option_id || oi}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                              opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"
                            }`}
                          >
                            <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                              opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"
                            }`}>
                              {opt.correct ? "✓" : String.fromCharCode(65 + oi)}
                            </span>
                            <span className="text-slate-300">{opt.text}</span>
                            {opt.image_url && (
                              <img src={opt.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-700" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ✅ FIX 4: Writing indicator */}
                    {q.type === "writing" && (
                      <div className="mt-2 ml-10 px-3 py-2 bg-pink-500/5 border border-pink-500/10 rounded-lg">
                        <p className="text-[10px] text-pink-400 font-medium">✏️ Student will write a text response</p>
                      </div>
                    )}

                    {/* Short answer */}
                    {q.type === "short_answer" && q.correct_answer && (
                      <div className="mt-2 ml-10 px-3 py-2 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                        <p className="text-[10px] text-orange-500 font-bold mb-0.5">✍️ Answer</p>
                        <div className="flex flex-wrap gap-1.5">
                          {q.correct_answer.split("|").map((a, ai) => (
                            <span key={ai} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-xs">
                              {a.trim()}
                            </span>
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

                    {/* Verification */}
                    {canVerify && (
                      <div className="mt-3 pt-3 border-t border-slate-800 ml-10">
                        <VerifyControls question={q} onVerified={handleQuestionVerified} />
                      </div>
                    )}
                  </div>

                  {/* ── ADDED: Insert form AFTER this card ── */}
                  {showInsertAfter && (
                    <div className="mt-4">
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
            })}
          </div>
        )}
      </div>

      {/* ── ADDED: Right-click Context Menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { icon: "✏️", label: "Edit Question",                          onClick: () => { setEditingId(contextMenu.questionId); setShowAddForm(false); setInsertAtIndex(null); } },
            "divider",
            { icon: "⬆️", label: `Insert Before Q${contextMenu.index + 1}`, onClick: () => { setInsertAtIndex(contextMenu.index - 1); setShowAddForm(true); setEditingId(null); } },
            { icon: "⬇️", label: `Insert After Q${contextMenu.index + 1}`,  onClick: () => { setInsertAtIndex(contextMenu.index);     setShowAddForm(true); setEditingId(null); } },
            "divider",
            { icon: "🗑️", label: "Delete Question", danger: true,          onClick: () => handleDeleteQuestion(contextMenu.questionId) },
          ]}
        />
      )}
    </div>
  );
}