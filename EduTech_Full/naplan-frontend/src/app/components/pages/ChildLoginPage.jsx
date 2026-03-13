import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn } from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import { childLogin } from "@/app/utils/api-children";

export default function ChildLoginPage() {
  const navigate = useNavigate();
  const { loginChild } = useAuth();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ── Validation flag (drives button color) ────── */
  const canSubmit = useMemo(
    () => username.trim().length >= 3 && pin.trim().length >= 4,
    [username, pin]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUsername) {
      setError("Please enter your username");
      return;
    }
    if (!cleanPin) {
      setError("Please enter your PIN");
      return;
    }

    try {
      setLoading(true);
      const res = await childLogin({ username: cleanUsername, pin: cleanPin });
      loginChild(res.token, res.child);
      navigate("/child-dashboard");
    } catch (err) {
      setError(err.message || "Login failed. Check your username and PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        {/* Top bar — same layout as ParentLoginPage */}
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
            onClick={() => navigate("/parent-login")}
            variant="outline"
            className="bg-white"
            type="button"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Parent Login
          </Button>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Student Login</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="child-username">Username</Label>
                <Input
                  id="child-username"
                  type="text"
                  placeholder="e.g. Chris_1"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                    )
                  }
                  disabled={loading}
                />
              </div>

              {/* PIN */}
              <div className="space-y-2">
                <Label htmlFor="child-pin">PIN</Label>
                <Input
                  id="child-pin"
                  type="password"
                  inputMode="numeric"
                  placeholder="Enter your PIN"
                  autoComplete="current-password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={loading}
                  className="text-center tracking-[0.3em] text-lg"
                />
              </div>

              {/* Submit — gray → indigo (same as ParentLoginPage) */}
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
                  "Let's Go!"
                )}
              </Button>

              {/* Back link */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-sm text-slate-500 hover:text-indigo-600 transition"
                >
                  &larr; Back to home
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}