import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

import {
  fetchQuizNamesByEmail,
  normalizeEmail,
  verifyEmailExists,
} from "@/app/utils/api";

import StudentImg from "@/app/Images/Faq-analytics.svg";
import AnalyticsImg from "@/app/Images/fetch-data.svg";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default function InputPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [quizNames, setQuizNames] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Prefill email from URL */
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(normalizeEmail(emailParam));
    }
  }, [searchParams]);

  /* Auto-submit if email is in URL */
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setTimeout(() => submitEmail(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEmail = async () => {
    const eNorm = normalizeEmail(email);

    if (!isValidEmail(eNorm)) {
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
        exists = await verifyEmailExists(eNorm);
      } catch {
        /* fallback */
      }

      if (!exists) {
        setError(
          "Email not found. Please use the same email used in the quiz registration."
        );
        return;
      }

      const names = await fetchQuizNamesByEmail(eNorm);

      if (!names || names.length === 0) {
        setError("No writing results found for this email.");
        return;
      }

      setQuizNames(names);
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
    submitEmail();
  };

  const handleQuizSubmit = (e) => {
    e.preventDefault();
    if (!selectedQuiz) return;

    navigate(
      `/result?email=${encodeURIComponent(
        normalizeEmail(email)
      )}&quiz=${encodeURIComponent(selectedQuiz)}`
    );
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-gray-50 overflow-hidden p-4">
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

      <Card className="w-full max-w-md relative z-10">
        <CardHeader>
          <CardTitle>User Evaluation Lookup</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your email ID to view available writing quizzes"
              : "Select a quiz to view your evaluation results"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <Label>Email ID</Label>
              <Input
                type="email"
                value={email}
                disabled={loading}
                placeholder="Enter your email address"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading quizzes…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleQuizSubmit} className="space-y-4">
              <Input value={normalizeEmail(email)} disabled />

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

              <Button className="w-full" disabled={!selectedQuiz}>
                View Results
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
