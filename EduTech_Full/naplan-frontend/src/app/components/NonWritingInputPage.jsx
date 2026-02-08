import { useState, useEffect, useRef, useCallback } from "react";
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

export default function NonWritingInputPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const autoSubmittedRef = useRef(false);
  const quizCacheRef = useRef(new Map());

  const [email, setEmail] = useState("");
  const [quizNames, setQuizNames] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* -----------------------------
     Core Fetch Logic
  ----------------------------- */
  const submitEmail = useCallback(async (emailValue) => {
    const normalized = normalizeEmail(emailValue);

    if (!isValidEmail(normalized)) {
      setError("Please enter a valid email address");
      return;
    }

    // 🔥 CACHE HIT
    if (quizCacheRef.current.has(normalized)) {
      setQuizNames(quizCacheRef.current.get(normalized));
      setStep("quiz");
      return;
    }

    setLoading(true);
    setError("");
    setSelectedQuiz("");

    try {
      // ⚡ PARALLEL REQUESTS
      const [exists, quizzes] = await Promise.all([
        verifyEmailExists(normalized).catch(() => true),
        fetchResultQuizNamesByEmail(normalized),
      ]);

      if (!exists) {
        throw new Error(
          "Email not found. Please use the same email used during quiz registration."
        );
      }

      if (!quizzes || quizzes.length === 0) {
        throw new Error("No quiz results found for this email.");
      }

      quizCacheRef.current.set(normalized, quizzes);
      setQuizNames(quizzes);
      setStep("quiz");
    } catch (err) {
      setError(err?.message || "Failed to fetch quiz names.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* -----------------------------
     Auto-submit from URL
  ----------------------------- */
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (!emailParam || autoSubmittedRef.current) return;

    const normalized = normalizeEmail(emailParam);
    autoSubmittedRef.current = true;
    setEmail(normalized);
    submitEmail(normalized);
  }, [searchParams, submitEmail]);

  /* -----------------------------
     Handlers
  ----------------------------- */
  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!loading) submitEmail(email);
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
    setError("");
  };

  /* -----------------------------
     Render
  ----------------------------- */
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-6">
      <img
        src={StudentImg}
        alt=""
        className="hidden xl:block absolute left-[-120px] top-1/2 -translate-y-1/2 w-[520px] opacity-60"
      />
      <img
        src={AnalyticsImg}
        alt=""
        className="hidden xl:block absolute right-[-120px] top-1/2 -translate-y-1/2 w-[520px] opacity-50"
      />

      <Card className="w-full max-w-lg rounded-2xl shadow-2xl bg-white/90 backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle>User Evaluation Lookup</CardTitle>
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
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button type="submit" disabled={!selectedQuiz}>
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
