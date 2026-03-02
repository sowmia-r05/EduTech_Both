// src/app/components/pages/QuizCompletePage.jsx
//
// Bridge page that FlexiQuiz redirects to INSIDE THE IFRAME after quiz submission.
// URL: /quiz-complete?r=[ResponseId]&s=[Score]&g=[Grade]&*childId=*childId
//
// This page:
// 1. Parses the URL query params (ResponseId, Score, Grade, childId)
// 2. Sends window.parent.postMessage() to the parent frame (QuizPlayer)
// 3. Shows a brief "Processing..." message (visible only for a moment)
//
// Because this page is on YOUR domain, postMessage works freely (no cross-origin issues).

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export default function QuizCompletePage() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Extract FlexiQuiz redirect parameters
    const responseId = searchParams.get("r") || "";
    const score = searchParams.get("s") || "";
    const grade = searchParams.get("g") || "";
    const childId = searchParams.get("*childId") || searchParams.get("childId") || "";

    // Send completion signal to parent frame (QuizPlayer component)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "quiz-complete",
          responseId,
          score,
          grade,
          childId,
        },
        window.location.origin // restrict to same origin for security
      );
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-violet-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        <p className="text-slate-600 font-medium">Processing your results...</p>
        <p className="text-xs text-slate-400">Please wait, this will only take a moment.</p>
      </div>
    </div>
  );
}