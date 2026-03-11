/**
 * QuestionRenderer.jsx  (v7 — FIX: 401 on OCR by using useAuth() for token)
 *
 * Root cause of 401: FreeTextQuestion was reading token from wrong localStorage
 * keys. Fixed by importing useAuth() and using activeToken directly.
 *
 * Place in: src/app/components/quiz/QuestionRenderer.jsx
 */

import { useState, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// Re-enter fullscreen if it was exited (e.g. by file picker dialog)
function reEnterFullscreen() {
  const isFs = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
  if (!isFs) {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) fn.call(el).catch(() => {});
  }
}

/* ═══════════════════════════════════════
   IMAGE ZOOM MODAL
   ═══════════════════════════════════════ */
function ImageModal({ src, alt, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition"
      >
        ✕
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   RADIO BUTTON QUESTION
   ═══════════════════════════════════════ */
function RadioQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected?.[0] || null;
  return (
    <div className="space-y-3">
      {question.options.map((opt) => {
        const isSelected = selected === opt.option_id;
        return (
          <button
            key={opt.option_id}
            onClick={() => onAnswer({ selected: [opt.option_id] })}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
              }`}
            >
              {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
            {opt.image_url && (
              <img src={opt.image_url} alt={opt.text} className="h-16 object-contain rounded" />
            )}
            <span className={`text-sm ${isSelected ? "text-indigo-700 font-medium" : "text-slate-700"}`}>
              {opt.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   PICTURE CHOICE QUESTION
   ═══════════════════════════════════════ */
function PictureChoiceQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected?.[0] || null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {question.options.map((opt) => {
        const isSelected = selected === opt.option_id;
        return (
          <button
            key={opt.option_id}
            onClick={() => onAnswer({ selected: [opt.option_id] })}
            className={`relative rounded-xl border-2 overflow-hidden transition-all ${
              isSelected
                ? "border-indigo-500 ring-2 ring-indigo-200"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            {opt.image_url && (
              <img src={opt.image_url} alt={opt.text} className="w-full h-32 object-cover" />
            )}
            <div
              className={`px-3 py-2 text-sm text-center ${
                isSelected ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600"
              }`}
            >
              {opt.text}
            </div>
            {isSelected && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   CHECKBOX QUESTION
   ═══════════════════════════════════════ */
function CheckboxQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected || [];
  const toggle = (optionId) => {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    onAnswer({ selected: next });
  };
  return (
    <div className="space-y-3">
      {question.options.map((opt) => {
        const isSelected = selected.includes(opt.option_id);
        return (
          <button
            key={opt.option_id}
            onClick={() => toggle(opt.option_id)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div
              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
              }`}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            {opt.image_url && (
              <img src={opt.image_url} alt={opt.text} className="h-16 object-contain rounded" />
            )}
            <span className={`text-sm ${isSelected ? "text-indigo-700 font-medium" : "text-slate-700"}`}>
              {opt.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   SHORT ANSWER QUESTION
   ═══════════════════════════════════════ */
function ShortAnswerQuestion({ question, answer, onAnswer }) {
  const text = answer?.text || "";
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={text}
        onChange={(e) => onAnswer({ text: e.target.value })}
        placeholder="Type your answer here..."
        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-base text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
      />
      <p className="text-xs text-slate-400">Your answer is saved automatically.</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FREE TEXT / WRITING
   ✅ v7 FIX: uses useAuth() to get activeToken — fixes 401
   Shows mode picker for Year 3 Writing: Type vs Upload
   ═══════════════════════════════════════════════════════════ */
function FreeTextQuestion({ question, answer, onAnswer, yearLevel, subject, onUploadingChange }) {
  // ✅ THE FIX: get the token from AuthContext, not localStorage directly
  const { activeToken } = useAuth();

  const text = answer?.text || "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  // null = not chosen yet, "type" = textarea, "upload" = image upload
  const [mode, setMode] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Year 3 Writing gets the mode picker
  const isYear3Writing =
    Number(yearLevel) === 3 &&
    String(subject || "").toLowerCase().includes("writing");

  // ── OCR: extract text from handwriting image ──
  const extractHandwritingFromImage = async (file) => {
    setOcrLoading(true);
    setOcrError("");

    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      // Show preview while OCR runs
      setPreviewUrl(URL.createObjectURL(file));

      // ✅ Use activeToken from useAuth() — this is the correct token
      const res = await fetch(`${API_BASE}/api/ocr/handwriting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,   // ✅ THIS was the bug — was missing
        },
        body: JSON.stringify({
          base64,
          mediaType: file.type,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `OCR failed (${res.status})`);
      }

      const data = await res.json();
      onAnswer({ text: data.text });
    } catch (err) {
      setOcrError(err.message);
    } finally {
      setOcrLoading(false);
      onUploadingChange?.(false); // ✅ re-enable proctoring after upload
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setOcrError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    extractHandwritingFromImage(file);
  };

  // Tell ExamProctor to suppress violations while file picker is open
  const handlePickerClick = () => {
    if (!ocrLoading) {
      onUploadingChange?.(true);
      // Re-enable after 5s in case user cancels the picker without selecting
      setTimeout(() => onUploadingChange?.(false), 5000);
      fileInputRef.current?.click();
    }
  };

  // ── Year 3 Writing: show mode picker first ──
  if (isYear3Writing && mode === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 font-medium">How would you like to submit your writing?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Type option */}
          <button
            onClick={() => { setMode("type"); reEnterFullscreen(); }}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
          >
            <div className="w-12 h-12 bg-indigo-100 group-hover:bg-indigo-200 rounded-xl flex items-center justify-center transition-colors">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-800 text-sm">Type my answer</p>
              <p className="text-xs text-slate-400 mt-1">Use the keyboard to write</p>
            </div>
          </button>

          {/* Upload option */}
          <button
            onClick={() => setMode("upload")}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-800 text-sm">Upload handwriting</p>
              <p className="text-xs text-slate-400 mt-1">Take a photo of your writing</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Year 3 Writing: upload mode ──
  if (isYear3Writing && mode === "upload") {
    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => { setMode(null); setPreviewUrl(null); setOcrError(""); reEnterFullscreen(); }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Change method
        </button>

        {/* Upload area */}
        <div
          onClick={handlePickerClick}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            ocrLoading
              ? "border-indigo-300 bg-indigo-50 cursor-wait"
              : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {ocrLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-indigo-600 font-medium">Reading your handwriting...</p>
              <p className="text-xs text-slate-400">This takes a few seconds</p>
            </div>
          ) : previewUrl && text ? (
            <div className="space-y-3">
              <img src={previewUrl} alt="Uploaded handwriting" className="max-h-48 mx-auto rounded-lg object-contain" />
              <p className="text-xs text-emerald-600 font-medium">✅ Handwriting extracted successfully!</p>
              <p className="text-xs text-slate-400">Tap to upload a different image</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Tap to upload a photo</p>
                <p className="text-xs text-slate-400 mt-1">JPEG, PNG, or WebP • Max 20MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Error — with fallback to type mode */}
        {ocrError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm mt-0.5">⚠️</span>
              <p className="text-sm text-red-600">{ocrError}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setOcrError(""); fileInputRef.current?.click(); }}
                className="flex-1 px-3 py-2 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition"
              >
                🔄 Try again
              </button>
              <button
                onClick={() => { setMode("type"); setOcrError(""); reEnterFullscreen(); }}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                ✏️ Type instead
              </button>
            </div>
          </div>
        )}

        {/* Extracted text preview — editable */}
        {text && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Extracted text — you can edit this</p>
              <span className="text-xs text-slate-400">{wordCount} words</span>
            </div>
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <textarea
                value={text}
                onChange={(e) => onAnswer({ text: e.target.value })}
                rows={8}
                className="w-full px-5 py-4 text-base text-slate-800 leading-relaxed resize-y outline-none placeholder:text-slate-400"
                style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Default: plain textarea (all other questions + Year 3 Writing "type" mode) ──
  return (
    <div className="space-y-3">
      {isYear3Writing && mode === "type" && (
        <button
          onClick={() => { setMode(null); reEnterFullscreen(); }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Change method
        </button>
      )}
      <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <textarea
          value={text}
          onChange={(e) => onAnswer({ text: e.target.value })}
          placeholder="Write your answer here..."
          rows={12}
          className="w-full px-5 py-4 text-base text-slate-800 leading-relaxed resize-y outline-none min-h-[200px] placeholder:text-slate-400"
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
        />
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
            <span>{charCount} {charCount === 1 ? "character" : "characters"}</span>
          </div>
          {text.trim() && (
            <button
              onClick={() => onAnswer({ text: "" })}
              className="text-xs text-slate-400 hover:text-red-500 transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Write your response in the box above. Your answer is saved automatically.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN: QuestionRenderer
   ═══════════════════════════════════════ */
export default function QuestionRenderer({
  question,
  questionNumber,
  answer,
  isFlagged,
  onAnswer,
  onToggleFlag,
  yearLevel,
  subject,
  onUploadingChange,
}) {
  const [zoomImg, setZoomImg] = useState(null);

  return (
    <div className="space-y-6">
      {/* Question number + flag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
            {questionNumber}
          </span>
          {question.points > 0 && (
            <span className="text-xs text-slate-400">
              {question.points} {question.points === 1 ? "pt" : "pts"}
            </span>
          )}
        </div>
        <button
          onClick={onToggleFlag}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            isFlagged
              ? "bg-amber-100 text-amber-700 border border-amber-200"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill={isFlagged ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
          </svg>
          {isFlagged ? "Flagged" : "Flag"}
        </button>
      </div>

      {/* Question text */}
      <div className="text-base text-slate-800 leading-relaxed font-medium">
        {question.text && question.text.includes("<") ? (
          <div
            dangerouslySetInnerHTML={{ __html: question.text }}
            className="prose prose-slate prose-sm max-w-none [&_img]:rounded-lg [&_img]:max-w-full [&_img]:cursor-zoom-in"
          />
        ) : question.text ? (
          <p>{question.text}</p>
        ) : null}
      </div>

      {/* Question image */}
      {question.image_url && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <img
            src={question.image_url && question.image_url.startsWith("http") ? question.image_url : `${API_BASE}${question.image_url}`}
            alt="Question image"
            className="max-w-full max-h-96 object-contain mx-auto rounded-lg cursor-zoom-in"
            style={{
              ...(question.image_width ? { width: `${question.image_width}px`, maxWidth: "100%" } : {}),
              ...(question.image_height ? { height: `${question.image_height}px`, objectFit: "contain" } : {}),
            }}
            onClick={() => setZoomImg(question.image_url)}
          />
        </div>
      )}

      {/* Answer area */}
      {question.type === "radio_button" && (
        <RadioQuestion question={question} answer={answer} onAnswer={onAnswer} />
      )}
      {question.type === "picture_choice" && (
        <PictureChoiceQuestion question={question} answer={answer} onAnswer={onAnswer} />
      )}
      {question.type === "checkbox" && (
        <CheckboxQuestion question={question} answer={answer} onAnswer={onAnswer} />
      )}
      {question.type === "free_text" && (
        <FreeTextQuestion
          question={question}
          answer={answer}
          onAnswer={onAnswer}
          yearLevel={yearLevel}
          subject={subject}
          onUploadingChange={onUploadingChange}
        />
      )}
      {question.type === "short_answer" && (
        <ShortAnswerQuestion question={question} answer={answer} onAnswer={onAnswer} />
      )}

      {zoomImg && (
        <ImageModal src={zoomImg} alt="Question image" onClose={() => setZoomImg(null)} />
      )}
    </div>
  );
}