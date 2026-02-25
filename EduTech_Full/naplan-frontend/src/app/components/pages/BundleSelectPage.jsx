import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import {
  ArrowLeft, Loader2, CheckCircle, BookOpen, AlertCircle,
} from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV ? "" : "http://localhost:3000";

export default function BundleSelectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const childId = searchParams.get("childId");
  const yearLevel = searchParams.get("year");

  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // bundle_id being purchased
  const [error, setError] = useState("");

  useEffect(() => {
    const loadBundles = async () => {
      try {
        const params = yearLevel ? `?year_level=${yearLevel}` : "";
        const res = await fetch(`${API_BASE}/api/catalog/bundles${params}`);
        const data = await res.json();
        setBundles(data.bundles || []);
      } catch (err) {
        setError("Failed to load bundles");
      }
      setLoading(false);
    };
    loadBundles();
  }, [yearLevel]);

  const handlePurchase = async (bundle) => {
    if (!childId) {
      setError("No child selected. Please go back and try again.");
      return;
    }

    setError("");
    setCheckoutLoading(bundle.bundle_id);

    try {
      const data = await authFetch("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({
          bundle_id: bundle.bundle_id,
          child_ids: [childId],
        }),
      });

      // Redirect to Stripe Checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError("Failed to create checkout session");
      }
    } catch (err) {
      setError(err.message || "Failed to start checkout");
    }
    setCheckoutLoading(null);
  };

  const formatPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/parent-dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">Choose a Bundle</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : bundles.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No bundles available for this year level yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {bundles.map((bundle) => (
              <Card
                key={bundle.bundle_id}
                className="hover:shadow-lg transition-shadow relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{bundle.bundle_name}</CardTitle>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      Year {bundle.year_level}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{bundle.description}</p>
                </CardHeader>

                <CardContent>
                  {/* Subjects */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(bundle.subjects || []).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Price + CTA */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div>
                      <span className="text-2xl font-bold text-gray-900">
                        {formatPrice(bundle.price_cents)}
                      </span>
                      <span className="text-sm text-gray-400 ml-1">AUD</span>
                    </div>

                    <Button
                      onClick={() => handlePurchase(bundle)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                      disabled={checkoutLoading === bundle.bundle_id}
                    >
                      {checkoutLoading === bundle.bundle_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Purchase"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          Payments are processed securely by Stripe. You'll be redirected to a secure checkout page.
        </p>
      </main>
    </div>
  );
}
