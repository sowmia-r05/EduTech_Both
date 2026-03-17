import { Routes, Route, useSearchParams, Navigate } from "react-router-dom";
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
import TermsPage from "@/app/components/pages/TermsPage";
import PrivacyPage from "@/app/components/pages/PrivacyPage";
import ParentCreatePage from "@/app/components/pages/ParentCreatePage";
import ParentVerifyPage from "@/app/components/pages/ParentVerifyPage";
import ParentLoginPage from "@/app/components/pages/ParentLoginPage";
import StudentDashboardAnalytics from "@/app/components/pages/StudentDashboardAnalytics";
import BundleSelectionPage from "@/app/components/pages/Bundleselectionpage";
import AdminLogin     from "@/app/components/admin/AdminLogin";
import AdminRegister  from "@/app/components/admin/AdminRegister";
import AdminDashboard from "@/app/components/admin/AdminDashboard";
import RequireAdmin   from "@/app/components/admin/RequireAdmin";
import QuizDetailPage from "@/app/components/admin/QuizDetailPage";
import Tutorlogin     from "@/app/components/admin/Tutorlogin";
import Tutordashboard from "@/app/components/admin/Tutordashboard";
import RequireTutor   from "@/app/components/admin/RequireTutor";
import { useAuth } from "@/app/context/AuthContext";
import IdleTimeoutProvider from "./components/auth/IdleTimeoutProvider";
import ChildIdleTimeoutProvider from "./components/auth/ChildIdleTimeoutProvider";

// Read from env var — add VITE_ADMIN_PATH=/your-secret-path to frontend .env
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || "/admin";

if (ADMIN_PATH === "/admin") {
  console.warn(
    "[security] VITE_ADMIN_PATH is not set. Admin panel is exposed at /admin - " +
    "set VITE_ADMIN_PATH to secret path in env file before deploying"
  );
}

export { ADMIN_PATH };

function WithFooter({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1">{children}</div>
      <FooterMinimal />
    </div>
  );
}

function RequireNoChild({ children }) {
  const { isChild, isInitializing } = useAuth();
  if (isInitializing) return null;
  if (isChild) return <Navigate to="/child-dashboard" replace />;
  return children;
}

// Only admin role redirects to dashboard on register guard
function isAdminLoggedIn() {
  const token = localStorage.getItem("admin_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) return false;
    return payload.role === "admin";
  } catch {
    return false;
  }
}

function AdminRegisterGuard() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  if (isAdminLoggedIn()) {
    return <Navigate to={`${ADMIN_PATH}/dashboard`} replace />;
  }
  if (!inviteToken) {
    return <Navigate to={ADMIN_PATH} replace />;
  }
  return <AdminRegister />;
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* ─── Public ─── */}
        <Route path="/" element={<WelcomePage />} />
        <Route path="/free-trial" element={<FreeTrialPage />} />
        <Route path="/terms"   element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/bundles" element={<RequireParent><WithFooter><BundleSelectionPage /></WithFooter></RequireParent>} />

        {/* ─── Parent Auth ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />
        <Route path="/parent-login"  element={<ParentLoginPage />} />

        {/* ─── Child Auth ─── */}
        <Route path="/child-login" element={<RequireNoChild><ChildLoginPage /></RequireNoChild>} />

        {/* ─── Analytics ─── */}
        <Route
          path="/student-analytics"
          element={
            <RequireParent>
              <WithFooter><StudentDashboardAnalytics /></WithFooter>
            </RequireParent>
          }
        />

        {/* ─── Parent-protected ─── */}
        <Route
          path="/parent-dashboard"
          element={
            <RequireParent>
              <IdleTimeoutProvider>
                <WithFooter><ParentDashboard /></WithFooter>
              </IdleTimeoutProvider>
            </RequireParent>
          }
        />

        {/* ─── Child Dashboard ─── */}
        <Route
          path="/child-dashboard"
          element={
            <RequireAuth>
              <ChildIdleTimeoutProvider>
                <WithFooter><ChildDashboard /></WithFooter>
              </ChildIdleTimeoutProvider>
            </RequireAuth>
          }
        />

        {/* ─── Results ─── */}
        <Route
          path="/NonWritingLookupQuizResults/results"
          element={<RequireAuth><WithFooter><Dashboard /></WithFooter></RequireAuth>}
        />
        <Route
          path="/writing-feedback/result"
          element={<RequireAuth><WithFooter><ResultPage /></WithFooter></RequireAuth>}
        />

        {/* ─── Admin ─── */}
        <Route path={ADMIN_PATH}                   element={<AdminLogin />} />
        <Route path={`${ADMIN_PATH}/register`}     element={<AdminRegisterGuard />} />
        <Route
          path={`${ADMIN_PATH}/dashboard`}
          element={<RequireAdmin><AdminDashboard /></RequireAdmin>}
        />
        <Route
          path={`${ADMIN_PATH}/quiz/:quizId`}
          element={<RequireAdmin><QuizDetailPage /></RequireAdmin>}
        />

        {/* ─── Tutor ─── */}
        <Route path={`${ADMIN_PATH}/tutor`}           element={<Tutorlogin />} />
        <Route
          path={`${ADMIN_PATH}/tutor/dashboard`}
          element={<RequireTutor><Tutordashboard /></RequireTutor>}
        />

        <Route path="*" element={<WithFooter><NotFound /></WithFooter>} />
      </Routes>
    </AuthProvider>
  );
}
