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
import AdminLogin    from "@/app/components/admin/AdminLogin";
import AdminRegister from "@/app/components/admin/AdminRegister";
import AdminDashboard from "@/app/components/admin/AdminDashboard";
import RequireAdmin  from "@/app/components/admin/RequireAdmin";
import QuizDetailPage from "@/app/components/admin/QuizDetailPage";

// Read from env var — add VITE_ADMIN_PATH=/your-secret-path to frontend .env
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || "/admin";
export { ADMIN_PATH };

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
        <Route path="/bundles" element={<WithFooter><BundleSelectionPage /></WithFooter>} />

        {/* ─── Parent Auth ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />
        <Route path="/parent-login"  element={<ParentLoginPage />} />

        {/* ─── Child Auth ─── */}
        <Route path="/child-login" element={<ChildLoginPage />} />

        {/* ─── Analytics ─── */}
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

        {/*
          ─── Child Dashboard ───
          Uses RequireAuth (NOT RequireChild) because:
          - A parent navigates here to VIEW a child's dashboard (no PIN needed)
            e.g. /child-dashboard?childId=xxx&childName=yyy
          - A child navigates here after PIN login via QuickChildLoginModal
          Both cases have a valid token (parent or child), so RequireAuth covers both.
          ChildDashboard.jsx internally checks whether it's a parent or child viewing.
        */}
        <Route
          path="/child-dashboard"
          element={
            <RequireAuth>
              <WithFooter><ChildDashboard /></WithFooter>
            </RequireAuth>
          }
        />

        {/* ─── Results ─── */}
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

        {/* ─── Admin ─── */}
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

        <Route path="*" element={<WithFooter><NotFound /></WithFooter>} />
      </Routes>
    </AuthProvider>
  );
}


