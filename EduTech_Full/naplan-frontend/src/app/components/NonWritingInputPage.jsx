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
  verifyEmailExists, // ❌ don't use as hard blocker during webhook delay
} from "@/app/utils/api";

import {
  createEmailCaches,
  loadQuizCache,
  saveQuizCache,
  loadExistsCache,
  saveExistsCache,
} from "@/app/utils/quizCache";


/* -----------------------------
   Helpers
----------------------------- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollResultQuizNames({
  email,
  fetcher,
  intervalMs = 4000,
  maxMs = 120000,
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

export default function NonWritingInputPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const autoSubmittedRef = useRef(false);
  const pollAbortRef = useRef(null);

  // ✅ add caches ref
  const cachesRef = useRef(createEmailCaches());

  const [email, setEmail] = useState("");
  const [quizNames, setQuizNames] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [step, setStep] = useState("email");

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  /* -----------------------------
     Core Fetch Logic
  ----------------------------- */
  const submitEmail = useCallback(async (emailValue) => {
    const normalized = normalizeEmail(emailValue);

    // 0) Validate email
    if (!isValidEmail(normalized)) {
      setError("Please enter a valid email address");
      setInfo("");
      return;
    }

    // 1) ✅ FAST PATH: cache hit -> show instantly
    const cachedQuizzes = loadQuizCache(normalized, cachesRef.current, "nonwriting");
    if (Array.isArray(cachedQuizzes) && cachedQuizzes.length > 0) {
      setQuizNames(cachedQuizzes);
      setStep("quiz");
      setInfo("");
      setError("");
      setSelectedQuiz("");
      return;
    }

    // 2) Cancel previous poll
    if (pollAbortRef.current) pollAbortRef.current.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    // 3) Reset UI
    setLoading(true);
    setPending(false);
    setError("");
    setInfo("");
    setSelectedQuiz("");
    setQuizNames([]);

    try {
      // 4) Try fetching quizzes first
      const first = await fetchResultQuizNamesByEmail(normalized).catch(() => []);
      if (controller.signal.aborted) return;

      if (Array.isArray(first) && first.length > 0) {
        saveQuizCache(normalized, first, cachesRef.current, "nonwriting");
        setQuizNames(first);
        setStep("quiz");
        setInfo("");
        return;
      }

      // 5) Check user exists (cached -> API)
      let exists = loadExistsCache(normalized, cachesRef.current, "nonwriting");

      if (exists == null) {
        exists = await verifyEmailExists(normalized).catch(() => false);
        saveExistsCache(normalized, exists, cachesRef.current, "nonwriting");
      }

      if (controller.signal.aborted) return;

      if (!exists) {
        setError("Email ID does not exist. Please use the email used during registration.");
        setInfo("");
        return;
      }

      // 6) Poll until quizzes appear
      setPending(true);
      setInfo("Fetching your result… Please wait 30–60 seconds.");

      const quizzes = await pollResultQuizNames({
        email: normalized,
        fetcher: fetchResultQuizNamesByEmail,
        intervalMs: 4000,
        maxMs: 120000,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      saveQuizCache(normalized, quizzes, cachesRef.current, "nonwriting");
      setQuizNames(quizzes);
      setStep("quiz");
      setInfo("");
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg === "ABORTED" || pollAbortRef.current?.signal?.aborted) return;

      if (msg === "TIMEOUT") {
        setError("Your result is still processing. Please try again in 1–2 minutes.");
      } else {
        setError(err?.message || "Failed to fetch quiz names.");
      }
    } finally {
      if (pollAbortRef.current === controller) {
        setLoading(false);
        setPending(false);
      }
    }
  }, []);

  // (rest of your component remains the same)

  /* -----------------------------
     Auto-submit from URL
  ----------------------------- */
useEffect(() => {
  const emailParam = searchParams.get("email");

  // 🚀 FIX: only auto-submit if email is valid
  if (
    !emailParam ||
    autoSubmittedRef.current ||
    !isValidEmail(emailParam)
  ) {
    return;
  }

  const normalized = normalizeEmail(emailParam);
  autoSubmittedRef.current = true;
  setEmail(normalized);

  submitEmail(normalized);
}, [searchParams, submitEmail]);


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
      `/NonWritingLookupQuizResults/results?email=${encodeURIComponent(
        normalizeEmail(email)
      )}&quiz=${encodeURIComponent(selectedQuiz)}`
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
                    {pending ? "Fetching result…" : "Fetching quizzes…"}
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
