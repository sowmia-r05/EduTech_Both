import { Routes, Route } from "react-router-dom";

import WelcomePage from "@/app/components/WelcomePage";
import RegistrationPage from "@/app/components/RegistrationPage";
import InputPage from "@/app/components/InputPage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import NonWritingInputPage from "@/app/components/NonWritingInputPage";
import NotFound from "@/app/components/pages/NotFound";
import FreeTrialPage from "@/app/components/landing/FreeTrialPage";  // Correct import here

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/register" element={<RegistrationPage />} />
      <Route path="/free-trial" element={<FreeTrialPage />} /> {/* ✅ new route */}

      <Route path="/WritingLookupQuizResults" element={<InputPage />} />
      <Route path="/writing-feedback/result" element={<ResultPage />} />

      <Route
        path="/NonWritingLookupQuizResults"
        element={<NonWritingInputPage />}
      />
      <Route
        path="/NonWritingLookupQuizResults/results"
        element={<Dashboard />}
      />

      <Route path="/result" element={<ResultPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
