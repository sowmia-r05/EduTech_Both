/**
 * InteractiveQuestionTypes.jsx
 *
 * Three new fun question types for Year 3 Grammar & Punctuation:
 *
 *   1. WordTapQuestion    — type: "word_tap"
 *      Click any word in a sentence (e.g. "which word needs a capital?")
 *      question_text stores the sentence; correct_answer is the target word (lowercase)
 *
 *   2. WordClickQuestion  — type: "word_click"
 *      Click one of the pre-highlighted words.
 *      Highlighted words are wrapped in [brackets] in question_text.
 *      correct_answer is the target word (lowercase, no brackets)
 *
 *   3. LineMatchQuestion  — type: "line_match"
 *      Visual drag-line matching. Uses same option/match pairs as existing "matching" type.
 *      option.text = left word, option.match = right label
 *      Stores answer as { pairs: { leftWord: rightLabel, ... } }
 *
 * HOW TO ADD TO QuestionRenderer.jsx:
 *   1. Import these three components at the top of QuestionRenderer.jsx
 *   2. Add three cases in the type-dispatch block (see bottom of this file)
 *   3. Add the three types to QuizUploader.jsx validTypes array
 *   4. Add them to the type dropdown in QuizDetailPage.jsx & ManualQuizCreator.jsx
 */

import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   SHARED HELPER — animated feedback banner
   ═══════════════════════════════════════════════════════════════ */
