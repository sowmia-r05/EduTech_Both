// src/app/components/pages/ParentVerifyPage.jsx
//
// CHANGES FROM ORIGINAL:
//   ✅ After successful OTP verification, checks localStorage for "parent_signup_redirect"
//   ✅ If redirect=free-trial → navigates to /parent-dashboard?onboarding=free-trial
//     (so the dashboard can prompt child creation + free trial start)
//   ✅ Cleans up the redirect key from localStorage after consuming it
//   Everything else is IDENTICAL to the original.

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn, Mail, Clock } from "lucide-react";

import { verifyParentOtp, createParentAccount } from "@/app/utils/api";
import { useAuth } from "@/app/context/AuthContext";
import useOtpCountdown from "@/app/hooks/useOtpCountdown";
import OtpExpiredModal from "@/app/components/auth/OtpExpiredModal";

/* ── OTP expiry duration (must match backend OTP_TTL_MS) ── */
const OTP_DURATION_SECONDS = 5 * 60; // 5 minutes

/**
 * ✅ NEW: Helper to resolve the post-verification redirect destination.
 * Reads and clears the stored redirect intent from localStorage.
 */
function resolvePostVerifyRedirect() {
  const redirect = localStorage.getItem("parent_signup_redirect") || "";
  localStorage.removeItem("parent_signup_redirect"); // consume it

  switch (redirect) {
    case "free-trial":
      // Land on parent dashboard with onboarding param so the dashboard
      // can prompt "Add your child" → "Start free test" flow
      return "/parent-dashboard?onboarding=free-trial";
    default:
      return "/parent-dashboard";
  }
}

export default function ParentVerifyPage() {
  const navigate = useNavigate();
  const { loginParent } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [pendingEmail] = useState(
    () => localStorage.getItem("parent_pending_email") || ""
  );
  const [maskedEmail, setMaskedEmail] = useState(
    () => localStorage.getItem("parent_pending_masked") || ""
  );

  const [isVerifiedFlowComplete, setIsVerifiedFlowComplete] = useState(false);

  // ─── OTP expired modal ───
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  const pendingProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem("parent_pending_profile");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const displayEmail = useMemo(
    () => maskedEmail || pendingEmail || "your email",
    [maskedEmail, pendingEmail]
  );

  /* ── Validation flag ────── */
  const isOtpValid = useMemo(() => /^\d{6}$/.test(otp), [otp]);

  /* ── OTP Countdown ── */
  const handleOtpExpire = useCallback(() => {
    setShowExpiredModal(true);
  }, []);

  const { display: otpTimerDisplay, isExpired: isOtpExpired, restart: restartOtpTimer } =
    useOtpCountdown({
      durationSeconds: OTP_DURATION_SECONDS,
      onExpire: handleOtpExpire,
      enabled: !!pendingEmail && !showExpiredModal,
    });

  useEffect(() => {
    if (!pendingEmail && !isVerifiedFlowComplete) {
      navigate("/parent/create", { replace: true });
    }
  }, [pendingEmail, isVerifiedFlowComplete, navigate]);

  const onVerify = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (isOtpExpired) { setShowExpiredModal(true); return; }

    const cleanOtp = String(otp || "").trim();
    if (!cleanOtp) { setError("OTP required"); return; }
    if (!/^\d{6}$/.test(cleanOtp)) { setError("Please enter a valid 6-digit OTP."); return; }

    try {
      setLoading(true);
      const result = await verifyParentOtp({ email: pendingEmail, otp });

      // ✅ Works with cookie-based auth (no token in body) or token in body
      const token = result?.parent_token || result?.token || null;
      const parent = result?.parent || null;

      if (!token && !parent) throw new Error("Verification failed. Please try again.");

      loginParent(token, parent);


      localStorage.removeItem("parent_pending_email");
      localStorage.removeItem("parent_pending_masked");
      localStorage.removeItem("parent_pending_profile");

      // ✅ CHANGED: Use the redirect resolver instead of always going to /parent-dashboard
      const destination = resolvePostVerifyRedirect();
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setInfo("");
    setShowExpiredModal(false);

    if (!pendingProfile?.firstName || !pendingProfile?.lastName || !pendingProfile?.email) {
      setError("Missing signup details. Please go back and enter your details again.");
      return;
    }

    try {
      setResending(true);

      const res = await createParentAccount({
        firstName: pendingProfile.firstName,
        lastName: pendingProfile.lastName,
        email: pendingProfile.email,
      });

      const masked = res?.otp_sent_to || pendingProfile.email;
      localStorage.setItem("parent_pending_masked", masked);
      setMaskedEmail(masked);

      setInfo(`A new OTP has been sent to ${masked}`);
      setOtp("");
      restartOtpTimer();
    } catch (err) {
      setError(err?.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  };

  /* ── Expired modal: Go Back ── */
  const handleExpiredGoBack = () => {
    setShowExpiredModal(false);
    localStorage.removeItem("parent_pending_email");
    localStorage.removeItem("parent_pending_masked");
    localStorage.removeItem("parent_pending_profile");
    navigate("/parent/create", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4">
          <Button
            onClick={() => navigate("/parent/create")}
            variant="outline"
            className="bg-white"
            size="icon"
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => navigate("/parent-login")}
            variant="outline"
            className="bg-white"
            type="button"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Login
          </Button>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Verify Your Email</CardTitle>
          </CardHeader>

          <CardContent>
            {/* Status alerts */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert className="mb-4 border-indigo-200 bg-indigo-50 text-indigo-900">
                <Mail className="h-4 w-4" />
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            {/* Sent-to message */}
            <p className="text-sm text-gray-600 text-center mb-6">
              We've sent a 6-digit code to{" "}
              <span className="font-semibold text-indigo-600">{displayEmail}</span>.
              <br />
              Enter it below to verify your account.
            </p>

            <form onSubmit={onVerify} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="otp-input">Verification Code</Label>
                <Input
                  id="otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  disabled={loading}
                />
              </div>

              {/* Timer display */}
              {!isOtpExpired && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Code expires in {otpTimerDisplay}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={!isOtpValid || loading}
                className={`w-full ${
                  isOtpValid && !loading
                    ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Verify & Continue"
                )}
              </Button>
            </form>

            {/* Resend */}
            <div className="mt-4 text-center">
              <button
                onClick={handleResendOtp}
                disabled={resending}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {resending ? "Sending..." : "Resend OTP"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expired OTP Modal */}
      {showExpiredModal && (
        <OtpExpiredModal
          onResend={handleResendOtp}
          onGoBack={handleExpiredGoBack}
          resending={resending}
        />
      )}
    </div>
  );
}
