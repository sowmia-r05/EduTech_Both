import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/app/context/AuthContext";
import { RequireParent, RequireChild, RequireAuth } from "@/app/components/auth/RequireAuth";

import WelcomePage from "@/app/components/WelcomePage";
import ResultPage from "@/app/components/ResultPage";
import Dashboard from "@/app/components/pages/Dashboard";
import ParentDashboard from "@/app/components/pages/ParentDashboard";
import ChildDashboard from "@/app/components/pages/ChildDashboard";
import ChildLoginPage from "@/app/components/pages/ChildLoginPage";
import NotFound from "@/app/components/pages/NotFound";
import FreeTrialPage from "@/app/components/landing/FreeTrialPage";
import StartTestPage from "@/app/components/StartTestPage";
import TrailDashboard from "@/app/components/pages/TrailDashboard";
import TrialTestPage from "@/app/components/pages/TrialTestPage";
import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy from "@/app/components/PrivacyPolicy";
import ParentCreatePage from "@/app/components/pages/ParentCreatePage";
import ParentVerifyPage from "@/app/components/pages/ParentVerifyPage";
import ParentLoginPage from "@/app/components/pages/ParentLoginPage";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import BundleSelectionPage from "@/app/components/pages/Bundleselectionpage";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* ─── Public ─── */}
        <Route path="/" element={<WelcomePage />} />
        <Route path="/free-trial" element={<FreeTrialPage />} />
        <Route path="/start-test" element={<StartTestPage />} />
        <Route path="/dashboard-preview" element={<TrailDashboard />} />
        <Route path="/trial-test" element={<TrialTestPage />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* ─── Bundle Selection (public, but checkout requires auth) ─── */}
        <Route path="/bundles" element={<BundleSelectionPage />} />

        {/* ─── Parent Auth (public) ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />

        {/* ─── Child Auth (public) ─── */}
        <Route path="/child-login" element={<ChildLoginPage />} />

        <Route path="/parent-login" element={<ParentLoginPage />} />

        <Route path="/StudentDashboardAnalytics" element={<StudentDashboardAnalytics />} />
    
        {/* ─── Parent-protected routes ─── */}
        <Route
          path="/parent-dashboard"
          element={
            <RequireParent>
              <ParentDashboard />
            </RequireParent>
          }
        />

        {/* ─── Child-protected routes ─── */}
        <Route
          path="/child-dashboard"
          element={
            <RequireAuth>
              <ChildDashboard />
            </RequireAuth>
          }
        />

        {/* ─── Results dashboards (auth-protected) ─── */}
        <Route
          path="/NonWritingLookupQuizResults/results"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/writing-feedback/result"
          element={
            <RequireAuth>
              <ResultPage />
            </RequireAuth>
          }
        />


        <Route
          path="/student-analytics"
          element={
              <StudentDashboardAnalytics/>
          }
        />

        {/* ─── Fallback ─── */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
