/**
 * QuizCompleteBridge.jsx
 *
 * Lightweight route that FlexiQuiz redirects to INSIDE the iframe
 * after quiz submission (fallback for the old iframe-based QuizPlayer).
 *
 * Purpose: Relay result data to the parent frame via postMessage.
 *
 * URL format (from FlexiQuiz redirect):
 *   /quiz-complete?r=[ResponseId]&s=[Score]&g=[Grade]&*childId=<childId>
 *
 * Place in: src/app/components/pages/QuizCompleteBridge.jsx
 * Route:    <Route path="/quiz-complete" element={<QuizCompleteBridge />} />
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export default function QuizCompleteBridge() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Extract FlexiQuiz redirect params
    const responseId = searchParams.get("r") || "";
    const score = searchParams.get("s") || "";
    const grade = searchParams.get("g") || "";
    const childId = searchParams.get("*childId") || searchParams.get("childId") || "";

    // Send to parent frame (QuizPlayer component)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "quiz-complete",
          responseId,
          score,
          grade,
          childId,
        },
        window.location.origin
      );
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-violet-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-slate-600 font-medium">Processing your results...</p>
        <p className="text-sm text-slate-400">Please wait a moment.</p>
      </div>
    </div>
  );
}
