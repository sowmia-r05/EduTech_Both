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
import {useAuth} from "@/app/context/AuthContext";

// Read from env var — add VITE_ADMIN_PATH=/your-secret-path to frontend .env
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || "/admin";

if(ADMIN_PATH === "/admin"){
  console.warn( "[security] VITE_ADMIN_PATH is not set. Admin pannel is exposed at /admin - "+
    "set VITE_ADMIN_PATH to secret path in env file before deploying"
  )
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

/**
 * RequireNoChild
 *
 * Prevents a child who is already logged in from reaching the child login page.
 * If a child session is active → redirect to /child-dashboard.
 * If no child session → render the login page normally.
 *
 * This is different from RequireChild (which REQUIRES a child session).
 * This guard BLOCKS entry when a child session EXISTS.
 */
function RequireNoChild({ children }) {
  const { isChild, isInitializing } = useAuth();
  if (isInitializing) return <LoadingSpinner />;
  if (isChild) return <Navigate to="/child-dashboard" replace />;
  return children;
}


// Check if an admin is already logged in (reads localStorage, same as RequireAdmin.jsx)
function isAdminLoggedIn() {
  const token = localStorage.getItem("admin_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) return false;
    return payload.role === "admin" || payload.role === "super_admin";
  } catch {
    return false;
  }
}


/**
 * AdminRegisterGuard
 *
 * Protects the register route with two checks:
 * 1. Must have ?invite= token in the URL — without it, redirect to admin login
 * 2. If already logged in as admin, redirect straight to dashboard
 *
 * The backend independently validates the invite token on submit —
 * this is just a frontend first line of defence.
 */
function AdminRegisterGuard() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  // Already logged in as admin → go to dashboard
  if (isAdminLoggedIn()) {
    return <Navigate to={`${ADMIN_PATH}/dashboard`} replace />;
  }

  // No invite token in URL → go to admin login, not registration
  if (!inviteToken) {
    return <Navigate to={ADMIN_PATH} replace />;
  }

  // Valid invite token present → show registration form
  return <AdminRegister />;
}


export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* ─── Public ─── */}
        <Route path="/" element={<WelcomePage />} />
        <Route path="/free-trial" element={<FreeTrialPage />} />
        <Route path="/start-test" element={<RequireParent><StartTestPage /></RequireParent>} />
        <Route path="/trial-test" element={<RequireAuth><TrialTestPage/></RequireAuth>} />
        <Route path="/terms"   element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} /> 
        <Route path="/bundles" element={<RequireParent><WithFooter><BundleSelectionPage /></WithFooter></RequireParent>} />

        {/* ─── Parent Auth ─── */}
        <Route path="/parent/create" element={<ParentCreatePage />} />
        <Route path="/parent/verify" element={<ParentVerifyPage />} />
        <Route path="/parent-login"  element={<ParentLoginPage />} />

        {/* ─── Child Auth ─── */}
        <Route path="/child-login" element={<RequireNoChild><ChildLoginPage/> </RequireNoChild>} />

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
        <Route path={`${ADMIN_PATH}/register`} element={<AdminRegisterGuard />} />
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


