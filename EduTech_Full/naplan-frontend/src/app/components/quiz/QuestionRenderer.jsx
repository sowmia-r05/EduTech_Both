/**
 * QuestionRenderer.jsx  (v10 — text display settings toolbar)
 *
 * Changes from v9:
 *  ✅ textSettings state applied to question text + all answer option labels
 *  ✅ Full OCR / Year 3 handwriting upload preserved from v9
 */

import { useState, useRef , useMemo  } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { LineMatchQuestion, WordClickQuestion } from "./InteractiveQuestionTypes";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";


/* ─── Helpers ─────────────────────────────────────────────── */
function resolveImgSrc(url) {
  if (!url) return null;
  const u = url.trim();
  if (u.startsWith("http") || u.startsWith("data:") || u.startsWith("blob:")) return u;
  return `${API_BASE}${u}`;
}

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
// Add this after the reEnterFullscreen function
function buildTextStyle(q) {
  return {
    fontSize:      q.text_font_size      ? `${q.text_font_size}px`      : undefined,
    fontFamily:    q.text_font_family    || undefined,
    fontWeight:    q.text_font_weight    || undefined,
    textAlign:     q.text_align          || undefined,
    lineHeight:    q.text_line_height    || undefined,
    letterSpacing: q.text_letter_spacing ? `${q.text_letter_spacing}px` : undefined,
    color:         q.text_color          || undefined,
  };
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
   IMAGE WITH LOADING SKELETON
   ═══════════════════════════════════════ */
function ImageWithLoader({ src, width, height, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      {!loaded && !error && (
        <div
          className="mx-auto rounded-lg bg-slate-200 animate-pulse"
          style={{
            width: width ? `${Math.min(width, 600)}px` : "100%",
            height: height ? `${height}px` : "200px",
            maxWidth: "100%",
          }}
        />
      )}
      {!error && (
        <img
          src={src}
          alt="Question image"
          fetchPriority="high"
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setError(true); }}
          onClick={onClick}
          className={`object-contain mx-auto rounded-lg cursor-zoom-in transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0 h-0 pointer-events-none"
          }${!height ? " max-h-96" : ""}${!width ? " max-w-full" : ""}`}
          style={{
            ...(width  ? { width: `${width}px`, maxWidth: "100%" } : {}),
            ...(height ? { height: `${height}px`, objectFit: "contain" } : {}),
          }}
        />
      )}
      {error && (
        <p className="text-center text-sm text-slate-400 py-6">⚠️ Image could not be loaded</p>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════
   RADIO BUTTON QUESTION
   ═══════════════════════════════════════ */
function RadioQuestion({ question, answer, onAnswer, textStyle }) {
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
              <img
                src={resolveImgSrc(opt.image_url)}
                alt={opt.text}
                className="h-16 object-contain rounded"
              />
            )}
            <span
              className={isSelected ? "text-indigo-700" : "text-slate-700"}
              style={textStyle}
            >
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
function PictureChoiceQuestion({ question, answer, onAnswer, textStyle }) {
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
              <img
                src={resolveImgSrc(opt.image_url)}
                alt={opt.text}
                className="w-full h-32 object-cover"
              />
            )}
            <div
              className={`px-3 py-2 text-center ${
                isSelected ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-600"
              }`}
              style={textStyle}
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
function CheckboxQuestion({ question, answer, onAnswer, textStyle }) {
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
              <img src={resolveImgSrc(opt.image_url)} alt={opt.text} className="h-16 object-contain rounded" />
            )}
            <span
              className={isSelected ? "text-indigo-700" : "text-slate-700"}
              style={textStyle}
            >
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
function ShortAnswerQuestion({ question, answer, onAnswer, textStyle }) {
  const text = answer?.text || "";
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={text}
        onChange={(e) => onAnswer({ text: e.target.value })}
        placeholder="Type your answer here..."
        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-base text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
        style={textStyle}
      />
      <p className="text-xs text-slate-400">Your answer is saved automatically.</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WRITING QUESTION
   ✅ Full OCR / Year 3 handwriting upload preserved from v9
   ✅ textStyle applied to all textareas
   ═══════════════════════════════════════════════════════════ */
function WritingQuestion({ question, answer, onAnswer, yearLevel, subject, onUploadingChange, textStyle }) {
  const { activeToken } = useAuth();

  const text = answer?.text || "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  const [mode, setMode] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const MAX_FILE_SIZE_MB = 5;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const isYear3Writing =
    Number(yearLevel) === 3 &&
    String(subject || "").toLowerCase().includes("writing");

  const extractHandwritingFromImage = async (file) => {
    setOcrLoading(true);
    setOcrError("");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      setPreviewUrl(URL.createObjectURL(file));
      const res = await fetch(`${API_BASE}/api/ocr/handwriting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ base64, mediaType: file.type }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `OCR failed (${res.status})`);
      }
      const data = await res.json();
      onAnswer({ text: data.text });
    } catch (err) {
      setOcrError(err.message);
      setPreviewUrl(null);
      onAnswer({ text: "" });
    } finally {
      setOcrLoading(false);
      onUploadingChange?.(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setOcrError("Only photo files are allowed. Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setOcrError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please upload an image under ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    extractHandwritingFromImage(file);
  };

  const handlePickerClick = () => {
    if (!ocrLoading) {
      onUploadingChange?.(true);
      setTimeout(() => onUploadingChange?.(false), 5000);
      fileInputRef.current?.click();
    }
  };

  // ── Year 3 Writing: mode picker ──
  if (isYear3Writing && mode === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 font-medium">How would you like to submit your writing?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <button
          onClick={() => { setMode(null); setPreviewUrl(null); setOcrError(""); reEnterFullscreen(); }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Change method
        </button>
        <div
          onClick={handlePickerClick}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            ocrLoading ? "border-indigo-300 bg-indigo-50 cursor-wait" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
          }`}
        >
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
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
                <p className="text-xs text-slate-400 mt-1">Photo only (JPEG, PNG, WebP) • Max 5MB</p>
              </div>
            </div>
          )}
        </div>
        {ocrError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm mt-0.5">⚠️</span>
              <p className="text-sm text-red-600">{ocrError}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setOcrError(""); fileInputRef.current?.click(); }} className="flex-1 px-3 py-2 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition">Try again</button>
              <button onClick={() => { setMode("type"); setOcrError(""); reEnterFullscreen(); }} className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition">Type instead</button>
            </div>
          </div>
        )}
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
                style={textStyle}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Default: plain textarea (also used for Year 3 "type" mode) ──
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
          style={textStyle}
        />
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
            <span>{charCount} {charCount === 1 ? "character" : "characters"}</span>
          </div>
          {text.trim() && (
            <button onClick={() => onAnswer({ text: "" })} className="text-xs text-slate-400 hover:text-red-500 transition">
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400">Write your response in the box above. Your answer is saved automatically.</p>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
   WORD TAP — Language Convention only
   Click the word used incorrectly in the sentence
   ═══════════════════════════════════════════════════════════ */
function WordTapQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected?.[0] || null;
  return (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-xl leading-loose">
        {(question.options || []).map((opt) => {
          const isSelected = selected === opt.option_id;
          return (
            <button
              key={opt.option_id}
              onClick={() => onAnswer({ selected: [opt.option_id] })}
              className={`inline-flex items-center mx-2 my-2 px-5 py-3 rounded-xl border-2 font-semibold transition-all text-xl ${
                isSelected
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-md scale-105"
                  : "bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
              }`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
      <p className="text-base text-slate-500 text-center font-medium">👆 Tap the word that is used incorrectly</p>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PUNCTUATION PLACEMENT — Language Convention only
   Sentence uses [A] [B] [C] [D] as position markers
   ═══════════════════════════════════════════════════════════ */
function PunctuationPlacementQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected?.[0] || null;
  
  // Split question text into instruction + sentence
  // Sentence is the part containing [A] [B] etc
  const fullText = question.text || "";
  const sentencePart = fullText.includes("[A]") ? fullText : fullText;
  const parts = sentencePart.split(/(\[A\]|\[B\]|\[C\]|\[D\])/);

  // Map letters to options by index — A=first option, B=second etc
  const letterToOption = {};
  (question.options || []).forEach((opt, idx) => {
    const letter = String.fromCharCode(65 + idx); // A, B, C, D
    letterToOption[letter] = opt;
  });

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-xl leading-[3rem] font-medium text-slate-800">
        {parts.map((part, i) => {
          const isMarker = /^\[.\]$/.test(part);
          const letter = part.replace(/[\[\]]/g, "");
          const matchingOpt = letterToOption[letter];
          const isSelected = matchingOpt && selected === matchingOpt.option_id;
          if (isMarker) {
            return (
              <button
                key={i}
                onClick={() => matchingOpt && onAnswer({ selected: [matchingOpt.option_id] })}
                className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-white text-base font-bold mx-2 transition-all border-2 shadow-md ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-600 scale-110 shadow-md"
                    : "bg-emerald-500 border-emerald-500 hover:bg-indigo-500 hover:border-indigo-500"
                }`}
              >
                {letter}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
      <p className="text-base text-slate-500 text-center font-medium">Tap the circle where the comma should go</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CATEGORY DROP — Language Convention only
   Tap words to sort into category boxes (Noun / Adjective / Adverb)
   Uses matching type: option.text = word, option.match = category
   ═══════════════════════════════════════════════════════════ */
function CategoryDropQuestion({ question, answer, onAnswer }) {
  const pairs = answer?.pairs || {};
  const categories = [...new Set(
    (question.options || []).map(o => o.match || o.match_text || "").filter(Boolean)
  )];
  const placed = Object.keys(pairs);
  const unplaced = (question.options || []).filter(o => !placed.includes(o.option_id));

  const handleDragStart = (e, optionId) => {
    e.dataTransfer.setData("optionId", optionId);
  };

  const handleDrop = (e, category) => {
    e.preventDefault();
    const optionId = e.dataTransfer.getData("optionId");
    if (!optionId) return;
    onAnswer({ pairs: { ...pairs, [optionId]: category } });
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleRemove = (optionId) => {
    const updated = { ...pairs };
    delete updated[optionId];
    onAnswer({ pairs: updated });
  };

  return (
    <div className="space-y-5">
      {/* Word bank */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Drag words into the correct box
        </p>
        <div
          className="min-h-14 bg-sky-50 border-2 border-dashed border-sky-300 rounded-xl p-3 flex flex-wrap gap-2"
          onDragOver={handleDragOver}
          onDrop={(e) => {
            e.preventDefault();
            const optionId = e.dataTransfer.getData("optionId");
            if (!optionId) return;
            const updated = { ...pairs };
            delete updated[optionId];
            onAnswer({ pairs: updated });
          }}
        >
          {unplaced.map(opt => (
            <div
              key={opt.option_id}
              draggable
              onDragStart={(e) => handleDragStart(e, opt.option_id)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-full text-sm font-medium cursor-grab active:cursor-grabbing select-none shadow-sm hover:bg-indigo-700 transition"
            >
              {opt.text}
            </div>
          ))}
          {unplaced.length === 0 && (
            <span className="text-xs text-slate-400 italic">All words placed ✓</span>
          )}
        </div>
      </div>

      {/* Category boxes */}
      <div className={`grid gap-4 ${categories.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {categories.map(cat => {
          const wordsInCat = (question.options || []).filter(o => pairs[o.option_id] === cat);
          return (
            <div key={cat} className="space-y-2">
              <p className="text-center text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg py-1.5">
                {cat}
              </p>
              <div
                className="min-h-20 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-3 flex flex-wrap gap-2 content-start transition-colors"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-indigo-400", "bg-indigo-50"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50"); }}
                onDrop={(e) => { e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50"); handleDrop(e, cat); }}
              >
                {wordsInCat.map(opt => (
                  <div
                    key={opt.option_id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, opt.option_id)}
                    onClick={() => handleRemove(opt.option_id)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-full text-sm font-medium cursor-grab select-none shadow-sm hover:bg-red-500 transition"
                    title="Click to remove"
                  >
                    {opt.text} ×
                  </div>
                ))}
                {wordsInCat.length === 0 && (
                  <p className="text-xs text-slate-400 italic w-full text-center pt-2">Drop here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 text-center">
        Drag words into boxes • Click a placed word to remove it
      </p>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
   FREE TEXT QUESTION  (display-only — NO student input)
   ═══════════════════════════════════════════════════════════ */
function FreeTextQuestion() {
  return null;
}
function MatchingQuestion({ question, answer, onAnswer, textStyle }) {
  const rightItems = useMemo(() => {
    const items = (question.options || []).map((o) => o.match_text || o.match || o.right || "").filter(Boolean);
    const shuffled = [...items];
    let seed = 0;
    for (let i = 0; i < (question.question_id || "").length; i++) {
      seed = (seed * 31 + (question.question_id || "").charCodeAt(i)) & 0xffffffff;
    }
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [question.question_id, question.options]);

  const pairs = answer?.pairs || {};

  const handleSelect = (optionId, rightText) => {
    const updated = { ...pairs };
    if (updated[optionId] === rightText) delete updated[optionId];
    else updated[optionId] = rightText;
    onAnswer({ pairs: updated });
  };

  const usedRightItems = Object.values(pairs);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_32px_1fr] gap-2">
       <div className="text-base font-bold text-indigo-500 uppercase tracking-wide text-center pb-2 border-b border-indigo-100">Column A</div>
        <div />
        <div className="text-base font-bold text-emerald-500 uppercase tracking-wide text-center pb-2 border-b border-emerald-100">Column B</div>
      </div>
      {(question.options || []).map((opt) => {
        const selected = pairs[opt.option_id];
        return (
          <div key={opt.option_id} className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
            <div
              className="px-4 py-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-lg font-semibold text-center"
              style={textStyle}
            >
              {opt.text}
            </div>
            <div className="flex items-center justify-center">
              <svg className={`w-5 h-5 transition-colors ${selected ? "text-indigo-400" : "text-slate-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="relative">
              <select
                value={selected || ""}
                onChange={(e) => handleSelect(opt.option_id, e.target.value)}
                className={`w-full px-3 py-4 rounded-xl border-2 text-lg appearance-none outline-none transition-all cursor-pointer pr-8 ${
                  selected
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
                style={textStyle}
              >
                <option value="">— Select match —</option>
                {rightItems.map((item) => (
                  <option key={item} value={item} disabled={usedRightItems.includes(item) && selected !== item}>
                    {item}{usedRightItems.includes(item) && selected !== item ? " ✓" : ""}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-sm text-slate-400 text-right font-medium">
        {Object.keys(pairs).length}/{(question.options || []).length} matched
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

 
const savedStyle = buildTextStyle(question);



// DB saved styles are the base — student toolbar only overrides if they changed something
const textStyle = { ...savedStyle };
const optionsStyle = (
  question.text_style_scope === "options" ||
  question.text_style_scope === "all"
) ? { ...savedStyle } : {};


  return (
    <div className="space-y-4">

      {/* ── Question number + flag row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
        {question.type !== "free_text" && (
          <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
            {questionNumber}
          </span>
           )}  
          {question.points > 0 && (
            <span className="text-xs text-slate-400">
              {question.points} {question.points === 1 ? "pt" : "pts"}
            </span>
          )}
        </div>
        {question.type !== "free_text" && (
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
          )}
      </div>


      {/* ── Question text ── */}
      {/* ── Question text ── */}
{/* ── Question text ── */}
{question.display_style !== "punctuation_placement" && 
 question.display_style !== "word_click" &&(
  <div className="leading-relaxed text-lg" style={textStyle}>
    {question.text && question.text.includes("<") ? (
      <div
        dangerouslySetInnerHTML={{ __html: question.text }}
        className="prose prose-slate prose-sm max-w-none [&_img]:rounded-lg [&_img]:max-w-full [&_img]:cursor-zoom-in"
      />
    ) : question.text ? (
      <p>{question.text}</p>
    ) : null}
  </div>
)}
      {/* ── Question image ── */}
      {question.image_url && (
        <ImageWithLoader
          key={question.question_id}
          src={resolveImgSrc(question.image_url)}
          width={question.image_width}
          height={question.image_height}
          onClick={() => setZoomImg(resolveImgSrc(question.image_url))}
        />
      )}

      {/* ── Answer inputs — textStyle passed to every type ── */}
      {/* ── Answer inputs — textStyle passed to every type ── */}
      {question.type === "radio_button" && (
  question.display_style === "word_tap"
    ? <WordTapQuestion question={question} answer={answer} onAnswer={onAnswer} />
    : question.display_style === "punctuation_placement"
    ? <PunctuationPlacementQuestion question={question} answer={answer} onAnswer={onAnswer} />
    : question.display_style === "word_click"
    ? <WordClickQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={optionsStyle} />
    : <RadioQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={optionsStyle} />
)}
      
      {question.type === "picture_choice" && (
        <PictureChoiceQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={optionsStyle} />
      )}
      {question.type === "checkbox" && (
        <CheckboxQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={optionsStyle} />
      )}
      {question.type === "writing" && (
        <WritingQuestion
          question={question}
          answer={answer}
          onAnswer={onAnswer}
          yearLevel={yearLevel}
          subject={subject}
          onUploadingChange={onUploadingChange}
          textStyle={textStyle}
        />
      )}
      {question.type === "free_text" && <FreeTextQuestion />}
      {question.type === "short_answer" && (
        <ShortAnswerQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={textStyle} />
        
      )}
      {question.type === "matching" && (
  question.display_style === "category_drop"
    ? <CategoryDropQuestion question={question} answer={answer} onAnswer={onAnswer} />
    : question.display_style === "line_match"
    ? <LineMatchQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={optionsStyle} />
    : <MatchingQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={textStyle} />
)}
  

      {/* ── Image zoom modal ── */}
      {zoomImg && (
        <ImageModal src={zoomImg} alt="Question image" onClose={() => setZoomImg(null)} />
      )}
    </div>
  );
}