// src/app/App.jsx

import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/app/context/AuthContext";
import { RequireParent, RequireChild, RequireAuth } from "@/app/components/auth/RequireAuth";
import FooterMinimal from "@/app/components/landing/FooterMinimal";

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
import TermsPage from "@/app/components/pages/TermsPage";
import PrivacyPage from "@/app/components/pages/PrivacyPage";
import ParentCreatePage from "@/app/components/pages/ParentCreatePage";
import ParentVerifyPage from "@/app/components/pages/ParentVerifyPage";
import ParentLoginPage from "@/app/components/pages/ParentLoginPage";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import BundleSelectionPage from "@/app/components/pages/Bundleselectionpage";
import QuizCompletePage from "./components/pages/QuizCompletePage";

/* ── Layout wrapper — adds minimal disclaimer footer below any page ── */
function WithFooter({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1">{children}</div>
      <FooterMinimal />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* ─── Public (WelcomePage has its own full Footer) ─── */}
        <Route path="/" element={<WelcomePage />} />
        <Route path="/free-trial" element={<FreeTrialPage />} />
        <Route path="/start-test" element={<StartTestPage />} />
        <Route path="/dashboard-preview" element={<TrailDashboard />} />
        <Route path="/trial-test" element={<TrialTestPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* ─── Bundle Selection ─── */}
        <Route path="/bundles" element={<WithFooter><BundleSelectionPage /></WithFooter>} />

        {/* ─── Parent Auth (public) ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />

        {/* ─── Child Auth (public) ─── */}
        <Route path="/child-login" element={<ChildLoginPage />} />
        <Route path="/parent-login" element={<ParentLoginPage />} />

        <Route path="/StudentDashboardAnalytics" element={<WithFooter><StudentDashboardAnalytics /></WithFooter>} />

        {/* ─── Parent-protected routes ─── */}
        <Route
          path="/parent-dashboard"
          element={
            <RequireParent>
              <WithFooter>
                <ParentDashboard />
              </WithFooter>
            </RequireParent>
          }
        />

        {/* ─── Child-protected routes ─── */}
        <Route
          path="/child-dashboard"
          element={
            <RequireAuth>
              <WithFooter>
                <ChildDashboard />
              </WithFooter>
            </RequireAuth>
          }
        />

        {/* ─── Results dashboards (auth-protected) ─── */}
        <Route
          path="/NonWritingLookupQuizResults/results"
          element={
            <RequireAuth>
              <WithFooter>
                <Dashboard />
              </WithFooter>
            </RequireAuth>
          }
        />

        <Route
          path="/writing-feedback/result"
          element={
            <RequireAuth>
              <WithFooter>
                <ResultPage />
              </WithFooter>
            </RequireAuth>
          }
        />

        <Route
          path="/student-analytics"
          element={<WithFooter><StudentDashboardAnalytics /></WithFooter>}
        />
        <Route path="/quiz-complete" element={<QuizCompletePage />} />

        {/* ─── Fallback ─── */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
