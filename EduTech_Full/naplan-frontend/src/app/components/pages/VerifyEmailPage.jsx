import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found.");
      return;
    }

    const verify = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center text-center py-6">
          {status === "verifying" && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
              <p className="text-gray-600">Verifying your email...</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-gray-900 font-medium mb-1">{message}</p>
              <p className="text-sm text-gray-500 mb-6">You can now access all features.</p>
              <Button onClick={() => navigate("/parent-dashboard")} className="bg-indigo-600 hover:bg-indigo-700">
                Go to Dashboard
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-gray-900 font-medium mb-1">{message}</p>
              <p className="text-sm text-gray-500 mb-6">The link may have expired or already been used.</p>
              <Link to="/login">
                <Button className="bg-indigo-600 hover:bg-indigo-700">Go to Login</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
