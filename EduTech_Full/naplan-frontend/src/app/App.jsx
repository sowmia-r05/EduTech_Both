import { Routes, Route } from "react-router-dom";

import WelcomePage from "@/app/components/WelcomePage";
import RegistrationPage from "@/app/components/RegistrationPage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import ParentDashboard from "@/app/components/pages/ParentDashboard";
import ChildDashboard from "@/app/components/pages/ChildDashboard"


import NotFound from "@/app/components/pages/NotFound";
import FreeTrialPage from "@/app/components/landing/FreeTrialPage";
import StartTestPage from "@/app/components/StartTestPage";
import TrailDashboard from "@/app/components/pages/TrailDashboard";
import TrialTestPage from "@/app/components/pages/TrialTestPage";
import RespondentPortal from "@/app/components/pages/RespondentPortal";
import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy  from "@/app/components/PrivacyPolicy";
import ParentCreatePage  from "@/app/components/pages/ParentCreatePage";
import ParentVerifyPage  from "@/app/components/pages/ParentVerifyPage";

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

      <Route path="/parent-dashboard" element={<ParentDashboard />} />
      <Route path="/child-dashboard" element={<ChildDashboard />} />



     
      <Route path="/writing-feedback/result" element={<ResultPage />} />

          {/* Privacy policy and Terms and Conditions*/}
      <Route path="/terms" element={<TermsAndConditions />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />

      {/* ✅ Real Dashboard (Protected) */}
      <Route
        path="/NonWritingLookupQuizResults/results"
        element={<Dashboard />}
      />

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />

      <Route path="/parent/create" element={<ParentCreatePage />} />
      <Route path="/parent/verify" element={<ParentVerifyPage />} />


    </Routes>
  );
}
