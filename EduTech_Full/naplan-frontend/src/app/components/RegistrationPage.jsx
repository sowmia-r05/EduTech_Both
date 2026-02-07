// RegistrationPage.jsx
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

const looksLikeEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

export default function RegistrationPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    yearLevel: "",
    email: "",
  });

  const [error, setError] = useState("");
  const [emailStatus, setEmailStatus] = useState("idle"); // idle | checking | exists | available

  // Cache results for the session to avoid re-checks
  const cacheRef = useRef(new Map()); // email -> "exists" | "available"

  // Abort previous request when user types quickly
  const abortRef = useRef(null);

  // ✅ Fast + accurate email existence check (debounced + cached + abort)
  useEffect(() => {
    const email = normalizeEmail(formData.email);

    // Only check once the email looks valid
    if (!email || !looksLikeEmail(email)) {
      setEmailStatus("idle");
      return;
    }

    // If we already checked this email, use cached result instantly
    const cached = cacheRef.current.get(email);
    if (cached) {
      setEmailStatus(cached);
      return;
    }

    setEmailStatus("checking");

    const t = setTimeout(async () => {
      try {
        // cancel any previous request
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const exists = await verifyEmailExists(email, {
          signal: abortRef.current.signal,
        });

        const status = exists ? "exists" : "available";
        cacheRef.current.set(email, status);
        setEmailStatus(status);
      } catch (err) {
        // ignore abort error
        if (err?.name === "AbortError") return;
        setEmailStatus("idle");
      }
    }, 180);

    return () => clearTimeout(t);
  }, [formData.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.firstName || !formData.lastName || !formData.yearLevel || !formData.email) {
      setError("Please fill in all fields");
      return;
    }

    const email = normalizeEmail(formData.email);
    if (!email || !looksLikeEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    // If known exists, block instantly
    if (emailStatus === "exists") {
      setError("Email ID already exists. Please try login.");
      return;
    }

    // If cached exists, block instantly
    const cached = cacheRef.current.get(email);
    if (cached === "exists") {
      setEmailStatus("exists");
      setError("Email ID already exists. Please try login or check your results.");
      return;
    }

    // If we don't have a confident "available" cached, verify once more
    if (cached !== "available") {
      try {
        const exists = await verifyEmailExists(email);
        const status = exists ? "exists" : "available";
        cacheRef.current.set(email, status);
        setEmailStatus(status);

        if (exists) {
          setError("Email ID already exists. Please try login or check your results.");
          return;
        }
      } catch {
        setError("Unable to verify email right now. Please try again.");
        return;
      }
    }

    localStorage.setItem("currentStudent", JSON.stringify({ ...formData, email }));

    const gradeUrls = {
      "Year 3": "https://www.flexiquiz.com/SC/buy-course/Grade3_set-1",
      "Year 5": "",
      "Year 7": "",
      "Year 9": "",
    };

    const url = gradeUrls[formData.yearLevel];
    if (url) {
      window.location.assign(url);
      return;
    }

    setError(`FlexiQuiz link not added yet for ${formData.yearLevel}. Please add the link in RegistrationPage.jsx.`);
  };

  const handleLogin = () => {
    window.location.href = "https://www.flexiquiz.com/account/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <Button onClick={() => navigate("/")} variant="outline" className="bg-white" size="icon">
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
              {emailStatus === "checking" ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Checking email…</AlertDescription>
                </Alert>
              ) : emailStatus === "exists" ? (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    Email ID already exists. Please click the Login button at the top to check your results.
                  </AlertDescription>
                </Alert>
              ) : null}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Enter first name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Enter last name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="yearLevel">Year Level</Label>
                <Select
                  value={formData.yearLevel}
                  onValueChange={(value) => setFormData({ ...formData, yearLevel: value })}
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
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={emailStatus === "exists" || emailStatus === "checking"}
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
