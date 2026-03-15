// TrialTestPage.jsx — FIXED
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

// ── Sanitize name: allow only letters, spaces, hyphens, apostrophes (max 50 chars)
function sanitizeName(raw) {
  const cleaned = String(raw || "")
    .replace(/[^a-zA-Z0-9 '\-]/g, "")
    .trim()
    .slice(0, 50);
  return cleaned || "Student";
}

// ── Map year level to real FlexiQuiz quiz IDs
// ⚠️  Replace placeholder values below with your actual FlexiQuiz quiz UUIDs
const QUIZ_MAP = {
  "3": "709152f5-32a5-449d-8626-78da6090f73d",
  "5": "", // TODO: replace with real Year 5 FlexiQuiz UUID
  "7": "", // TODO: replace with real Year 7 FlexiQuiz UUID
  "9": "", // TODO: replace with real Year 9 FlexiQuiz UUID
};

const ALLOWED_YEARS = ["3", "5", "7", "9"];

export default function TrialTestPage() {
  const location    = useLocation();
  const navigate    = useNavigate();
  const { parentProfile, childProfile } = useAuth();

  const searchParams = new URLSearchParams(location.search);

  // ✅ Sanitize name — strip any HTML/JS injection
  const name = sanitizeName(searchParams.get("name"));

  // ✅ Whitelist year — reject anything outside allowed values
  const rawYear = searchParams.get("year") || "3";
  const year    = ALLOWED_YEARS.includes(rawYear) ? rawYear : "3";

  const quizId = QUIZ_MAP[year];

  // ✅ Use authenticated user's real email — never a shared placeholder
  const userEmail =
    parentProfile?.email ||
    childProfile?.email  ||
    ""; // empty string is fine — FlexiQuiz will prompt

  useEffect(() => {
    if (!quizId) {
      // Quiz not yet configured for this year — redirect gracefully
      navigate("/parent-dashboard", { replace: true });
      return;
    }

    const existingScript = document.getElementById("fqo-es");
    if (existingScript) existingScript.remove();

    window.fq_ev   = "1.1";
    window.fq_et   = "ql";
    window.fq_eid  = quizId;
    window.fq_pre_fill = {
      name:  name,
      email: userEmail,
    };

    const script    = document.createElement("script");
    script.id       = "fqo-es";
    script.src      = "https://www.flexiquiz.com/scripts/fqo-embed-1.1.js";
    script.async    = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      delete window.fq_ev;
      delete window.fq_et;
      delete window.fq_eid;
      delete window.fq_pre_fill;
    };
  }, [name, year, quizId, userEmail, navigate]);

  if (!quizId) return null; // handled by useEffect redirect above

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <h1 className="text-3xl font-bold text-indigo-600 mb-6">
        {`NAPLAN Practice Test — Year ${year}`}
      </h1>
      <p className="mb-8 text-gray-700 text-center max-w-xl">
        Hello <strong>{name}</strong>, your quiz will appear below.
      </p>
      <div id="fqo" className="w-full max-w-4xl" />
    </div>
  );
}


