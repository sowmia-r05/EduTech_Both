import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, Mail } from "lucide-react";

/**
 * RegisterPage — Two modes:
 *
 * MODE A (from LoginPage redirect): email already verified via OTP.
 *   → Just collect first_name + last_name, then call verify-otp again with name.
 *
 * MODE B (direct visit): full flow — email → OTP → name → create account.
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOTP, verifyOTP, isAuthenticated } = useAuth();

  // If redirected from LoginPage with verified email
  const preVerifiedEmail = location.state?.email || "";
  const preVerified = !!location.state?.verified;

  const [step, setStep] = useState(preVerified ? "name" : "email"); // email | otp | name
  const [email, setEmail] = useState(preVerifiedEmail);
  const [otp, setOtp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [emailMasked, setEmailMasked] = useState("");

  useEffect(() => {
    if (isAuthenticated) navigate("/parent-dashboard", { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Step 1: Send OTP
  const handleSendOTP = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required"); return; }

    setLoading(true);
    try {
      const data = await sendOTP(email.trim().toLowerCase());

      if (data.is_existing) {
        // Already has an account — redirect to login
        navigate("/login", { replace: true });
        return;
      }

      setEmailMasked(data.email_masked);
      setStep("otp");
      setCountdown(30);
    } catch (err) {
      setError(err.message || "Failed to send code");
    }
    setLoading(false);
  };

  // Step 2: Verify OTP → show name fields
  const handleVerifyOTP = async (e) => {
    e?.preventDefault();
    setError("");
    if (otp.length !== 6) { setError("Please enter the 6-digit code"); return; }

    // We don't actually call verify-otp yet — we need the name first.
    // Just move to name step (OTP will be verified with the name in step 3)
    setStep("name");
  };

  // Step 3: Submit name + create account
  const handleCreateAccount = async (e) => {
    e?.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required");
      return;
    }

    setLoading(true);
    try {
      // If pre-verified (from LoginPage), the OTP was already validated there
      // and the backend returned is_new=true. We need to re-send OTP and verify with name.
      if (preVerified) {
        // Re-send OTP for the verified email, then user needs to enter code
        // Actually — the LoginPage already called verify-otp which returned is_new
        // but didn't create the account because name was missing.
        // We need to re-do the OTP flow with name included.
        // Send a fresh OTP:
        await sendOTP(email.trim().toLowerCase());
        setStep("otp_final");
        setCountdown(30);
        setLoading(false);
        return;
      }

      // Normal flow: we have the OTP from step 2
      await verifyOTP({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });

      navigate("/parent-dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to create account");
    }
    setLoading(false);
  };

  // Final OTP verification (for pre-verified flow)
  const handleFinalVerify = async (e) => {
    e?.preventDefault();
    setError("");
    if (otp.length !== 6) { setError("Please enter the 6-digit code"); return; }

    setLoading(true);
    try {
      await verifyOTP({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      navigate("/parent-dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to create account");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button onClick={() => navigate("/")} variant="outline" size="icon" className="bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {step === "email" && "Enter your email to get started"}
              {step === "otp" && `Enter the code sent to ${emailMasked}`}
              {step === "name" && "One last step — tell us your name"}
              {step === "otp_final" && `Verify your email to complete registration`}
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step: Email */}
            {step === "email" && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg_email">Email</Label>
                  <Input
                    id="reg_email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading || !email.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <><Mail className="h-4 w-4 mr-2" />Send Verification Code</>
                  )}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  Already have an account?{" "}
                  <button onClick={() => navigate("/login")} className="text-indigo-600 hover:underline font-medium">Sign in</button>
                </p>
              </form>
            )}

            {/* Step: OTP */}
            {(step === "otp" || step === "otp_final") && (
              <form onSubmit={step === "otp_final" ? handleFinalVerify : handleVerifyOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg_otp">6-Digit Code</Label>
                  <Input
                    id="reg_otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    disabled={loading}
                    autoFocus
                    className="text-center text-2xl tracking-[0.4em] font-mono"
                  />
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading || otp.length !== 6}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (step === "otp_final" ? "Create Account" : "Verify Code")}
                </Button>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      if (countdown > 0) return;
                      try { await sendOTP(email.trim().toLowerCase()); setCountdown(30); } catch {}
                    }}
                    disabled={countdown > 0}
                    className={`text-sm ${countdown > 0 ? "text-gray-300" : "text-indigo-600 hover:text-indigo-700"}`}
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}

            {/* Step: Name */}
            {step === "name" && (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="reg_first">First Name</Label>
                    <Input
                      id="reg_first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg_last">Last Name</Label>
                    <Input
                      id="reg_last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      disabled={loading}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={loading || !firstName.trim() || !lastName.trim()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
