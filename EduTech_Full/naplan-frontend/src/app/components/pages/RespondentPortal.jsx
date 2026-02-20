import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

import {
  requestOtpByUsername,
  verifyOtpByUsername,
  normalizeUsername,
} from "@/app/utils/api";

export default function RespondentPortal() {
  const savedUsername = useMemo(() => {
    try {
      return localStorage.getItem("naplan_username") || "";
    } catch {
      return "";
    }
  }, []);

  const [username, setUsername] = useState(savedUsername);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("username"); // "username" | "otp"
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const apiBase = import.meta.env.VITE_API_BASE_URL || "";

  const resetMessages = () => {
    setErr("");
    setMsg("");
  };

  const sendOtp = async () => {
    resetMessages();

    const u = normalizeUsername(username);
    if (!u) {
      setErr("Please enter your username");
      return;
    }

    setLoading(true);
    try {
      const resp = await requestOtpByUsername(u);

      try {
        localStorage.setItem("naplan_username", u);
      } catch {}

      setStep("otp");

      const masked = resp?.email_masked ? ` (${resp.email_masked})` : "";
      setMsg(`OTP sent${masked}. Check your email (Inbox/Spam).`);
    } catch (ex) {
      setErr(ex?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    resetMessages();

    const u = normalizeUsername(username);
    if (!u) {
      setErr("Please enter your username");
      return;
    }
    if (!otp || otp.length < 4) {
      setErr("Please enter the OTP");
      return;
    }

    setLoading(true);
    try {
      const loginToken = await verifyOtpByUsername(u, otp);

      // ✅ Redirect to secure SSO endpoint
      window.location.href = `${apiBase}/api/flexiquiz/sso?login_token=${encodeURIComponent(
        loginToken
      )}`;
    } catch (ex) {
      setErr(ex?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const changeUsername = () => {
    setStep("username");
    setOtp("");
    resetMessages();
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {step === "username"
              ? "Enter your username and we’ll send an OTP to your registered email."
              : "Enter the OTP sent to your email to continue."}
          </p>

          {msg ? (
            <Alert className="border-green-200 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          ) : null}

          {err ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                resetMessages();
              }}
              placeholder="Enter your username"
              disabled={loading || step === "otp"} // lock after OTP sent
            />
          </div>

          {step === "otp" ? (
            <div className="space-y-2 min-w-0">
              <Label htmlFor="otp">OTP</Label>
              <Input
                id="otp"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                  resetMessages();
                }}
                placeholder="6-digit OTP"
                inputMode="numeric"
                autoComplete="one-time-code"
              />

              {/* ✅ Fixed alignment: stack on small screens, side-by-side on md+ */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={changeUsername}
                  disabled={loading}
                >
                  Change Username
                </Button>

                <Button
                  type="button"
                  className="w-full"
                  onClick={submitOtp}
                  disabled={loading}
                >
                  {loading ? "Verifying..." : "Verify & Continue"}
                </Button>
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={sendOtp}
                disabled={loading}
              >
                Resend OTP
              </Button>
            </div>
          ) : (
            <Button onClick={sendOtp} className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send OTP"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
