// src/app/components/pages/ParentLoginPage.jsx
import { useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, UserPlus, Mail, Clock } from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import { normalizeEmail } from "@/app/utils/api";
import useOtpCountdown from "@/app/hooks/useOtpCountdown";
import OtpExpiredModal from "@/app/components/auth/OtpExpiredModal";

/* ── Helpers ────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const looksLikeEmail = (e) => {
  const s = (e || "").trim();
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?$/.test(s);
};

async function requestLoginOtp(email) {
  const res = await fetch(`${API_BASE}/api/parents/auth/login-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizeEmail(email) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to send login OTP");
  return data;
}

async function verifyLoginOtp(email, otp) {
  const res = await fetch(`${API_BASE}/api/parents/auth/verify-login-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizeEmail(email), otp }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "OTP verification failed");
  return data;
}

/* ── OTP expiry duration (must match backend OTP_TTL_MS) ── */
const OTP_DURATION_SECONDS = 5 * 60; // 5 minutes

/* ── Component ──────────────────────────────────── */

export default function ParentLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginParent } = useAuth();

  // ─── Idle logout banner ───
  const wasIdleLogout = location.state?.idleLogout === true;

  const [step, setStep] = useState("email"); // "email" | "otp"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // ─── OTP expired modal ───
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  /* ── Validation flags ──── */
  const isEmailValid = useMemo(() => looksLikeEmail(email), [email]);
  const isOtpValid = useMemo(() => /^\d{6}$/.test(otp), [otp]);

  /* ── OTP Countdown (starts when step = "otp") ── */
  const handleOtpExpire = useCallback(() => {
    setShowExpiredModal(true);
  }, []);

  const { display: otpTimerDisplay, isExpired: isOtpExpired, restart: restartOtpTimer } =
    useOtpCountdown({
      durationSeconds: OTP_DURATION_SECONDS,
      onExpire: handleOtpExpire,
      enabled: step === "otp" && !showExpiredModal,
    });

  /* ── Step 1: Request OTP ──────────────────────── */
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const cleanEmail = (email || "").trim();
    if (!cleanEmail) { setError("Please enter your email address."); return; }
    if (!looksLikeEmail(cleanEmail)) { setError("Please enter a valid email address."); return; }

    try {
      setLoading(true);
      const result = await requestLoginOtp(cleanEmail);
      setMaskedEmail(result?.otp_sent_to || cleanEmail);
      setShowExpiredModal(false);
      setStep("otp");
    } catch (err) {
      if (
        err?.message?.toLowerCase().includes("not found") ||
        err?.message?.toLowerCase().includes("no account")
      ) {
        setError("No account found with this email. Please create an account first.");
      } else {
        setError(err?.message || "Failed to send login code.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 2: Verify OTP ───────────────────────── */
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (isOtpExpired) { setShowExpiredModal(true); return; }

    const cleanOtp = (otp || "").trim();
    if (!cleanOtp) { setError("Please enter the verification code."); return; }
    if (!/^\d{6}$/.test(cleanOtp)) { setError("Please enter a valid 6-digit code."); return; }

    try {
      setLoading(true);
      const res = await verifyLoginOtp(email, cleanOtp);
      const token = res?.parent_token || res?.token;
      const parent = res?.parent || res?.user || null;
      if (!token) throw new Error("Login token missing from server response.");

      loginParent(token, parent);
      navigate("/parent-dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Resend OTP ───────────────────────────────── */
  const handleResendOtp = async () => {
    setError("");
    setInfo("");
    setShowExpiredModal(false);

    try {
      setResending(true);
      const result = await requestLoginOtp(email);
      setMaskedEmail(result?.otp_sent_to || email);
      setInfo("A new verification code has been sent to your email.");
      setOtp("");
      restartOtpTimer();
    } catch (err) {
      setError(err?.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  /* ── Expired modal: Go Back ──── */
  const handleExpiredGoBack = () => {
    setShowExpiredModal(false);
    setStep("email");
    setOtp("");
    setError("");
    setInfo("");
  };

  /* ── Back handler ─────────────────────────────── */
  const handleBack = () => {
    if (step === "otp") {
      setStep("email");
      setOtp("");
      setError("");
      setInfo("");
    } else {
      navigate("/");
    }
  };

  /* ── Render ───────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4">
          <Button
            onClick={handleBack}
            variant="outline"
            className="bg-white"
            size="icon"
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => navigate("/parent/create")}
            variant="outline"
            className="bg-white"
            type="button"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Create Account
          </Button>
        </div>

        {/* ─── Idle-logout banner ─── */}
        {wasIdleLogout && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <span>Your session expired due to inactivity. Please log in again with a new OTP.</span>
          </div>
        )}

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {step === "email" ? "Parent Login" : "Verify OTP"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            {/* ── Error / Info Alerts ─── */}
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

            {/* ══════════════════════════════════════ */}
            {/*  Step 1: Email Form                    */}
            {/* ══════════════════════════════════════ */}
            {step === "email" && (
              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email ID</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="parent@email.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!isEmailValid || loading}
                  className={`w-full ${
                    isEmailValid && !loading
                      ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Send Login Code"
                  )}
                </Button>

                <p className="text-center text-sm text-slate-500 pt-2">
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/parent/create")}
                    className="text-indigo-600 font-medium hover:underline"
                  >
                    Create one
                  </button>
                </p>
              </form>
            )}

            {/* ══════════════════════════════════════ */}
            {/*  Step 2: OTP Form                      */}
            {/* ══════════════════════════════════════ */}
            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                {/* Email info card */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-indigo-100 p-2">
                      <Mail className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Enter OTP sent to</p>
                      <p className="text-sm font-medium text-gray-900 break-all">
                        {maskedEmail}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ─── OTP Countdown Timer ─── */}
                <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium ${
                  isOtpExpired
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                    : parseInt(otpTimerDisplay) <= 1
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                }`}>
                  <Clock className={`h-4 w-4 ${isOtpExpired ? "text-red-500" : ""}`} />
                  {isOtpExpired ? (
                    <span>OTP expired — please request a new code</span>
                  ) : (
                    <span>Code expires in <strong className="tabular-nums">{otpTimerDisplay}</strong></span>
                  )}
                </div>

                {/* OTP Input */}
                <div className="space-y-2">
                  <Label htmlFor="login-otp">6-Digit OTP</Label>
                  <Input
                    id="login-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    disabled={loading || isOtpExpired}
                    className="text-center tracking-[0.3em] text-lg"
                  />
                </div>

                {/* Verify button */}
                <Button
                  type="submit"
                  disabled={!isOtpValid || loading || isOtpExpired}
                  className={`w-full ${
                    isOtpValid && !loading && !isOtpExpired
                      ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Verify & Login"
                  )}
                </Button>

                {/* Resend */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleResendOtp}
                  disabled={resending || loading}
                >
                  {resending ? "Resending..." : "Resend OTP"}
                </Button>

                {/* Change email */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setOtp("");
                      setError("");
                      setInfo("");
                    }}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    Use a different email
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── OTP Expired Confirmation Modal ─── */}
      {showExpiredModal && (
        <OtpExpiredModal
          onRequestNewOtp={handleResendOtp}
          onGoBack={handleExpiredGoBack}
          loading={resending}
        />
      )}
    </div>
  );
}
