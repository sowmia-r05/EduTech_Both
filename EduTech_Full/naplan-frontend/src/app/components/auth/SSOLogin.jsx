import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function SSOLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  const env = useMemo(() => {
    const domain = import.meta.env.VITE_AUTH0_DOMAIN;
    const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
    return { domain, clientId };
  }, []);

  const returnTo = useMemo(() => {
    // Prefer the page user tried to access, else send to dashboard
    const from = location.state?.from;
    if (typeof from === "string" && from.length > 0) return from;
    // With HashRouter, location.pathname is already the in-app path (e.g. "/login")
    // We'll store a hash-based path for after login.
    return "#/NonWritingLookupQuizResults/results";
  }, [location.state]);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate("/NonWritingLookupQuizResults/results");
      return;
    }

    // If env is missing, do not attempt redirect (it will silently fail).
    if (!env.domain || !env.clientId) return;

    loginWithRedirect({
      appState: { returnTo },
      authorizationParams: {
        // keep these consistent with Auth0ProviderWithNavigate
        redirect_uri: window.location.origin,
      },
    });
  }, [isLoading, isAuthenticated, loginWithRedirect, navigate, env.domain, env.clientId, returnTo]);

  // Friendly screen while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl text-center">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(!env.domain || !env.clientId) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Auth0 env vars are missing. Add these in <b>naplan-frontend/.env</b> (local)
                or in Vercel → Project → Settings → Environment Variables:
                <br />
                <code className="block mt-2 text-xs">VITE_AUTH0_DOMAIN=YOUR_DOMAIN</code>
                <code className="block text-xs">VITE_AUTH0_CLIENT_ID=YOUR_CLIENT_ID</code>
                <code className="block text-xs">VITE_AUTH0_AUDIENCE=YOUR_API_AUDIENCE</code>
              </AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-gray-600 text-center">
            {isLoading ? "Preparing login…" : "Redirecting to SSO…"}
          </div>

          <div className="flex gap-2">
            <Button
              className="w-full"
              onClick={() =>
                loginWithRedirect({
                  appState: { returnTo },
                  authorizationParams: { redirect_uri: window.location.origin },
                })
              }
              disabled={!env.domain || !env.clientId || isLoading}
            >
              Continue with SSO
            </Button>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
