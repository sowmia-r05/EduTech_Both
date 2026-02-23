import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, X } from "lucide-react";

import TermsAndConditions from "@/app/components/TermsAndConditions";
import PrivacyPolicy from "@/app/components/PrivacyPolicy";
import { verifyEmailExists, normalizeEmail } from "@/app/utils/api";

/* -----------------------------
   GLOBAL EMAIL CACHE
----------------------------- */
const emailCache = new Map();

const looksLikeEmail = (e) => {
  const basic = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*$/.test(e);
  if (!basic) return false;
  if (/@gmail\.(?!com$)/i.test(e)) return false;
  return true;
};

/* -----------------------------
   Modal Component
----------------------------- */
/* -----------------------------
   Modal Component
----------------------------- */
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white shadow-[0_25px_70px_rgba(0,0,0,0.15)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-6 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
          <h2 className="text-2xl font-semibold text-indigo-600 tracking-tight">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body (Natural Scroll) */}
        <div className="px-12 py-10 overflow-y-auto max-h-[70vh] text-gray-700 leading-relaxed space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
   Registration Page
----------------------------- */
export default function RegistrationPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    yearLevel: "",
    email: "",
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [emailStatus, setEmailStatus] = useState("idle"); // idle | checking | exists | available
  const [modalContent, setModalContent] = useState(null); // "terms" | "privacy" | null

  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  /* -----------------------------
     EMAIL CHECK (debounced + cached + abort-safe)
  ----------------------------- */
  useEffect(() => {
    const email = normalizeEmail(formData.email);

    if (!email || !looksLikeEmail(email)) {
      setEmailStatus("idle");
      return;
    }

    const cached = emailCache.get(email);
    if (cached) {
      setEmailStatus(cached);
      return;
    }

    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setEmailStatus("checking");

        const exists = await verifyEmailExists(email, {
          signal: abortRef.current.signal,
        });

        const status = exists ? "exists" : "available";
        emailCache.set(email, status);
        setEmailStatus(status);
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Email check failed:", err);
        setEmailStatus("idle");
      }
    }, 150);

    return () => clearTimeout(debounceRef.current);
  }, [formData.email]);

  /* -----------------------------
     FORM VALIDITY
  ----------------------------- */
  const isFormValid =
    formData.firstName &&
    formData.lastName &&
    formData.yearLevel &&
    looksLikeEmail(normalizeEmail(formData.email)) &&
    emailStatus === "available" &&
    acceptedTerms;

  /* -----------------------------
     SUBMIT
  ----------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isFormValid) {
      setError(
        "Please fill all fields correctly and accept Terms & Privacy Policy."
      );
      return;
    }

    const normalizedEmail = normalizeEmail(formData.email);
    localStorage.setItem(
      "currentStudent",
      JSON.stringify({ ...formData, email: normalizedEmail })
    );

    const gradeUrls = {
      "Year 3": "https://www.flexiquiz.com/SC/buy-course/Grade3_set-1",
      "Year 5": "",
      "Year 7": "",
      "Year 9": "",
    };

    const url = gradeUrls[formData.yearLevel];
    if (url) {
      window.location.assign(url);
    } else {
      setError(`FlexiQuiz link not added yet for ${formData.yearLevel}`);
    }
  };

  const handleLogin = () => navigate("/respondent");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="bg-white"
            size="icon"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Button onClick={handleLogin} variant="outline" className="bg-white">
            Login
          </Button>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">User Information</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* First Name */}
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </div>

              {/* Last Name */}
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                />
              </div>

              {/* Year Level */}
              <div className="space-y-2">
                <Label>Year Level</Label>
                <Select
                  value={formData.yearLevel}
                  onValueChange={(value) =>
                    setFormData({ ...formData, yearLevel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select year level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Year 3">Year 3</SelectItem>
                    <SelectItem value="Year 5">Year 5</SelectItem>
                    <SelectItem value="Year 7">Year 7</SelectItem>
                    <SelectItem value="Year 9">Year 9</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />

                {emailStatus === "checking" && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>Checking email…</AlertDescription>
                  </Alert>
                )}

                {emailStatus === "exists" && (
                  <Alert>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>Email already exists. Please login.</AlertDescription>
                  </Alert>
                )}

                {emailStatus === "available" && (
                  <Alert className="border-green-200 text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>Email is available</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Terms & Privacy */}
              <div className="flex items-start space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1"
                />
                <p>
                  I agree to the{" "}
                  <span
                    onClick={() => setModalContent("terms")}
                    className="text-indigo-600 underline cursor-pointer"
                  >
                    Terms & Conditions
                  </span>{" "}
                  and{" "}
                  <span
                    onClick={() => setModalContent("privacy")}
                    className="text-indigo-600 underline cursor-pointer"
                  >
                    Privacy Policy
                  </span>
                </p>
              </div>

              {/* Next Button */}
              <Button
                type="submit"
                className={`w-full ${
                  isFormValid
                    ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
                disabled={!isFormValid}
              >
                {emailStatus === "checking" ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Next"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
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