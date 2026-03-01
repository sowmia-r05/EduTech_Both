/**
 * QuestionRenderer.jsx
 *
 * Student-facing question display + answer input.
 * Renders different UIs based on question.type:
 *   - radio_button: Single choice MCQ
 *   - checkbox: Multiple choice
 *   - picture_choice: Image-based options
 *   - free_text: Large writing/textarea box
 *
 * Place in: src/app/components/quiz/QuestionRenderer.jsx
 */

import { useState } from "react";

/* ── Image Zoom Modal ── */
function ImageModal({ src, alt, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">✕</button>
    </div>
  );
}

/* ═══════════════════════════════════════
   RADIO BUTTON (Single Choice MCQ)
   ═══════════════════════════════════════ */
function RadioQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected || [];
  return (
    <div className="space-y-2.5">
      {(question.options || []).map((opt) => {
        const isSelected = selected.includes(opt.option_id);
        return (
          <button
            key={opt.option_id}
            onClick={() => onAnswer({ selected: [opt.option_id] })}
            className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition ${
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
              }`}>
                {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              <div className="flex-1">
                <span className={`text-sm ${isSelected ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{opt.text}</span>
                {opt.image_url && (
                  <img src={opt.image_url} alt={opt.text} className="mt-2 max-w-[200px] max-h-32 rounded-lg object-contain" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   CHECKBOX (Multiple Choice)
   ═══════════════════════════════════════ */
function CheckboxQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected || [];
  const toggle = (optId) => {
    const newSelected = selected.includes(optId)
      ? selected.filter((id) => id !== optId)
      : [...selected, optId];
    onAnswer({ selected: newSelected });
  };
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400 mb-1">Select all that apply</p>
      {(question.options || []).map((opt) => {
        const isSelected = selected.includes(opt.option_id);
        return (
          <button
            key={opt.option_id}
            onClick={() => toggle(opt.option_id)}
            className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition ${
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
              }`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <span className={`text-sm ${isSelected ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{opt.text}</span>
                {opt.image_url && (
                  <img src={opt.image_url} alt={opt.text} className="mt-2 max-w-[200px] max-h-32 rounded-lg object-contain" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   PICTURE CHOICE
   ═══════════════════════════════════════ */
function PictureChoiceQuestion({ question, answer, onAnswer }) {
  const selected = answer?.selected || [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {(question.options || []).map((opt) => {
        const isSelected = selected.includes(opt.option_id);
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
            <div className={`px-3 py-2 text-sm text-center ${
              isSelected ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600"
            }`}>
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
   FREE TEXT / WRITING
   Large textarea for student to write answer
   ═══════════════════════════════════════ */
function FreeTextQuestion({ question, answer, onAnswer }) {
  const text = answer?.text || "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="space-y-3">
      <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <textarea
          value={text}
          onChange={(e) => onAnswer({ text: e.target.value })}
          placeholder="Write your answer here..."
          rows={12}
          className="w-full px-5 py-4 text-base text-slate-800 leading-relaxed resize-y outline-none min-h-[200px] placeholder:text-slate-400"
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
        />
        {/* Word / Character count bar */}
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
        ✏️ Write your response in the box above. Your answer is saved automatically.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN: QuestionRenderer
   ═══════════════════════════════════════ */
export default function QuestionRenderer({ question, questionNumber, answer, isFlagged, onAnswer, onToggleFlag }) {
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
            <span className="text-xs text-slate-400">{question.points} {question.points === 1 ? "pt" : "pts"}</span>
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
            src={question.image_url}
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

      {/* Category tags */}
      {question.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {question.categories.map((cat) => (
            <span key={cat.category_id || cat.name} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-md">
              {cat.name}
            </span>
          ))}
        </div>
      )}

      {/* Answer area — renders based on question type */}
      {question.type === "radio_button" && <RadioQuestion question={question} answer={answer} onAnswer={onAnswer} />}
      {question.type === "picture_choice" && <PictureChoiceQuestion question={question} answer={answer} onAnswer={onAnswer} />}
      {question.type === "checkbox" && <CheckboxQuestion question={question} answer={answer} onAnswer={onAnswer} />}
      {question.type === "free_text" && <FreeTextQuestion question={question} answer={answer} onAnswer={onAnswer} />}

      {zoomImg && <ImageModal src={zoomImg} alt="Question image" onClose={() => setZoomImg(null)} />}
    </div>
  );
}