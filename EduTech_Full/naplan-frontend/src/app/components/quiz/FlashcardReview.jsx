/**
 * FlashcardReview.jsx
 *
 * ═══════════════════════════════════════════════════════════════
 * Study card component that displays wrong answers from completed
 * quiz attempts. Shows the question, child's wrong answer, and
 * the correct answer — with a flip animation.
 *
 * Works with the new /api/children/:childId/flashcards endpoint.
 * ═══════════════════════════════════════════════════════════════
 *
 * Place in: src/app/components/quiz/FlashcardReview.jsx
 *
 * Usage in ChildDashboard.jsx:
 *   import FlashcardReview from "../quiz/FlashcardReview";
 *   <FlashcardReview childId={childId} token={activeToken} />
 */

import { useState, useEffect, useCallback } from "react";
import { fetchChildFlashcards } from "@/app/utils/api-children";

export default function FlashcardReview({ childId, token, subject = null, limit = 10 }) {
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState(null);

  const loadFlashcards = useCallback(async () => {
    if (!childId || !token) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchChildFlashcards(token, childId, { subject, limit });
      setFlashcards(data.flashcards || []);
      setCurrentIdx(0);
      setFlipped(false);
      setError(null);
    } catch (err) {
      console.error("Failed to load flashcards:", err);
      setError(err.message);
      setFlashcards([]);
    } finally {
      setLoading(false);
    }
  }, [childId, token, subject, limit]);

  useEffect(() => { loadFlashcards(); }, [loadFlashcards]);

  const card = flashcards[currentIdx];

  const handleNext = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev + 1) % flashcards.length);
    }, 150);
  };

  const handlePrev = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }, 150);
  };

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📝</span>
          <h3 className="text-sm font-semibold text-slate-700">Review Mistakes</h3>
        </div>
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ─── No Flashcards State ───
  if (flashcards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📝</span>
          <h3 className="text-sm font-semibold text-slate-700">Review Mistakes</h3>
        </div>
        <div className="text-center py-6">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-sm text-slate-500">
            {error ? "Could not load flashcards." : "No mistakes to review! Complete some quizzes first."}
          </p>
        </div>
      </div>
    );
  }

  // ─── Flashcard UI ───
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <h3 className="text-sm font-semibold text-slate-700">Review Mistakes</h3>
        </div>
        <span className="text-xs text-slate-400">
          {currentIdx + 1} / {flashcards.length}
        </span>
      </div>

      {/* Card */}
      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative cursor-pointer min-h-[160px] rounded-lg border-2 border-dashed transition-all duration-300 p-5"
        style={{
          borderColor: flipped ? "#10b981" : "#6366f1",
          backgroundColor: flipped ? "#f0fdf4" : "#eef2ff",
        }}
      >
        {!flipped ? (
          /* ─── FRONT: Question + Wrong Answer ─── */
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Question — {card.subject || ""}
            </p>
            <p className="text-sm text-slate-800 font-medium leading-relaxed mb-3">
              {card.question_text}
            </p>
            {card.child_answer_text && (
              <div className="flex items-start gap-2 mt-3 p-2 bg-rose-50 rounded-md">
                <span className="text-rose-500 text-xs font-bold mt-0.5">✗</span>
                <div>
                  <p className="text-[10px] text-rose-400 font-medium uppercase">Your answer</p>
                  <p className="text-xs text-rose-700">{card.child_answer_text}</p>
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 text-center">Tap to see correct answer</p>
          </div>
        ) : (
          /* ─── BACK: Correct Answer + Explanation ─── */
          <div>
            <p className="text-xs font-medium text-emerald-500 mb-2 uppercase tracking-wider">
              Correct Answer
            </p>
            <div className="flex items-start gap-2 p-2 bg-emerald-50 rounded-md mb-3">
              <span className="text-emerald-600 text-xs font-bold mt-0.5">✓</span>
              <p className="text-sm text-emerald-800 font-medium">{card.correct_answer_text}</p>
            </div>
            {card.explanation && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Explanation</p>
                <p className="text-xs text-slate-600 leading-relaxed">{card.explanation}</p>
              </div>
            )}
            {card.category?.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {card.category.map((c, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 text-center">Tap to see question</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={handlePrev}
          disabled={flashcards.length <= 1}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
        >
          ← Prev
        </button>

        {/* Progress dots */}
        <div className="flex gap-1">
          {flashcards.slice(0, Math.min(flashcards.length, 10)).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentIdx ? "bg-indigo-600" : "bg-slate-200"
              }`}
            />
          ))}
          {flashcards.length > 10 && (
            <span className="text-[10px] text-slate-400 ml-1">+{flashcards.length - 10}</span>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={flashcards.length <= 1}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
        >
          Next →
        </button>
      </div>

      {/* Refresh */}
      <button
        onClick={loadFlashcards}
        className="w-full mt-3 text-[10px] text-indigo-500 hover:text-indigo-700 transition"
      >
        ↻ Refresh cards
      </button>
    </div>
  );
}
