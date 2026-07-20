// src/app/components/pages/TermsPage.jsx
//
// Full-page wrapper for Terms & Conditions.
// The TEXT lives in TermsAndConditions.jsx — single source of truth.
// Do not duplicate clauses here; they will diverge.

import { useNavigate } from "react-router-dom";
import Navbar from "@/app/components/layout/Navbar";
import Footer from "@/app/components/landing/Footer";
import TermsAndConditions from "@/app/components/TermsAndConditions";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <TermsAndConditions variant="page" />
        </div>
      </main>

      <Footer />
    </div>
  );
}