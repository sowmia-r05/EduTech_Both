import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2, ArrowLeft, LogIn, X } from "lucide-react";

import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy from "@/app/components/PrivacyPolicy";
import { createParentAccount, normalizeEmail } from "@/app/utils/api";

/**
 * Email format validation only
 */
const looksLikeEmail = (e) => {
  const s = (e || "").trim();
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*$/.test(s);
};

/* -----------------------------
   Modal Component
----------------------------- */
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white shadow-[0_25px_70px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 md:px-10 py-5 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-600 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 md:px-12 py-8 md:py-10 overflow-y-auto max-h-[70vh] text-gray-700 leading-relaxed space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
   Parent Create Page
----------------------------- */
export default function ParentCreatePage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedEmail = normalizeEmail(formData.email);

  const canSubmit =
    Boolean(formData.firstName.trim()) &&
    Boolean(formData.lastName.trim()) &&
    looksLikeEmail(normalizedEmail) &&
    acceptedTerms;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = normalizedEmail;

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      return;
    }

    if (!email) {
      setError("Email is required.");
      return;
    }

    if (!looksLikeEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the Terms & Privacy Policy to continue.");
      return;
    }

    try {
      setLoading(true);

      const result = await createParentAccount({
        firstName,
        lastName,
        email,
      });

      localStorage.setItem("parent_pending_email", email);
      localStorage.setItem("parent_pending_masked", result?.otp_sent_to || "");

      localStorage.setItem(
        "parent_pending_profile",
        JSON.stringify({ firstName, lastName, email })
      );

      navigate("/parent/verify");
    } catch (err) {
      setError(err?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        {/* Top Actions */}
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
            Login
          </Button>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Create Parent Account</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  placeholder="Enter first name"
                />
              </div>

              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  placeholder="Enter last name"
                />
              </div>

              <div className="space-y-2">
                <Label>Email ID</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="parent@email.com"
                />
              </div>

              <div className="flex items-start space-x-2 text-xs">
                <input
                  id="accept-parent-terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <label
                  htmlFor="accept-parent-terms"
                  className="leading-4 text-gray-700 text-xs"
                >
                  I agree to the{" "}
                  <span
                    onClick={() => setModalContent("terms")}
                    className="text-indigo-600 underline cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setModalContent("terms");
                      }
                    }}
                  >
                    Terms & Conditions
                  </span>{" "}
                  and{" "}
                  <span
                    onClick={() => setModalContent("privacy")}
                    className="text-indigo-600 underline cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setModalContent("privacy");
                      }
                    }}
                  >
                    Privacy Policy
                  </span>
                  .
                </label>
              </div>

              <Button
                className={`w-full ${
                  canSubmit
                    ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
                type="submit"
                disabled={!canSubmit || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Send OTP"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {modalContent === "terms" && (
        <Modal title="Terms & Conditions" onClose={() => setModalContent(null)}>
          <TermsAndConditions />
        </Modal>
      )}
      {modalContent === "privacy" && (
        <Modal title="Privacy Policy" onClose={() => setModalContent(null)}>
          <PrivacyPolicy />
        </Modal>
      )}
    </div>
  );
}