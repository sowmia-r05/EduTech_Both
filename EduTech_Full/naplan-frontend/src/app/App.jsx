import { HashRouter as Router, Routes, Route } from "react-router-dom";

import WelcomePage from "@/app/components/WelcomePage";
import RegistrationPage from "@/app/components/RegistrationPage";
import InputPage from "@/app/components/InputPage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import NonWritingInputPage from "@/app/components/NonWritingInputPage";
import NotFound from "@/app/components/pages/NotFound";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/register" element={<RegistrationPage />} />

        {/* Writing feedback flow */}
        <Route path="/WritingLookupQuizResults" element={<InputPage />} />
        <Route path="/writing-feedback/result" element={<ResultPage />} />

        {/* Non Writing feedback flow */}
        <Route
          path="/NonWritingLookupQuizResults"
          element={<NonWritingInputPage />}
        />
        <Route
          path="/NonWritingLookupQuizResults/results"
          element={<Dashboard />}
        />

        {/* Backward compat */}
        <Route path="/result" element={<ResultPage />} />

        {/* 404 – must be last */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
