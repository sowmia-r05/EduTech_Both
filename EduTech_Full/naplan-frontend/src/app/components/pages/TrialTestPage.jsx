// TrialTestPage.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function TrialTestPage() {
  const location = useLocation();

  // Parse query params for name and year
  const searchParams = new URLSearchParams(location.search);
  const name = searchParams.get("name") || "Student";
  const year = searchParams.get("year") || "3";

  // Map year to FlexiQuiz quiz IDs
  const quizMap = {
    "3": "709152f5-32a5-449d-8626-78da6090f73d", // Your Year 3 Quiz
    "5": "YEAR5-QUIZ-ID-HERE",
    "7": "YEAR7-QUIZ-ID-HERE",
    "9": "YEAR9-QUIZ-ID-HERE",
  };

  const quizId = quizMap[year];

  useEffect(() => {
    // Remove previous script if exists
    const existingScript = document.getElementById("fqo-es");
    if (existingScript) existingScript.remove();

    // Set FlexiQuiz global variables
    window.fq_ev = "1.1";
    window.fq_et = "ql";
    window.fq_eid = quizId;

    // Pre-fill name and email
    window.fq_pre_fill = {
      name: name,
      email: "student@example.com",
    };

    // Create script element
    const script = document.createElement("script");
    script.id = "fqo-es";
    script.src = "https://www.flexiquiz.com/scripts/fqo-embed-1.1.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      delete window.fq_ev;
      delete window.fq_et;
      delete window.fq_eid;
      delete window.fq_pre_fill;
    };
  }, [name, year, quizId]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <h1 className="text-3xl font-bold text-indigo-600 mb-6">
        {`NAPLAN Practice Test - Year ${year}`}
      </h1>
      <p className="mb-8 text-gray-700 text-center max-w-xl">
        Hello <strong>{name}</strong>, your quiz will appear below.
      </p>

      {/* FlexiQuiz Embed Target */}
      <div id="fqo" className="w-full max-w-4xl"></div>
    </div>
  );
}
