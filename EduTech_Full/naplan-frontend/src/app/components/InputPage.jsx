import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
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

import StudentImg from "@/app/Images/Faq-analytics.svg";
import AnalyticsImg from "@/app/Images/fetch-data.svg";

import {
  fetchQuizNamesByEmail,
  normalizeEmail,
  // verifyEmailExists, // ❌ don’t use as hard blocker
} from "@/app/utils/api";

/* -----------------------------
   Helpers
----------------------------- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollQuizNamesByEmail({
  email,
  fetcher,
  intervalMs = 4000,
  maxMs = 120000, // ✅ 2 minutes (change to 180000 for 3 minutes)
  signal,
}) {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    if (signal?.aborted) throw new Error("ABORTED");

    let quizzes = [];
    try {
      quizzes = await fetcher(email);
    } catch {
      quizzes = [];
    }

    if (Array.isArray(quizzes) && quizzes.length > 0) return quizzes;

    await sleep(intervalMs);
  }

  throw new Error("TIMEOUT");
}

export default function InputPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoSubmittedRef = useRef(false);
  const pollAbortRef = useRef(null);

  const [email, setEmail] = useState("");
  const [quizNames, setQuizNames] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [step, setStep] = useState("email");

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false); // ✅ new
  const [info, setInfo] = useState(""); // ✅ new
  const [error, setError] = useState("");

  /* -----------------------------
     Submit Email
  ----------------------------- */
  const submitEmail = useCallback(async (emailValue) => {
    const eNorm = normalizeEmail(emailValue);

    if (!isValidEmail(eNorm)) {
      setError("Please enter a valid email address");
      setInfo("");
      return;
    }

    // stop any existing poll
    if (pollAbortRef.current) pollAbortRef.current.abort();
    pollAbortRef.current = new AbortController();

    setLoading(true);
    setPending(false);
    setError("");
    setInfo("");
    setQuizNames([]);
    setSelectedQuiz("");

    try {
      // First attempt (fast)
      const first = await fetchQuizNamesByEmail(eNorm).catch(() => []);
      if (Array.isArray(first) && first.length > 0) {
        setQuizNames(first);
        setStep("quiz");
        return;
      }

      // Nothing yet → webhook delay → pending + poll
      setPending(true);
      setInfo("We’re still receiving your submission from Quiz Page. Please wait 30–60 seconds…");

      const names = await pollQuizNamesByEmail({
        email: eNorm,
        fetcher: fetchQuizNamesByEmail,
        intervalMs: 4000,
        maxMs: 120000, // 2 min
        signal: pollAbortRef.current.signal,
      });

      setQuizNames(names);
      setStep("quiz");
      setInfo("");
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg === "ABORTED") return;

      if (msg === "TIMEOUT") {
        setError("Your results are still processing. Please try again in 1–2 minutes.");
      } else {
        setError(err?.message || "Failed to fetch quiz names.");
      }
    } finally {
      setLoading(false);
      setPending(false);
    }
  }, []);

  /* -----------------------------
     Auto-submit from URL
  ----------------------------- */
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (!emailParam || autoSubmittedRef.current) return;

    const normalized = normalizeEmail(emailParam);
    setEmail(normalized);
    autoSubmittedRef.current = true;

    // ✅ IMPORTANT: pass the normalized email directly
    submitEmail(normalized);
  }, [searchParams, submitEmail]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollAbortRef.current) pollAbortRef.current.abort();
    };
  }, []);

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
      `/result?email=${encodeURIComponent(normalizeEmail(email))}&quiz=${encodeURIComponent(
        selectedQuiz
      )}`
    );
  };

  const handleBack = () => {
    if (pollAbortRef.current) pollAbortRef.current.abort();

    setStep("email");
    setError("");
    setInfo("");
    setPending(false);
    setLoading(false);
  };

  const showSpinner = loading || pending;

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
              ? "Enter your email to view your quizzes"
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
                  disabled={showSpinner}
                  className="pl-9"
                  placeholder="you@example.com"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                    setInfo("");
                  }}
                  required
                />
              </div>

              {info && <p className="text-sm text-gray-600">{info}</p>}

              {error && (
                <div className="space-y-2">
                  <p className="text-sm text-red-600">{error}</p>

                  {error.includes("still processing") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => submitEmail(email)}
                      disabled={showSpinner}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}

              <Button className="w-full" disabled={showSpinner}>
                {showSpinner ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {pending ? "Processing…" : "Fetching quizzes…"}
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
