import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn, Mail } from "lucide-react";

import { verifyParentOtp, createParentAccount } from "@/app/utils/api";
import { useAuth } from "@/app/context/AuthContext";

export default function ParentVerifyPage() {
  const navigate = useNavigate();
  const { loginParent } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // ✅ Read once (prevents localStorage cleanup causing redirect race)
  const [pendingEmail] = useState(
    () => localStorage.getItem("parent_pending_email") || ""
  );
  const [maskedEmail, setMaskedEmail] = useState(
    () => localStorage.getItem("parent_pending_masked") || ""
  );

  // ✅ Guard flag to avoid redirect effect after successful verification
  const [isVerifiedFlowComplete, setIsVerifiedFlowComplete] = useState(false);

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

  useEffect(() => {
    // ✅ only redirect if user truly landed here without pending email
    // and NOT during/after successful verification flow
    if (!pendingEmail && !isVerifiedFlowComplete) {
      navigate("/parent/create", { replace: true });
    }
  }, [pendingEmail, isVerifiedFlowComplete, navigate]);

  const onVerify = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const cleanOtp = String(otp || "").trim();

    if (!cleanOtp) {
      setError("OTP required");
      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter a valid 6-digit OTP.");
      return;
    }

    try {
      setLoading(true);

      const res = await verifyParentOtp({
        email: pendingEmail,
        otp: cleanOtp,
      });

      // ✅ Be defensive in case backend response keys vary
      const token = res?.parent_token || res?.token;
      const parent = res?.parent || res?.user || null;

      if (!token) {
        throw new Error("Login token missing in OTP verification response");
      }

      // ✅ Save auth in context + localStorage
      loginParent(token, parent);

      // ✅ Mark flow complete BEFORE cleanup (prevents redirect race)
      setIsVerifiedFlowComplete(true);

      // Clean up pending signup state
      localStorage.removeItem("parent_pending_email");
      localStorage.removeItem("parent_pending_masked");
      localStorage.removeItem("parent_pending_profile");

      // ✅ Go to parent dashboard
      navigate("/parent-dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => navigate("/parent/create");
  const handleLogin = () => navigate("/parent/create");

  const handleResendOtp = async () => {
    setError("");
    setInfo("");

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
    } catch (err) {
      setError(err?.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  };

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
            onClick={handleLogin}
            variant="outline"
            className="bg-white"
            type="button"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Login
          </Button>
        </div>

        <Card className="bg-white shadow-lg border border-gray-200">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Verify OTP</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={onVerify} className="space-y-5">
              {/* Error */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Info */}
              {info && (
                <Alert className="border-indigo-200 bg-indigo-50 text-indigo-900">
                  <Mail className="h-4 w-4" />
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              )}

              {/* Email info card */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-indigo-100 p-2">
                    <Mail className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Enter OTP sent to</p>
                    <p className="text-sm font-medium text-gray-900 break-all">{displayEmail}</p>
                  </div>
                </div>
              </div>

              {/* OTP Input */}
              <div className="space-y-2">
                <Label htmlFor="otp">6-Digit OTP</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center tracking-[0.3em] text-lg"
                />
              </div>

              {/* Verify */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Verify & Continue"
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
                  onClick={handleBack}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Use a different email
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}