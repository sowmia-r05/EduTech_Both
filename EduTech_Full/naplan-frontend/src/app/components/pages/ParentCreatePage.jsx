// src/app/components/pages/ParentCreatePage.jsx
//
// CHANGES FROM ORIGINAL:
//   ✅ Added useSearchParams import to read ?redirect= query param
//   ✅ onSubmit stores redirect intent in localStorage ("parent_signup_redirect")
//   ✅ "Login" button preserves redirect param when navigating to /parent-login
//   ✅ Added a contextual banner when arriving from free-trial flow
//   ✅ Added Google Sign-In button with Terms & Privacy note
//   Everything else is IDENTICAL to the original.

import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn, X, Mail } from "lucide-react";

import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy from "@/app/components/PrivacyPolicy";
import { createParentAccount, normalizeEmail } from "@/app/utils/api";
import { useAuth } from "@/app/context/AuthContext";
import GoogleSignInButton from "@/app/components/auth/GoogleSignInButton";

/**
 * Email format validation only
 */
const looksLikeEmail = (e) => {
  const s = (e || "").trim();
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*$/.test(s);
};

/* -----------------------------
   Modal Component
----------------------------- */
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white shadow-[0_25px_70px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 md:px-10 py-5 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-600 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 md:px-12 py-8 md:py-10 overflow-y-auto max-h-[70vh] text-gray-700 leading-relaxed space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
   Parent Create Page
----------------------------- */
export default function ParentCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginParent } = useAuth();

  // ✅ NEW: Read the redirect intent from the URL (e.g. ?redirect=free-trial)
  const redirectIntent = searchParams.get("redirect") || "";

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("form");        // "form" | "otp"
  const [sentTo, setSentTo] = useState("");         // masked email from API
  const [otpCode, setOtpCode] = useState("");

  const normalizedEmail = normalizeEmail(formData.email);

  const canSubmit =
    Boolean(formData.firstName.trim()) &&
    Boolean(formData.lastName.trim()) &&
    looksLikeEmail(normalizedEmail) &&
    acceptedTerms;

  /* ── Google Sign-In handler ── */
  const handleGoogleSuccess = useCallback((data) => {
    loginParent(data.parent_token, data.parent);
    if (redirectIntent === "free-trial") {
      navigate("/parent-dashboard?onboarding=free-trial", { replace: true });
    } else {
      navigate("/parent-dashboard", { replace: true });
    }
  }, [loginParent, navigate, redirectIntent]);

  const handleVerifyOtp = async () => {
  setError("");
  const pendingEmail = localStorage.getItem("parent_pending_email") || "";
  if (!pendingEmail) { setError("Session expired. Please start again."); setStep("form"); return; }
  if (otpCode.length !== 6) { setError("Please enter the 6-digit code."); return; }

  try {
    setLoading(true);
    const result = await verifyParentOtp({ email: pendingEmail, otp: otpCode });
    const token  = result?.parent_token || result?.token || null;
    const parent = result?.parent || null;
    if (!token && !parent) throw new Error("Verification failed. Please try again.");

    loginParent(token, parent);
    localStorage.removeItem("parent_pending_email");
    localStorage.removeItem("parent_pending_masked");
    localStorage.removeItem("parent_pending_profile");

    const redirect = localStorage.getItem("parent_signup_redirect") || "";
    localStorage.removeItem("parent_signup_redirect");
    navigate(redirect === "free-trial" ? "/parent-dashboard?onboarding=free-trial" : "/parent-dashboard", { replace: true });
  } catch (err) {
    setError(err?.message || "OTP verification failed");
  } finally {
    setLoading(false);
  }
};




  const handleGoogleError = useCallback((message) => {
    setError(message || "Google Sign-In failed. Please try again.");
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = normalizedEmail;

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      return;
    }

    if (!email) {
      setError("Email is required.");
      return;
    }

    if (!looksLikeEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the Terms & Privacy Policy to continue.");
      return;
    }

    try {
      setLoading(true);

      const result = await createParentAccount({
        firstName,
        lastName,
        email,
      });

      localStorage.setItem("parent_pending_email", email);
      localStorage.setItem("parent_pending_masked", result?.otp_sent_to || "");
      localStorage.setItem(
        "parent_pending_profile",
        JSON.stringify({ firstName, lastName, email })
      );
      if (redirectIntent) {
        localStorage.setItem("parent_signup_redirect", redirectIntent);
      }
      setSentTo(result?.otp_sent_to || email);
      setStep("otp");           // ← show OTP step inline, don't navigate yet
    } catch (err) {
      setError(err?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        {/* Top Actions */}
        <div className="flex justify-between items-center mb-4">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="bg-white"
            size="icon"
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => {
              // ✅ NEW: Preserve redirect param when switching to login
              const loginUrl = redirectIntent
                ? `/parent-login?redirect=${encodeURIComponent(redirectIntent)}`
                : "/parent-login";
              navigate(loginUrl);
            }}
            variant="outline"
            className="bg-white"
            type="button"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Login
          </Button>
        </div>

        {/* ✅ NEW: Contextual banner when arriving from free-trial */}
        {redirectIntent === "free-trial" && (
          <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-center">
            <p className="text-sm text-indigo-700 font-medium">
              🎯 Create your free account to start your child's practice test
            </p>
            <p className="text-xs text-indigo-500 mt-1">
              Quick sign-up — then you'll set up your child's profile and begin
            </p>
          </div>
        )}

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Create Parent Account</CardTitle>
          </CardHeader>
           <CardContent>
            {/* ── Google Sign-In ── */}
            <div className="mb-2">
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={loading || !acceptedTerms}
              />
            </div>

            {/* ── Terms checkbox (enables Google Sign-In) ── */}
            <div className="flex items-center space-x-2 mb-4">
              <input
                id="accept-google-terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="accept-google-terms" className="text-xs text-gray-500 leading-snug">
                I agree to the{" "}
                <button type="button" onClick={() => setModalContent("terms")} className="text-xs text-indigo-600 underline hover:text-indigo-700">
                  Terms &amp; Conditions
                </button>{" "}
                and{" "}
                <button type="button" onClick={() => setModalContent("privacy")} className="text-xs text-indigo-600 underline hover:text-indigo-700">
                  Privacy Policy
                </button>
              </label>
            </div>

            {/* ── Divider ── */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-slate-400">or sign up with email</span>
              </div>
            </div>

          {step === "form" && ( 
            <form onSubmit={onSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )} 

              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  placeholder="Enter first name"
                />
              </div>

              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  placeholder="Enter last name"
                />
              </div>

              <div className="space-y-2">
                <Label>Email ID</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="parent@email.com"
                />
              </div>

              {/* ── Terms checkbox (synced with top checkbox) ── */}
              <div className="flex items-start space-x-2 text-xs">
                <input
                  id="accept-parent-terms-form"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="accept-parent-terms-form" className="text-xs text-gray-600 leading-snug">
                  I agree to the{" "}
                  <button type="button" onClick={() => setModalContent("terms")} className="text-xs text-indigo-600 underline hover:text-indigo-700">
                    Terms &amp; Conditions
                  </button>{" "}
                  and{" "}
                  <button type="button" onClick={() => setModalContent("privacy")} className="text-xs text-indigo-600 underline hover:text-indigo-700">
                    Privacy Policy
                  </button>
                </label>
              </div>

              <Button
                type="submit"
                disabled={!canSubmit || loading}
                className={`w-full ${
                  canSubmit && !loading
                    ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Create Account & Send OTP"
                )}
              </Button>
            </form>
          )}
          
          {step === "otp" && (
          <div className="mt-2">
            {/* Success banner */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 mb-4 flex items-start gap-3">
              <Mail className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-indigo-800">Check your email!</p>
                <p className="text-sm text-indigo-600 mt-0.5">
                  A 6-digit code has been sent to <strong>{sentTo}</strong>. Please copy and paste it below.
                </p>
              </div>
            </div>
              <div className="space-y-3">
                <Label htmlFor="otp-input">Verification Code</Label>
                <Input
                  id="otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                />
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleVerifyOtp}
                  disabled={otpCode.length !== 6 || loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Verify & Continue"}
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Didn't receive it?{" "}
                  <button type="button" onClick={onSubmit} className="text-indigo-600 font-medium hover:underline">
                    Resend
                  </button>
                </p>
              </div>
            </div>
          )}
      </CardContent>
        </Card>

        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account?{" "}
          <button
            onClick={() => {
              const loginUrl = redirectIntent
                ? `/parent-login?redirect=${encodeURIComponent(redirectIntent)}`
                : "/parent-login";
              navigate(loginUrl);
            }}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Log in
          </button>
        </p>
      </div>

      {/* Terms / Privacy Modals */}
      {modalContent === "terms" && (
        <Modal title="Terms & Conditions" onClose={() => setModalContent(null)}>
          <TermsAndConditions />
        </Modal>
      )}
      {modalContent === "privacy" && (
        <Modal title="Privacy Policy" onClose={() => setModalContent(null)}>
          <PrivacyPolicy />
        </Modal>
      )}
    </div>
  );
}