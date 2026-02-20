import { Routes, Route } from "react-router-dom";

import WelcomePage from "@/app/components/WelcomePage";
import RegistrationPage from "@/app/components/RegistrationPage";
import InputPage from "@/app/components/InputPage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import NonWritingInputPage from "@/app/components/NonWritingInputPage";
import NotFound from "@/app/components/pages/NotFound";
import FreeTrialPage from "@/app/components/landing/FreeTrialPage";
import StartTestPage from "@/app/components/StartTestPage";
import TrailDashboard from "@/app/components/pages/TrailDashboard";
import TrialTestPage from "@/app/components/pages/TrialTestPage";

import RespondentPortal from "@/app/components/pages/RespondentPortal";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Landing */}
      <Route path="/" element={<WelcomePage />} />
      <Route path="/free-trial" element={<FreeTrialPage />} />
      <Route path="/start-test" element={<StartTestPage />} />
      <Route path="/dashboard-preview" element={<TrailDashboard />} />
      <Route path="/trial-test" element={<TrialTestPage />} />

      {/* Auth */}
      <Route path="/register" element={<RegistrationPage />} />

      {/* FlexiQuiz Respondent Portal (FlexiQuiz SSO) */}
      <Route path="/respondent" element={<RespondentPortal />} />

     
      <Route path="/writing-feedback/result" element={<ResultPage />} />

    

      {/* ✅ Real Dashboard (Protected) */}
      <Route
        path="/NonWritingLookupQuizResults/results"
        element={<Dashboard />}
      />

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
