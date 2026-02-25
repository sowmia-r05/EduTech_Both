import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn, Mail } from "lucide-react";

import { verifyParentOtp, createParentAccount } from "@/app/utils/api";

export default function ParentVerifyPage() {
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const pendingEmail = localStorage.getItem("parent_pending_email") || "";
  const masked = localStorage.getItem("parent_pending_masked") || "";

  const pendingProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem("parent_pending_profile");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const displayEmail = useMemo(
    () => masked || pendingEmail || "your email",
    [masked, pendingEmail]
  );

  useEffect(() => {
    if (!pendingEmail) navigate("/parent/create");
  }, [pendingEmail, navigate]);

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

      localStorage.setItem("parent_token", res.parent_token);

      // optional: save parent profile returned by backend
      if (res?.parent) {
        localStorage.setItem("parent_profile", JSON.stringify(res.parent));
      }

      localStorage.removeItem("parent_pending_email");
      localStorage.removeItem("parent_pending_masked");
      localStorage.removeItem("parent_pending_profile");

      navigate("/dashboard");
    } catch (err) {
      setError(err?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => navigate("/parent/create");

  const handleLogin = () => {
    // Change route if needed
    navigate("/parent/login");
    // or navigate("/respondent");
  };

  const handleChangeEmail = () => {
    // User goes back to edit email/name fields
    navigate("/parent/create");
  };

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

      localStorage.setItem("parent_pending_masked", res?.otp_sent_to || "");
      setInfo(`A new OTP has been sent to ${res?.otp_sent_to || pendingProfile.email}`);
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
        {/* Top bar same as create page */}
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
                    <p className="text-sm font-medium text-gray-900 break-all">
                      {displayEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* OTP */}
              <div className="space-y-2">
                <Label>OTP</Label>
                <Input
                  value={otp}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(digits);
                  }}
                  placeholder="6-digit OTP"
                  inputMode="numeric"
                  maxLength={6}
                  className="bg-slate-100 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>

              {/* Action Row (like your screenshot) */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleChangeEmail}
                  disabled={loading || resending}
                >
                  Change Email
                </Button>

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={loading || resending}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Verify & Continue"
                  )}
                </Button>
              </div>

              {/* Resend OTP (full-width) */}
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900"
                onClick={handleResendOtp}
                disabled={loading || resending}
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Resend OTP"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}