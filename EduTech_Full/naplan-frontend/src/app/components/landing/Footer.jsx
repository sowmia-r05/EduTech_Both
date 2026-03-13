// src/app/components/landing/Footer.jsx

import { Link, useNavigate, useLocation } from "react-router-dom";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();
  const location = useLocation();

  const handleFAQClick = (e) => {
    e.preventDefault();
    if (location.pathname === "/") {
      const el = document.getElementById("faq");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      navigate("/");
      setTimeout(() => {
        const el = document.getElementById("faq");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  };

  return (
    <footer className="bg-gradient-to-b from-white to-indigo-50 border-t border-gray-200">
      {/* ── Brand + tagline ── */}
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-6 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-base">K</span>
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">
            KAI Solutions
          </span>
        </div>

        <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto leading-relaxed">
          AI-powered{" "}
          <span className="text-indigo-600 font-semibold">NAPLAN</span>{" "}
           Style preparation built for Australian students — Years 3, 5, 7 & 9
        </p>

        <a
          href="https://www.kaisolutions.com.au"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-colors"
        >
          www.kaisolutions.com.au
        </a>
      </div>

      {/* ── Divider ── */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gray-200" />
      </div>

      {/* ── Navigation links ── */}
      <div className="max-w-4xl mx-auto px-6 py-5">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          <a
            href="mailto:support@kaisolutions.com.au"
            className="text-gray-500 hover:text-indigo-600 transition-colors"
          >
            Contact us
          </a>
          <span className="text-gray-300">•</span>
          <a
            href="/#faq"
            onClick={handleFAQClick}
            className="text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            FAQs
          </a>
          <span className="text-gray-300">•</span>
          <Link
            to="/privacy"
            className="text-gray-500 hover:text-indigo-600 transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-gray-300">•</span>
          <Link
            to="/terms"
            className="text-gray-500 hover:text-indigo-600 transition-colors"
          >
            Terms & Conditions
          </Link>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gray-200" />
      </div>

      {/* ── Disclaimer + Copyright ── */}
      <div className="max-w-4xl mx-auto px-6 py-5 text-center space-y-2">
        <p className="text-xs text-gray-400 leading-relaxed max-w-2xl mx-auto">
          *This is not an officially endorsed publication of the NAPLAN program
          and is produced by KAI Solutions independently of Australian
          governments.
        </p>
        <p className="text-xs text-gray-400">
          © KAI Solutions {currentYear}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
