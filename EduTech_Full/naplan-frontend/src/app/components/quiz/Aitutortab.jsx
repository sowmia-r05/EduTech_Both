/**
 * AITutorTab.jsx  (v6 — Standard Design System)
 * Uses Tailwind CSS + SVG icons matching the rest of the app
 */

import { useState, useEffect } from "react";

function isYoung(yearLevel) { return Number(yearLevel) <= 5; }

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function getChildAnswer(card) { return card.child_answer || card.child_answer_text || "No answer given"; }

function getCorrectAnswer(card) {
  if (card.type === "short_answer" && card.correct_answer) return card.correct_answer;
  if (Array.isArray(card.correct_answers) && card.correct_answers.length > 0) return card.correct_answers.join(", ");
  return card.correct_answer || card.correct_answer_text || "—";
}

function getIsCorrect(card) {
  if (card.is_correct === true) return true;
  if (card.is_correct === false) return false;
  if ((card.points_earned || 0) > 0) return true;
  if ((card.points_scored || 0) > 0) return true;
  return false;
}

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const XIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const CircleIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);
const BulbIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);
const BookIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

function QuestionImage({ card }) {
  const [failed, setFailed] = useState(false);
  const src = card.image_url || card.question_image || card.imageUrl || card.image || null;
  if (!src || failed) return null;
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
      <img src={src} alt="" className="w-full max-h-48 object-contain block" onError={() => setFailed(true)} />
    </div>
  );
}

