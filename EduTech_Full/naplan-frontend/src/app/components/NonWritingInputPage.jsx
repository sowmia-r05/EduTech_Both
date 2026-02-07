import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import StudentImg from "@/app/Images/Faq-analytics.svg";
import AnalyticsImg from "@/app/Images/fetch-data.svg";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Loader2, Mail } from "lucide-react";

import {
  fetchResultQuizNamesByEmail,
  normalizeEmail,
  verifyEmailExists,
} from "@/app/utils/api";

/* -----------------------------
   Helpers
----------------------------- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

/* -----------------------------
   Component
----------------------------- */
export default function NonWritingInputPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoSubmittedRef = useRef(false);

  const [email, setEmail] = useState("");
  const [quizNames, setQuizNames] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [step, setStep] = useState("email"); // email | quiz
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* -----------------------------
     Prefill email from URL
  ----------------------------- */
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(normalizeEmail(emailParam));
    }
  }, [searchParams]);

  /* -----------------------------
     Auto-submit ONLY for URL email
  ----------------------------- */
  useEffect(() => {
    if (!email || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    handleSubmitEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  /* -----------------------------
     Actions
  ----------------------------- */
  const handleSubmitEmail = async () => {
    const normalized = normalizeEmail(email);

    if (!isValidEmail(normalized)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError("");
    setQuizNames([]);
    setSelectedQuiz("");

    try {
      let exists = true;
      try {
        exists = await verifyEmailExists(normalized);
      } catch {
        // silent fallback
      }

      if (!exists) {
        throw new Error(
          "Email not found. Please use the same email used during quiz registration."
        );
      }

      const quizzes = await fetchResultQuizNamesByEmail(normalized);

      if (!quizzes || quizzes.length === 0) {
        throw new Error("No quiz results found for this email.");
      }

      setQuizNames(quizzes);
      setStep("quiz");
    } catch (err) {
      setError(err?.message || "Failed to fetch quiz names.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    autoSubmittedRef.current = true;
    handleSubmitEmail();
  };

  const handleQuizSubmit = (e) => {
    e.preventDefault();
    if (!selectedQuiz) return;

    navigate(
      `/NonWritingLookupQuizResults/results?email=${encodeURIComponent(
        normalizeEmail(email)
      )}&quiz=${encodeURIComponent(selectedQuiz)}`
    );
  };

  const handleBack = () => {
    setStep("email");
    setQuizNames([]);
    setSelectedQuiz("");
    setError("");
  };

  /* -----------------------------
     Render
  ----------------------------- */
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 overflow-hidden flex items-center justify-center px-6">
      <img
        src={StudentImg}
        alt=""
        className="hidden xl:block absolute left-[-120px] top-1/2 -translate-y-1/2 w-[520px] opacity-60 pointer-events-none"
      />
      <img
        src={AnalyticsImg}
        alt=""
        className="hidden xl:block absolute right-[-120px] top-1/2 -translate-y-1/2 w-[520px] opacity-50 pointer-events-none"
      />

      <Card className="relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl bg-white/90 backdrop-blur-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-semibold">
            User Evaluation Lookup
          </CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your email to view your non-writing quizzes"
              : "Select a quiz to view your evaluation results"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <Label>Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  disabled={loading}
                  className="pl-9"
                  placeholder="you@example.com"
                  onChange={(e) => {
                    autoSubmittedRef.current = true;
                    setEmail(e.target.value);
                    setError("");
                  }}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching quizzes…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleQuizSubmit} className="space-y-6">
              <Label>Email</Label>
              <Input value={normalizeEmail(email)} disabled />

              <Label>Select quiz</Label>
              <Select value={selectedQuiz} onValueChange={setSelectedQuiz}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a quiz" />
                </SelectTrigger>
                <SelectContent>
                  {quizNames.map((quiz) => (
                    <SelectItem key={quiz} value={quiz}>
                      {quiz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!selectedQuiz}
                >
                  View Results
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