function FeedbackBanner({ correct, message }) {
  if (!message) return null;
  return (
    <div
      className={`mt-4 flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all
        ${correct
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-red-50 border-red-200 text-red-800"
        }`}
    >
      <span className="text-base mt-0.5">{correct ? "✓" : "✗"}</span>
      <span>{message}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   1. WORD TAP QUESTION
   Click any word in the sentence — no pre-highlighting.
   
   question_text format:
     "Click the word that needs a capital letter.
      There are towns in south Australia that are famous for opals."
   
   correct_answer: "south"   (lowercase, no punctuation)
   
   onAnswer shape: { selected: ["south"] }
   ═══════════════════════════════════════════════════════════════ */
export function WordTapQuestion({ question, answer, onAnswer, textStyle }) {
  const selected = answer?.selected?.[0] || null;

  // Parse the sentence — the question_text contains the instruction + sentence.
  // Convention: the sentence to click is in question.options[0].text OR
  // we fall back to parsing everything after the first newline / period in question_text.
  // Simplest: store sentence separately in question.options[0].text
  // If no options provided, use question_text directly as the sentence.
  const sentence =
    question.options?.length > 0
      ? question.options[0].text
      : question.text || question.question_text || "";

  // Split into tokens (word + trailing punctuation)
  const tokens = sentence.split(/(\s+)/).filter(Boolean);

  const cleanWord = (t) => t.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase();

  return (
    <div>
      <div
        className="bg-slate-50 border border-slate-200 rounded-2xl p-5 leading-loose"
        style={textStyle}
      >
        {tokens.map((token, i) => {
          // whitespace — render as-is
          if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

          const clean = cleanWord(token);
          const isSelected = clean === selected;

          return (
            <button
              key={i}
              onClick={() => onAnswer({ selected: [clean] })}
              className={`inline-flex items-center px-2.5 py-1 mx-0.5 rounded-lg border transition-all text-base
                ${isSelected
                  ? "bg-indigo-600 text-white border-indigo-600 scale-105 shadow-sm"
                  : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                }`}
              style={textStyle}
            >
              {token}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="mt-3 text-xs text-slate-400">
          Selected: <span className="font-medium text-indigo-600">"{selected}"</span>
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   2. WORD CLICK QUESTION
   Click one of the pre-highlighted words in the sentence.
   
   question_text format (wrap clickable words in [brackets]):
     "Which highlighted word should have a full stop after it?
      The part of the [tooth] we can [see] is called the [crown] The part [inside] the gum is called the root."
   
   correct_answer: "crown"   (lowercase)
   
   onAnswer shape: { selected: ["crown"] }
   ═══════════════════════════════════════════════════════════════ */
export function WordClickQuestion({ question, answer, onAnswer, textStyle }) {
  const selected = answer?.selected?.[0] || null;

  const rawText = question.text || question.question_text || "";

  // Split on [word] markers — produces alternating plain/bracketed segments
  const parts = rawText.split(/(\[[^\]]+\])/);

  return (
    <div>
      <div
        className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-base leading-loose"
        style={textStyle}
      >
        {parts.map((part, i) => {
          const match = part.match(/^\[(.+)\]$/);
          if (!match) {
            // Plain text — render as-is
            return <span key={i} style={textStyle}>{part}</span>;
          }
          const word = match[1];
          const isSelected = word.toLowerCase() === selected;

          return (
            <button
              key={i}
              onClick={() => onAnswer({ selected: [word.toLowerCase()] })}
              className={`inline-flex items-center px-2.5 py-0.5 mx-0.5 rounded-lg border-2 font-medium transition-all
                ${isSelected
                  ? "bg-indigo-600 text-white border-indigo-600 scale-105"
                  : "bg-blue-50 text-blue-800 border-blue-200 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              style={textStyle}
            >
              {word}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="mt-3 text-xs text-slate-400">
          Selected: <span className="font-medium text-indigo-600">"{selected}"</span>
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3. LINE MATCH QUESTION
   Visual interactive line-drawing matcher.
   
   Uses the existing "matching" data shape:
     question.options = [
       { option_id, text: "quickly",   match: "adverb"    },
       { option_id, text: "drew",      match: "verb"      },
       { option_id, text: "beautiful", match: "adjective" },
     ]
   
   Right-column items are auto-shuffled for the student.
   
   onAnswer shape: { pairs: { "quickly": "adverb", "drew": "verb", ... } }
   ═══════════════════════════════════════════════════════════════ */
export function LineMatchQuestion({ question, answer, onAnswer, textStyle }) {
  const options = question.options || [];

  // Shuffle right-column items once per mount
  const [rightItems] = useState(() => {
    const rights = options.map((o) => o.match).filter(Boolean);
    // Fisher-Yates shuffle
    for (let i = rights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rights[i], rights[j]] = [rights[j], rights[i]];
    }
    return rights;
  });

  const pairs = answer?.pairs || {};
  const [selectedLeft, setSelectedLeft] = useState(null);

  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const svgRef = useRef(null);

  // Map option text → DOM id for SVG line anchoring
  const leftId = (text) => `lm-left-${text.replace(/\s+/g, "-")}`;
  const rightId = (text) => `lm-right-${text.replace(/\s+/g, "-")}`;

  // Draw SVG lines after every render
  const drawLines = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = "";

    const svgRect = svg.getBoundingClientRect();
    const lineColors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"];
    let ci = 0;

    Object.entries(pairs).forEach(([left, right]) => {
      const leftEl = document.getElementById(leftId(left));
      const rightEl = document.getElementById(rightId(right));
      if (!leftEl || !rightEl) return;

      const lr = leftEl.getBoundingClientRect();
      const rr = rightEl.getBoundingClientRect();

      const x1 = lr.right - svgRect.left;
      const y1 = lr.top + lr.height / 2 - svgRect.top;
      const x2 = rr.left - svgRect.left;
      const y2 = rr.top + rr.height / 2 - svgRect.top;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", lineColors[ci % lineColors.length]);
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
      ci++;
    });
  }, [pairs]);

  useEffect(() => {
    drawLines();
  }, [drawLines]);

  const handleSelectLeft = (text) => {
    if (pairs[text]) return; // already matched
    setSelectedLeft(text === selectedLeft ? null : text);
  };

  const handleSelectRight = (right) => {
    if (!selectedLeft) return;
    // If this right item is already used, un-use it
    const newPairs = { ...pairs };
    // Remove any existing pair using this right item
    Object.keys(newPairs).forEach((k) => {
      if (newPairs[k] === right) delete newPairs[k];
    });
    newPairs[selectedLeft] = right;
    setSelectedLeft(null);
    onAnswer({ pairs: newPairs });
  };

  const removePair = (left) => {
    const newPairs = { ...pairs };
    delete newPairs[left];
    onAnswer({ pairs: newPairs });
  };

  const matchedCount = Object.keys(pairs).length;

  return (
    <div>
      {selectedLeft && (
        <p className="mb-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
          Now click a word on the right to match with <strong>"{selectedLeft}"</strong>
        </p>
      )}

      <div className="relative" style={{ minHeight: `${options.length * 60 + 20}px` }}>
        {/* SVG overlay for lines */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        />

        <div className="flex items-start gap-4" style={{ position: "relative", zIndex: 2 }}>
          {/* Left column */}
          <div className="flex flex-col gap-3 flex-1">
            {options.map((opt) => {
              const isMatched = !!pairs[opt.text];
              const isSel = selectedLeft === opt.text;
              return (
                <button
                  key={opt.option_id || opt.text}
                  id={leftId(opt.text)}
                  onClick={() => isMatched ? removePair(opt.text) : handleSelectLeft(opt.text)}
                  className={`px-4 py-2.5 rounded-2xl text-sm font-medium text-center transition-all
                    ${isMatched
                      ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700"
                      : isSel
                        ? "bg-indigo-600 text-white scale-105 shadow-sm"
                        : "bg-slate-700 text-white hover:bg-slate-600"
                    }`}
                  style={textStyle}
                  title={isMatched ? "Click to remove match" : ""}
                >
                  {opt.text}
                  {isMatched && <span className="ml-1.5 text-emerald-200 text-xs">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Spacer for lines */}
          <div style={{ width: 80, flexShrink: 0 }} />

          {/* Right column */}
          <div className="flex flex-col gap-3 flex-1">
            {rightItems.map((right) => {
              const isMatched = Object.values(pairs).includes(right);
              return (
                <button
                  key={right}
                  id={rightId(right)}
                  onClick={() => !isMatched && handleSelectRight(right)}
                  className={`px-4 py-2.5 rounded-2xl text-sm font-medium text-center transition-all
                    ${isMatched
                      ? "bg-emerald-600 text-white cursor-default"
                      : selectedLeft
                        ? "bg-violet-600 text-white hover:bg-violet-700 hover:scale-105"
                        : "bg-violet-700 text-white hover:bg-violet-600"
                    }`}
                  style={textStyle}
                  disabled={isMatched}
                >
                  {right}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400 text-right">
        {matchedCount}/{options.length} matched
        {matchedCount > 0 && (
          <button
            onClick={() => onAnswer({ pairs: {} })}
            className="ml-3 text-slate-400 hover:text-slate-600 underline"
          >
            Reset
          </button>
        )}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOW TO WIRE INTO QuestionRenderer.jsx
   ═══════════════════════════════════════════════════════════════

   STEP 1 — Add import at top of QuestionRenderer.jsx:

     import {
       WordTapQuestion,
       WordClickQuestion,
       LineMatchQuestion,
     } from "./InteractiveQuestionTypes";

   STEP 2 — Find the type-dispatch block in the main QuestionRenderer
   component (the section with <RadioQuestion />, <CheckboxQuestion />, etc.)
   and add these three cases:

     {question.type === "word_tap" && (
       <WordTapQuestion
         question={question}
         answer={answer}
         onAnswer={onAnswer}
         textStyle={textStyle}
       />
     )}

     {question.type === "word_click" && (
       <WordClickQuestion
         question={question}
         answer={answer}
         onAnswer={onAnswer}
         textStyle={textStyle}
       />
     )}

     {question.type === "line_match" && (
       <LineMatchQuestion
         question={question}
         answer={answer}
         onAnswer={onAnswer}
         textStyle={textStyle}
       />
     )}

   STEP 3 — In QuizUploader.jsx, update validTypes:

     const validTypes = [
       "radio_button", "picture_choice", "free_text",
       "checkbox", "writing", "short_answer", "matching",
       "word_tap",    // NEW
       "word_click",  // NEW
       "line_match",  // NEW
     ];

   STEP 4 — In QuizDetailPage.jsx type dropdown, add:

     <option value="word_tap">Word Tap (click a word)</option>
     <option value="word_click">Word Click (pre-highlighted)</option>
     <option value="line_match">Line Match (draw lines)</option>

   STEP 5 — In ManualQuizCreator.jsx AddQuestionForm type dropdown,
   add the same three options as Step 4.

   STEP 6 — In TypeBadge (QuizDetailPage.jsx), add styles:

     word_tap:   "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
     word_click: "bg-blue-500/10 text-blue-400 border-blue-500/20",
     line_match: "bg-amber-500/10 text-amber-400 border-amber-500/20",

   And labels:

     word_tap:   "Word Tap",
     word_click: "Word Click",
     line_match: "Line Match",

   ═══════════════════════════════════════════════════════════════
   EXCEL TEMPLATE COLUMNS
   ═══════════════════════════════════════════════════════════════

   word_tap:
     question_text  = instruction line (e.g. "Click the word that should start with a capital letter.")
     type           = word_tap
     option_a       = the full sentence to display (e.g. "There are towns in south Australia...")
     correct_answer = the target word in lowercase (e.g. "south")

   word_click:
     question_text  = instruction + sentence with [brackets] around clickable words
                      (e.g. "Which word needs a full stop? The [tooth] we can [see] is the [crown] The rest...")
     type           = word_click
     correct_answer = target word in lowercase (e.g. "crown")

   line_match:
     question_text  = instruction (e.g. "Match each word to its word type.")
     type           = line_match
     option_a       = left word  (e.g. "quickly")
     match_a        = right pair (e.g. "adverb")
     option_b       = left word  (e.g. "drew")
     match_b        = right pair (e.g. "verb")
     option_c       = left word  (e.g. "beautiful")
     match_c        = right pair (e.g. "adjective")

   ═══════════════════════════════════════════════════════════════ */