function ChatHint() {
  return (
    <button
      onClick={() => window.__openQuizChat?.()}
      className="mt-3 w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-indigo-700">Still confused? Ask your AI tutor</p>
        <p className="text-xs text-indigo-500 mt-0.5">Tap the button at the bottom-right corner</p>
      </div>
      <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function QuestionCard({ card, questionNum, explanation, yearLevel }) {
  const [expanded, setExpanded] = useState(false);
  const isCorrect = getIsCorrect(card);

  if (card.type === "free_text") {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-blue-600"><BookIcon /></span>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">Reading Passage</span>
        </div>
        {card.question_text && <p className="text-sm text-slate-700 leading-relaxed">{stripHtml(card.question_text)}</p>}
        <QuestionImage card={card} />
      </div>
    );
  }

  const childAnswer   = getChildAnswer(card);
  const correctAnswer = getCorrectAnswer(card);
  const options       = card.options || [];

  return (
    <div className={`rounded-xl border overflow-hidden ${isCorrect ? "border-emerald-200" : "border-red-200"}`}>

      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          isCorrect ? "bg-emerald-50 hover:bg-emerald-100" : "bg-red-50 hover:bg-red-100"
        }`}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
          isCorrect ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {isCorrect ? <CheckIcon /> : <XIcon />}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mr-2">Q{questionNum}</span>
          <span className="text-sm text-slate-700">
            {stripHtml(card.question_text).substring(0, 65)}{stripHtml(card.question_text).length > 65 ? "…" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}>
            {isCorrect ? "Correct" : "Incorrect"}
          </span>
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 py-4 space-y-4 bg-white border-t border-slate-100">
          <p className="text-sm font-medium text-slate-800 leading-relaxed">
            {stripHtml(card.question_text)}
          </p>
          <QuestionImage card={card} />

          {options.length > 0 ? (
            <div className="space-y-2">
              {options.map((opt, i) => {
                const optText      = typeof opt === "string" ? opt : (opt.text || opt.label || "");
                const isChildPick  = childAnswer === optText || (Array.isArray(card.child_option_ids) && card.child_option_ids.includes(opt.option_id));
                const isCorrectOpt = correctAnswer.includes(optText) || (Array.isArray(card.correct_answer_ids) && card.correct_answer_ids.includes(opt.option_id));
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm ${
                    isCorrectOpt ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-medium"
                    : isChildPick ? "bg-red-50 border-red-200 text-red-800 font-medium"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}>
                    <span className={`flex-shrink-0 ${isCorrectOpt ? "text-emerald-600" : isChildPick ? "text-red-500" : "text-slate-400"}`}>
                      {isCorrectOpt ? <CheckIcon /> : isChildPick ? <XIcon /> : <CircleIcon />}
                    </span>
                    <span className="flex-1">{optText}</span>
                    {isChildPick && isCorrectOpt  && <span className="text-xs font-bold text-emerald-600 flex-shrink-0">Your answer ✓</span>}
                    {isChildPick && !isCorrectOpt && <span className="text-xs font-bold text-red-500 flex-shrink-0">Your answer</span>}
                    {!isChildPick && isCorrectOpt && <span className="text-xs font-bold text-emerald-600 flex-shrink-0">Correct answer</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className={`px-3 py-2.5 rounded-lg border text-sm ${
                isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
              }`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Your answer</p>
                {childAnswer}
              </div>
              {!isCorrect && (
                <div className="px-3 py-2.5 rounded-lg border bg-emerald-50 border-emerald-200 text-sm text-emerald-800">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Correct answer</p>
                  {correctAnswer}
                </div>
              )}
            </div>
          )}

          {explanation && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-indigo-600"><BulbIcon /></span>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Explanation</span>
              </div>
              <p className="text-sm text-indigo-900 leading-relaxed">{explanation.explanation}</p>
              {explanation.tip && (
                <div className="mt-3 pt-3 border-t border-indigo-200">
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    <span className="font-bold">Strategy: </span>{explanation.tip}
                  </p>
                </div>
              )}
            </div>
          )}

          {!isCorrect && <ChatHint />}
        </div>
      )}
    </div>
  );
}

export default function AITutorTab({ attemptId, yearLevel, apiFetch }) {
  const [flashcards,     setFlashcards]     = useState([]);
  const [loadingCards,   setLoadingCards]   = useState(true);
  const [error,          setError]          = useState(null);
  const [filter,         setFilter]         = useState("all");
  const [activeQuestion, setActiveQuestion] = useState(null);

  useEffect(() => {
    if (!attemptId) return;
    setLoadingCards(true);
    apiFetch(`/api/attempts/${attemptId}/flashcards`)
      .then(res => res.json())
      .then(data => { setFlashcards(data.flashcards || data || []); setLoadingCards(false); })
      .catch(() => { setError("Failed to load questions."); setLoadingCards(false); });
  }, [attemptId, apiFetch]);

  if (loadingCards) {
    return (
      <div className="flex items-center justify-center gap-3 py-12">
        <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
        <span className="text-sm text-slate-500">Loading questions...</span>
      </div>
    );
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-slate-500">{error}</div>;
  }

  const allQuestions = flashcards.filter(c => c.type !== "free_text");
  const totalCorrect = allQuestions.filter(getIsCorrect).length;
  const totalWrong   = allQuestions.length - totalCorrect;
  const accuracy     = allQuestions.length > 0 ? Math.round((totalCorrect / allQuestions.length) * 100) : 0;

  let qCounter = 0;
  const questionNumMap = {};
  flashcards.forEach(c => {
    if (c.type !== "free_text") {
      qCounter++;
      questionNumMap[c.question_id || qCounter] = qCounter;
    }
  });

  const filteredCards = filter === "wrong"
    ? flashcards.filter(c => c.type === "free_text" || !getIsCorrect(c))
    : filter === "correct"
    ? flashcards.filter(c => c.type === "free_text" || getIsCorrect(c))
    : flashcards;

  const finalCards = activeQuestion !== null
    ? (() => {
        let num = 0;
        return flashcards.filter(c => {
          if (c.type === "free_text") return false;
          num++;
          return num === activeQuestion;
        });
      })()
    : filteredCards;

  let questionNum = 0;

  return (
    <div className="px-4 py-5 space-y-4 max-w-2xl mx-auto pb-10">

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total",     value: allQuestions.length, cls: "bg-indigo-50 border border-indigo-100",   val: "text-indigo-700" },
          { label: "Correct",   value: totalCorrect,        cls: "bg-emerald-50 border border-emerald-100", val: "text-emerald-700" },
          { label: "Incorrect", value: totalWrong,          cls: "bg-red-50 border border-red-100",         val: "text-red-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls}`}>
            <p className={`text-2xl font-bold ${s.val}`}>{s.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Accuracy bar */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600 flex-shrink-0">Accuracy</span>
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              accuracy >= 70 ? "bg-emerald-500" : accuracy >= 40 ? "bg-amber-400" : "bg-red-500"
            }`}
            style={{ width: `${accuracy}%` }}
          />
        </div>
        <span className={`text-sm font-bold flex-shrink-0 ${
          accuracy >= 70 ? "text-emerald-600" : accuracy >= 40 ? "text-amber-500" : "text-red-600"
        }`}>{accuracy}%</span>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all",     label: `All (${allQuestions.length})` },
          { key: "wrong",   label: `Incorrect (${totalWrong})` },
          { key: "correct", label: `Correct (${totalCorrect})` },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setActiveQuestion(null); }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === f.key
                ? f.key === "wrong"   ? "bg-red-100 border-red-200 text-red-700"
                : f.key === "correct" ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                :                       "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Number chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setActiveQuestion(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all ${
            activeQuestion === null ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}>All</button>
        {allQuestions.map((q, idx) => {
          const qNum = idx + 1;
          const correct = getIsCorrect(q);
          const isActive = activeQuestion === qNum;
          return (
            <button key={qNum} onClick={() => setActiveQuestion(isActive ? null : qNum)}
              className={`w-8 h-8 rounded-lg text-xs font-bold flex-shrink-0 transition-all ${
                isActive ? "bg-indigo-600 text-white"
                : correct ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                :           "bg-red-100 text-red-700 hover:bg-red-200"
              }`}>{qNum}</button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">Tap any question to expand and see your answer + explanation.</p>

      {/* Question Cards */}
      <div className="space-y-2">
        {finalCards.map((card, i) => {
          if (card.type !== "free_text") questionNum++;
          const realNum = questionNumMap[card.question_id] || questionNum;
          return (
            <QuestionCard
              key={card.question_id || i}
              card={card}
              questionNum={realNum}
              explanation={
                (card.explanation || card.tip)
                  ? { explanation: card.explanation || "", tip: card.tip || "" }
                  : null
              }
              yearLevel={yearLevel}
            />
          );
        })}
      </div>
    </div>
  );
}