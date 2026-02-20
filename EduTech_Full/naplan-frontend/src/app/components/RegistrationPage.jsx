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
import { AlertCircle, ArrowLeft, CheckCircle } from "lucide-react";

import { verifyEmailExists, normalizeEmail } from "@/app/utils/api";
/* ----------------------------------------------------
   ✅ GLOBAL EMAIL CACHE (persists across navigation)
---------------------------------------------------- */
const emailCache = new Map();

const looksLikeEmail = (e) => {
  const basic =
    /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*$/.test(e);

  if (!basic) return false;

  // Block gmail.co, gmail.c, etc
  if (/@gmail\.(?!com$)/i.test(e)) return false;

  return true;
};

export default function RegistrationPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    yearLevel: "",
    email: "",
  });

  const [error, setError] = useState("");
  const [emailStatus, setEmailStatus] = useState("idle");
  // idle | checking | exists | available

  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  /* ----------------------------------------------------
     EMAIL CHECK (debounced + cached + abort-safe)
  ---------------------------------------------------- */
  useEffect(() => {
    const email = normalizeEmail(formData.email);

    if (!email || !looksLikeEmail(email)) {
      setEmailStatus("idle");
      return;
    }

    // ✅ Instant cache check (survives navigation)
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

        // ✅ Store in global cache
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

  /* ----------------------------------------------------
     SUBMIT
  ---------------------------------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { firstName, lastName, yearLevel, email } = formData;

    if (!firstName || !lastName || !yearLevel || !email) {
      setError("Please fill in all fields");
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!looksLikeEmail(normalizedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (emailStatus === "checking") return;

    if (emailStatus === "exists") {
      setError("Email ID already exists. Please login.");
      return;
    }

    // Final safety check if not cached
    if (!emailCache.has(normalizedEmail)) {
      try {
        const exists = await verifyEmailExists(normalizedEmail);
        if (exists) {
          emailCache.set(normalizedEmail, "exists");
          setEmailStatus("exists");
          setError("Email ID already exists. Please login.");
          return;
        }
      } catch {
        setError("Unable to verify email. Please try again.");
        return;
      }
    }

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

    const url = gradeUrls[yearLevel];

    if (url) {
      window.location.assign(url);
    } else {
      setError(`FlexiQuiz link not added yet for ${yearLevel}`);
    }
  };

  const handleLogin = () => {
  navigate("/respondent"); // ✅ go to RespondentPortal (SSO)
};


  /* ----------------------------------------------------
     UI
  ---------------------------------------------------- */
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
            <CardTitle className="text-2xl text-center">
              User Information
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {emailStatus === "checking" && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Checking email…</AlertDescription>
                </Alert>
              )}

              {emailStatus === "exists" && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    Email already exists. Please login.
                  </AlertDescription>
                </Alert>
              )}

              {emailStatus === "available" && (
                <Alert className="border-green-200 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>Email is available</AlertDescription>
                </Alert>
              )}

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
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                />
              </div>

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

              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={emailStatus === "checking" || emailStatus === "exists"}
              >
                Next
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
