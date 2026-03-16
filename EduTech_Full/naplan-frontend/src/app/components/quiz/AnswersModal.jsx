/**
 * AnswersModal.jsx
 *
 * Full-screen modal that displays the child's quiz answers after completion.
 * Features:
 *   - Score summary header
 *   - Topic breakdown
 *   - Each question with green/red correct/wrong indicators
 *   - Question images (if present)
 *
 * Data source: GET /api/attempts/:attemptId/flashcards
 *
 * Props:
 *   - attemptId : string (attempt_id to fetch flashcards)
 *   - quizName  : string
 *   - score     : { points, available, percentage, grade }
 *   - topics    : { [name]: { scored, total } }
 *   - onClose   : () => void
 *
 * Place in: src/app/components/quiz/AnswersModal.jsx
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/app/context/AuthContext";

/* ═══════════════════════════════════════
   Helpers to read flashcard fields with fallback aliases
   ═══════════════════════════════════════ */
function getChildAnswer(card) {
  return card.child_answer || card.child_answer_text || "No answer";
}

function getCorrectAnswer(card) {
  if (Array.isArray(card.correct_answers) && card.correct_answers.length > 0) {
    return card.correct_answers.join(", ");
  }
  return card.correct_answer || card.correct_answer_text || "—";
}


function getIsCorrect(card) {
  if (card.is_correct === true)  return true;
  if (card.is_correct === false) return false;
  if (card.points_earned > 0)   return true;
  if (card.points_scored > 0)   return true;
  return false;
}

/* ═══════════════════════════════════════
   Question Image — renders if any image field is present
   Tries multiple common field names.
   ═══════════════════════════════════════ */
function QuestionImage({ card }) {
  const [failed, setFailed] = useState(false);

  const src =
    card.image_url      ||
    card.question_image ||
    card.imageUrl       ||
    card.image          ||
    null;

  if (!src || failed) return null;

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
      <img
        src={src}
        alt="Question illustration"
        className="w-full max-h-64 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}


function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}



/* ═══════════════════════════════════════
   MAIN: AnswersModal
   ═══════════════════════════════════════ */
export default function AnswersModal({ attemptId, quizName, score, topics, onClose }) {
  const { apiFetch } = useAuth();
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ─── Fetch flashcards ───
  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiFetch(`/api/attempts/${attemptId}/flashcards`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to load answers");
        }
        const data = await res.json();
        if (!cancelled) setFlashcards(data.flashcards || data || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [attemptId, apiFetch]);

  // ─── Close on Escape ───
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ─── Summary stats ───
  const totalCorrect   = score?.correct ?? flashcards.filter((f) => getIsCorrect(f)).length;
  const totalQuestions = score?.total   ?? flashcards.length;


  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 pt-8 pb-8">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Modal Header ─── */}
        <div className="sticky top-0 bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Your Answers</h2>
            <p className="text-xs text-slate-500 mt-0.5">{quizName}</p>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ─── Modal Body (scrollable) ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading your answers...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <button
                onClick={onClose}
                className="mt-3 text-xs text-red-600 underline hover:text-red-800"
              >
                Close
              </button>
            </div>
          )}

          {/* Content */}
          {!loading && !error && (
            <>
              {/* Score Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  (score?.percentage || 0) >= 50 ? "bg-emerald-500" : "bg-red-500"
                }`}>
                  {score?.percentage || 0}%
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {score?.points || 0} / {score?.available || 0} points
                  </p>
                  <p className="text-xs text-slate-500">
                    {totalCorrect} of {totalQuestions} correct · Grade {score?.grade || "—"}
                  </p>
                </div>
              </div>

              {/* Topic Breakdown */}
              {topics && Object.keys(topics).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(topics).map(([name, data]) => {
                      const topicPct = data.total > 0 ? Math.round((data.scored / data.total) * 100) : 0;
                      const color =
                        topicPct >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        topicPct >= 50 ? "bg-amber-100 text-amber-700 border-amber-200" :
                                         "bg-red-100 text-red-700 border-red-200";
                      return (
                        <span
                          key={name}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
                        >
                          {name} {topicPct}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-3">
                {flashcards.map((card, idx) => {
                  const isCorrect = getIsCorrect(card);
                  return (
                    <div
                      key={card.question_id || idx}
                      className={`rounded-xl border p-4 space-y-2 ${
                        isCorrect
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-red-200 bg-red-50/30"
                      }`}
                    >
                      {/* Question header */}
                      <div className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-white ${
                          isCorrect ? "bg-emerald-500" : "bg-red-500"
                        }`}>
                          {isCorrect ? "✓" : "✗"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                            Question {idx + 1}
                          </p>
                          <p className="text-sm text-slate-800 font-medium leading-relaxed">
                            {stripHtml(card.question_text)}
                          </p>

                          {/* ── Question Image ── */}
                          <QuestionImage card={card} />
                        </div>
                      </div>

                      {/* Answers */}
                      <div className="space-y-1.5" style={{ marginLeft: "28px" }}>
                        {/* Child's answer */}
                        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                          isCorrect
                            ? "bg-emerald-100/70 text-emerald-800"
                            : "bg-red-100/70 text-red-800"
                        }`}>
                          <span className="font-semibold text-xs mt-0.5 flex-shrink-0">
                            {isCorrect ? "✓" : "✗"}
                          </span>
                          <div>
                            <span className="text-xs font-medium opacity-70">Your answer: </span>
                            <span className="font-medium">{getChildAnswer(card)}</span>
                          </div>
                        </div>

                        {/* Correct answer (only if wrong) */}
                        {!isCorrect && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-100/70 text-emerald-800">
                            <span className="font-semibold text-xs mt-0.5 flex-shrink-0">✓</span>
                            <div>
                              <span className="text-xs font-medium opacity-70">Correct answer: </span>
                              <span className="font-medium">{getCorrectAnswer(card)}</span>
                            </div>
                          </div>
                        )}

                        {/* Explanation */}
                        {card.explanation && (
                          <div className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs leading-relaxed">
                            <span className="font-semibold">💡 </span>
                            {card.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty state */}
              {flashcards.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-500">No answer data available for this attempt.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Modal Footer ─── */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 rounded-b-2xl px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {!loading && !error && flashcards.length > 0
              ? `${totalCorrect}/${totalQuestions} correct`
              : ""}
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}