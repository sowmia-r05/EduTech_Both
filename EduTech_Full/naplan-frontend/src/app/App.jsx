// src/app/App.jsx
//
// CHANGE: Admin routes moved to secret path /kai-ops-9281
// CHANGE: /admin/register now reads invite token from URL
// Everything else (parent, child, public routes) is IDENTICAL
//
// ⚠️  Keep the secret path out of public docs / README.
//     Share it only with your team via a secure channel.

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
import TrialTestPage from "@/app/components/pages/TrialTestPage";
import TermsPage from "@/app/components/pages/TermsPage";
import PrivacyPage from "@/app/components/pages/PrivacyPage";
import ParentCreatePage from "@/app/components/pages/ParentCreatePage";
import ParentVerifyPage from "@/app/components/pages/ParentVerifyPage";
import ParentLoginPage from "@/app/components/pages/ParentLoginPage";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import BundleSelectionPage from "@/app/components/pages/Bundleselectionpage";

// ── Admin components ──
import AdminLogin    from "@/app/components/admin/AdminLogin";
import AdminRegister from "@/app/components/admin/AdminRegister";
import AdminDashboard from "@/app/components/admin/AdminDashboard";
import RequireAdmin  from "@/app/components/admin/RequireAdmin";
import QuizDetailPage from "@/app/components/admin/QuizDetailPage";

// ✅ Secret admin path — only your team knows this
//    Change before production deployment
export const ADMIN_PATH = "/kai-ops-9281";

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
        {/* ─── Public ─── */}
        <Route path="/" element={<WelcomePage />} />
        <Route path="/free-trial" element={<FreeTrialPage />} />
        <Route path="/start-test" element={<StartTestPage />} />
        <Route path="/trial-test" element={<TrialTestPage />} />
        <Route path="/terms"   element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* ─── Bundle Selection ─── */}
        <Route path="/bundles" element={<WithFooter><BundleSelectionPage /></WithFooter>} />

        {/* ─── Parent Auth ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />
        <Route path="/parent-login"  element={<ParentLoginPage />} />

        {/* ─── Child Auth ─── */}
        <Route path="/child-login" element={<ChildLoginPage />} />

        {/* ─── Analytics (auth required) ─── */}
        <Route
          path="/student-analytics"
          element={
            <RequireAuth>
              <WithFooter><StudentDashboardAnalytics /></WithFooter>
            </RequireAuth>
          }
        />

        {/* ─── Parent-protected ─── */}
        <Route
          path="/parent-dashboard"
          element={
            <RequireParent>
              <WithFooter><ParentDashboard /></WithFooter>
            </RequireParent>
          }
        />

        {/* ─── Child-protected ─── */}
        <Route
          path="/child-dashboard"
          element={
            <RequireAuth>
              <WithFooter><ChildDashboard /></WithFooter>
            </RequireAuth>
          }
        />

        {/* ─── Results (auth required) ─── */}
        <Route
          path="/NonWritingLookupQuizResults/results"
          element={
            <RequireAuth>
              <WithFooter><Dashboard /></WithFooter>
            </RequireAuth>
          }
        />
        <Route
          path="/writing-feedback/result"
          element={
            <RequireAuth>
              <WithFooter><ResultPage /></WithFooter>
            </RequireAuth>
          }
        />

        {/* ─── Admin routes — secret path ─── */}
        {/* ✅ Old /admin path is GONE — only secret path works */}
        <Route path={ADMIN_PATH} element={<AdminLogin />} />
        <Route path={`${ADMIN_PATH}/register`} element={<AdminRegister />} />
        <Route
          path={`${ADMIN_PATH}/dashboard`}
          element={<RequireAdmin><AdminDashboard /></RequireAdmin>}
        />
        <Route
          path={`${ADMIN_PATH}/quiz/:quizId`}
          element={<RequireAdmin><QuizDetailPage /></RequireAdmin>}
        />

        {/* ─── Fallback ─── */}
        <Route path="*" element={<WithFooter><NotFound /></WithFooter>} />
      </Routes>
    </AuthProvider>
  );
}
