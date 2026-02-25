import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, ArrowLeft, Loader2, Mail, ArrowRight } from "lucide-react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOTP, verifyOTP, googleAuth, isAuthenticated } = useAuth();

  const from = location.state?.from?.pathname || "/parent-dashboard";

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated]);

  const [step, setStep] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isExisting, setIsExisting] = useState(true);
  const [emailMasked, setEmailMasked] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const googleBtnRef = useRef(null);

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Initialize Google Sign-In
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const loadGSI = () => {
      if (window.google?.accounts?.id) {
        initGoogle();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    };

    const initGoogle = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: "100%",
          text: "signin_with",
          logo_alignment: "center",
        });
      }
    };

    loadGSI();
  }, []);

  const handleGoogleResponse = async (response) => {
    setError("");
    setLoading(true);
    try {
      await googleAuth(response.credential);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Google sign-in failed");
    }
    setLoading(false);
  };

  const handleSendOTP = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    try {
      const data = await sendOTP(email.trim().toLowerCase());
      setIsExisting(data.is_existing);
      setEmailMasked(data.email_masked);
      setStep("otp");
      setCountdown(30);
    } catch (err) {
      setError(err.message || "Failed to send code");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e?.preventDefault();
    setError("");
    if (!otp.trim() || otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyOTP({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      if (result.is_new) {
        // New user — send to register to collect name
        navigate("/register", { state: { email: email.trim().toLowerCase(), verified: true }, replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message || "Verification failed");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError("");
    setLoading(true);
    try {
      await sendOTP(email.trim().toLowerCase());
      setCountdown(30);
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
    setLoading(false);
  };

  const handleChangeEmail = () => {
    setStep("email");
    setOtp("");
    setError("");
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
            <CardTitle className="text-2xl">
              {step === "email" ? "Sign In" : "Enter Code"}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {step === "email"
                ? "Sign in or create an account"
                : `We sent a 6-digit code to ${emailMasked}`}
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === "email" ? (
              <>
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      disabled={loading}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Login Code
                      </>
                    )}
                  </Button>
                </form>

                {/* Divider */}
                {GOOGLE_CLIENT_ID && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-3 text-gray-400">or</span>
                      </div>
                    </div>

                    {/* Google Sign-In button (rendered by Google SDK) */}
                    <div ref={googleBtnRef} className="flex justify-center" />
                  </>
                )}

                <p className="text-center text-xs text-gray-400 mt-4">
                  New here? Just enter your email — we'll create an account for you.
                </p>
              </>
            ) : (
              /* OTP Step */
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">6-Digit Code</Label>
                  <Input
                    id="otp"
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

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Verify Code
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || loading}
                    className={`${
                      countdown > 0 ? "text-gray-300" : "text-indigo-600 hover:text-indigo-700"
                    }`}
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
