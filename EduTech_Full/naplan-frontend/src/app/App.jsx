import { Routes, Route } from "react-router-dom";

// ─── Existing pages ───
import WelcomePage from "@/app/components/WelcomePage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import ChildDashboard from "@/app/components/pages/ChildDashboard";
import NotFound from "@/app/components/pages/NotFound";
import FreeTrialPage from "@/app/components/landing/FreeTrialPage";
import StartTestPage from "@/app/components/StartTestPage";
import TrailDashboard from "@/app/components/pages/TrailDashboard";
import TrialTestPage from "@/app/components/pages/TrialTestPage";
import RespondentPortal from "@/app/components/pages/RespondentPortal";
import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy from "@/app/components/PrivacyPolicy";

// ─── NEW: Phase 2 pages ───
import LoginPage from "@/app/components/pages/LoginPage";
import RegisterPage from "@/app/components/pages/RegisterPage";
import ParentDashboard from "@/app/components/pages/ParentDashboard";
import VerifyEmailPage from "@/app/components/pages/VerifyEmailPage";
import ForgotPasswordPage from "@/app/components/pages/ForgotPasswordPage";
import RequireAuth from "@/app/components/auth/RequireAuth";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Landing */}
      <Route path="/" element={<WelcomePage />} />
      <Route path="/free-trial" element={<FreeTrialPage />} />
      <Route path="/start-test" element={<StartTestPage />} />
      <Route path="/dashboard-preview" element={<TrailDashboard />} />
      <Route path="/trial-test" element={<TrialTestPage />} />

      {/* ═══ NEW: Auth (Phase 2) ═══ */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* ═══ NEW: Protected Parent Dashboard (Phase 2) ═══ */}
      <Route
        path="/parent-dashboard"
        element={
          <RequireAuth role="parent">
            <ParentDashboard />
          </RequireAuth>
        }
      />

      {/* ═══ Existing (kept for now, will be updated in Phase 5) ═══ */}
      <Route path="/child-dashboard" element={<ChildDashboard />} />
      <Route path="/respondent" element={<RespondentPortal />} />
      <Route path="/writing-feedback/result" element={<ResultPage />} />

      {/* Privacy & Terms */}
      <Route path="/terms" element={<TermsAndConditions />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />

      {/* Existing Dashboard (Protected) */}
      <Route
        path="/NonWritingLookupQuizResults/results"
        element={<Dashboard />}
      />

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
