/**
 * matching.jsx
 *
 * Two reusable components for "Match the Following" question type:
 *
 *  1. MatchingQuestion     — Student-facing quiz renderer
 *  2. MatchingPairsEditor  — Admin question creation / editing
 *
 * Both can be imported into their respective files or used inline.
 *
 * Data model:
 *   option shape: { option_id: string, text: string, match: string, correct: true }
 *
 *   Student answer shape: { pairs: { [option_id]: "selected right text" } }
 *
 * Usage in QuestionRenderer.jsx:
 *   import { MatchingQuestion } from "./matching";
 *   {question.type === "matching" && (
 *     <MatchingQuestion question={question} answer={answer} onAnswer={onAnswer} textStyle={textStyle} />
 *   )}
 *
 * Usage in admin forms:
 *   import { MatchingPairsEditor } from "./matching";
 *   {q.type === "matching" && (
 *     <MatchingPairsEditor
 *       pairs={q.options}
 *       onChange={(pairs) => setQ((prev) => ({ ...prev, options: pairs }))}
 *     />
 *   )}
 */

import { useMemo } from "react";

/* ═══════════════════════════════════════════════════════════
   MATCHING QUESTION  (student-facing)
   ═══════════════════════════════════════════════════════════ */
export function MatchingQuestion({ question, answer, onAnswer, textStyle }) {
  // Stable shuffle using question_id as seed
  const rightItems = useMemo(() => {
    const items = (question.options || []).map((o) => o.match || "").filter(Boolean);
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
    const current = pairs[optionId];
    const updated = { ...pairs };
    if (current === rightText) {
      delete updated[optionId];
    } else {
      updated[optionId] = rightText;
    }
    onAnswer({ pairs: updated });
  };

  const usedRightItems = Object.entries(pairs).map(([, v]) => v);

  return (
    <div className="space-y-4">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
        <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wide text-center pb-1 border-b border-indigo-100">
          Column A
        </div>
        <div />
        <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wide text-center pb-1 border-b border-emerald-100">
          Column B
        </div>
      </div>

      {/* Pair rows */}
      {(question.options || []).map((opt) => {
        const selected = pairs[opt.option_id];
        return (
          <div key={opt.option_id} className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
            {/* Left item */}
            <div
              className="px-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-sm font-medium text-center select-none"
              style={textStyle}
            >
              {opt.text}
            </div>

            {/* Connector arrow */}
            <div className="flex items-center justify-center">
              <svg
                className={`w-5 h-5 transition-colors ${selected ? "text-indigo-400" : "text-slate-300"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Right side dropdown */}
            <div className="relative">
              <select
                value={selected || ""}
                onChange={(e) => handleSelect(opt.option_id, e.target.value)}
                className={`w-full px-3 py-3 rounded-xl border-2 text-sm appearance-none outline-none transition-all cursor-pointer pr-8
                  ${selected
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                style={textStyle}
              >
                <option value="">— Select match —</option>
                {rightItems.map((item) => (
                  <option
                    key={item}
                    value={item}
                    disabled={usedRightItems.includes(item) && selected !== item}
                  >
                    {item}
                    {usedRightItems.includes(item) && selected !== item ? " ✓" : ""}
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

      {/* Progress */}
      <p className="text-xs text-slate-400 text-right">
        {Object.keys(pairs).length}/{(question.options || []).length} matched
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MATCHING PAIRS EDITOR  (admin-facing)
   ═══════════════════════════════════════════════════════════ */
export function MatchingPairsEditor({ pairs, onChange }) {
  const makePair = () => ({
    option_id: `pair_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    match: "",
    correct: true,
  });

  const addPair = () => {
    if (pairs.length >= 8) return;
    onChange([...pairs, makePair()]);
  };

  const removePair = (idx) => {
    if (pairs.length <= 2) return;
    onChange(pairs.filter((_, i) => i !== idx));
  };

  const updatePair = (idx, field, value) => {
    const next = [...pairs];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_1fr_28px] gap-2">
        <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wide px-1">
          Column A (Left)
        </div>
        <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide px-1">
          Column B (Right / Correct Match)
        </div>
        <div />
      </div>

      {/* Pair rows */}
      {pairs.map((pair, idx) => (
        <div key={pair.option_id || idx} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
          <input
            type="text"
            value={pair.text || ""}
            onChange={(e) => updatePair(idx, "text", e.target.value)}
            placeholder={`Left item ${idx + 1}`}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
          />
          <input
            type="text"
            value={pair.match || ""}
            onChange={(e) => updatePair(idx, "match", e.target.value)}
            placeholder={`Right item ${idx + 1}`}
            className="w-full bg-slate-900 border border-emerald-600/50 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => removePair(idx)}
            disabled={pairs.length <= 2}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Remove pair"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add pair */}
      <button
        type="button"
        onClick={addPair}
        disabled={pairs.length >= 8}
        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
      >
        + Add pair {pairs.length >= 8 ? "(max 8)" : ""}
      </button>

      <p className="text-[10px] text-slate-500 italic">
        Each left item is matched to its right item. Right items are shuffled for the student.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS — paste these into each file that needs them
   ═══════════════════════════════════════════════════════════ */

/**
 * Returns the default blank pairs array when switching to "matching" type.
 */
export function defaultMatchingOptions() {
  return [
    { option_id: `pair_${Date.now()}_1`, text: "", match: "", correct: true },
    { option_id: `pair_${Date.now()}_2`, text: "", match: "", correct: true },
  ];
}

/**
 * TypeBadge additions — merge into the existing styles/labels objects:
 *
 * styles:  matching: "bg-teal-500/10 text-teal-400 border-teal-500/20"
 * labels:  matching: "Match Following"
 */

/**
 * QuizUploader validTypes addition:
 * Add "matching" to the validTypes array.
 */