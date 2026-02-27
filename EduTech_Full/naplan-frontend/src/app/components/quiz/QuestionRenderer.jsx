/**
 * QuestionRenderer.jsx
 *
 * Renders a single question based on its type:
 *   - radio_button: Single-choice MCQ with text options
 *   - picture_choice: Single-choice MCQ with image options
 *   - free_text: Textarea for writing/essay questions
 *   - checkbox: Multi-select MCQ
 *
 * Place in: src/app/components/quiz/QuestionRenderer.jsx
 */

import { useState } from "react";

/* ═══════════════════════════════════════
   Image Zoom Modal
   ═══════════════════════════════════════ */
function ImageModal({ src, alt, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh]">
        <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Radio Button Question (single-choice MCQ)
   ═══════════════════════════════════════ */
function RadioQuestion({ question, answer, onAnswer }) {
  const selectedId = answer.selected?.[0] || null;

  return (
    <div className="space-y-3">
      {question.options.map((opt) => {
        const isSelected = selectedId === opt.option_id;
        return (
          <button
            key={opt.option_id}
            onClick={() => onAnswer({ selected: [opt.option_id] })}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? "border-indigo-500" : "border-slate-300"
                }`}
              >
                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
              </div>
              <span className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                {opt.text}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   Picture Choice Question (single-choice with images)
   ═══════════════════════════════════════ */
function PictureChoiceQuestion({ question, answer, onAnswer }) {
  const selectedId = answer.selected?.[0] || null;
  const [zoomImg, setZoomImg] = useState(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {question.options.map((opt) => {
          const isSelected = selectedId === opt.option_id;
          return (
            <button
              key={opt.option_id}
              onClick={() => onAnswer({ selected: [opt.option_id] })}
              className={`relative rounded-xl border-2 overflow-hidden transition-all duration-200 ${
                isSelected
                  ? "border-indigo-500 ring-2 ring-indigo-200 shadow-lg"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-md"
              }`}
            >
              {opt.image_url && (
                <div className="aspect-square bg-slate-50 p-3">
                  <img
                    src={opt.image_url}
                    alt={opt.text || "Option"}
                    className="w-full h-full object-contain cursor-zoom-in"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomImg(opt.image_url);
                    }}
                  />
                </div>
              )}
              <div
                className={`px-3 py-2.5 text-center border-t ${
                  isSelected ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-100"
                }`}
              >
                <span className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-slate-600"}`}>
                  {opt.text || "Option"}
                </span>
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {zoomImg && <ImageModal src={zoomImg} alt="Question image" onClose={() => setZoomImg(null)} />}
    </>
  );
}

/* ═══════════════════════════════════════
   Checkbox Question (multi-select MCQ)
   ═══════════════════════════════════════ */
function CheckboxQuestion({ question, answer, onAnswer }) {
  const selectedIds = new Set(answer.selected || []);

  const toggle = (optId) => {
    const next = new Set(selectedIds);
    if (next.has(optId)) next.delete(optId);
    else next.add(optId);
    onAnswer({ selected: Array.from(next) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Select all that apply</p>
      {question.options.map((opt) => {
        const isSelected = selectedIds.has(opt.option_id);
        return (
          <button
            key={opt.option_id}
            onClick={() => toggle(opt.option_id)}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 ${
              isSelected
                ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                {opt.text}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   Free Text / Writing Question
   ═══════════════════════════════════════ */
function FreeTextQuestion({ question, answer, onAnswer }) {
  const text = answer.text || "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => onAnswer({ text: e.target.value })}
        placeholder="Write your answer here..."
        rows={12}
        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm text-slate-800
                   placeholder-slate-400 resize-y min-h-[200px]
                   focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
      />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {wordCount} word{wordCount !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Auto-saved
        </span>
      </div>
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
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold">
          {questionNumber}
        </span>
        <button
          onClick={onToggleFlag}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
            />
          </svg>
          {isFlagged ? "Flagged" : "Flag"}
        </button>
      </div>

      {/* Question text */}
      <div className="text-base text-slate-800 leading-relaxed font-medium">
        {/* Render HTML content (for questions with inline images) */}
        {question.text.includes("<") ? (
          <div
            dangerouslySetInnerHTML={{ __html: question.text }}
            className="prose prose-slate prose-sm max-w-none [&_img]:rounded-lg [&_img]:max-w-full [&_img]:cursor-zoom-in"
          />
        ) : (
          <p>{question.text}</p>
        )}
      </div>

      {/* Question image (if separate from text) */}
      {question.image_url && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <img
            src={question.image_url}
            alt="Question image"
            className="max-w-full max-h-80 object-contain mx-auto rounded-lg cursor-zoom-in"
            onClick={() => setZoomImg(question.image_url)}
          />
        </div>
      )}

      {/* Category tag */}
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
