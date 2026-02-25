import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { CheckCircle, Loader2, PartyPopper } from "lucide-react";

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [purchase, setPurchase] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    const verify = async () => {
      try {
        const data = await authFetch(`/api/payments/verify?session_id=${sessionId}`);
        setPurchase(data);
        setStatus(data.status === "paid" ? "success" : "verifying");

        // If still pending, poll a few times (webhook may not have fired yet)
        if (data.status === "pending") {
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const d = await authFetch(`/api/payments/verify?session_id=${sessionId}`);
              if (d.status === "paid") {
                setPurchase(d);
                setStatus("success");
                clearInterval(poll);
              }
              if (attempts >= 10) {
                setStatus("success"); // Assume success after Stripe redirect
                clearInterval(poll);
              }
            } catch {
              clearInterval(poll);
            }
          }, 2000);
        }
      } catch {
        setStatus("error");
      }
    };

    verify();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-lg">
        <CardContent className="flex flex-col items-center text-center py-10 px-6">
          {status === "verifying" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing Payment...</h2>
              <p className="text-sm text-gray-500">Please wait while we confirm your purchase.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="h-9 w-9 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h2>
              {purchase && (
                <p className="text-sm text-gray-500 mb-1">
                  {purchase.bundle_name} — ${(purchase.amount_cents / 100).toFixed(2)} AUD
                </p>
              )}
              <p className="text-sm text-gray-500 mb-6">
                Your child's quizzes are being set up. This may take a moment.
              </p>
              <Button
                onClick={() => navigate("/parent-dashboard")}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Go to Dashboard
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-sm text-gray-500 mb-6">
                We couldn't verify your payment. If you were charged, your purchase will still be processed.
              </p>
              <Button
                onClick={() => navigate("/parent-dashboard")}
                variant="outline"
              >
                Go to Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
