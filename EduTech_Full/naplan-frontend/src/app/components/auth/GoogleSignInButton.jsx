/**
 * GoogleSignInButton.jsx
 *
 * ═══════════════════════════════════════════════════════════════
 * Reusable "Sign in with Google" button for Parent Login & Signup.
 *
 * Uses Google Identity Services (GSI) — loads the script dynamically,
 * renders Google's official button, and sends the credential to
 * your backend for verification.
 *
 * Props:
 *   onSuccess(data)  — called with { parent_token, parent, is_new_account }
 *   onError(message) — called with error string
 *   disabled         — optional, disables the button
 *
 * Requires:
 *   VITE_GOOGLE_CLIENT_ID in frontend .env
 *
 * Place in: src/app/components/auth/GoogleSignInButton.jsx
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * Load the Google Identity Services script once
 */
let gsiLoadPromise = null;
function loadGSI() {
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise((resolve, reject) => {
    // Already loaded?
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

export default function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const buttonRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);

  // Send Google credential to our backend
  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      onError?.("Google Sign-In failed — no credential received");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/parents/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Google authentication failed");
      }

      onSuccess?.(data);
    } catch (err) {
      console.error("Google Sign-In error:", err);
      onError?.(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  // Initialize Google button
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn("VITE_GOOGLE_CLIENT_ID is not set — Google Sign-In disabled");
      return;
    }

    let mounted = true;

    loadGSI()
      .then(() => {
        if (!mounted || !buttonRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: buttonRef.current.offsetWidth || 400,
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });

        setGsiReady(true);
      })
      .catch((err) => {
        console.error("Failed to load Google Sign-In:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Don't render if no client ID configured
  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="w-full">
      {/* Google's rendered button */}
      <div
        ref={buttonRef}
        className={`w-full flex justify-center ${disabled || loading ? "opacity-50 pointer-events-none" : ""}`}
        style={{ minHeight: 44 }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-slate-500">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Signing in with Google...
        </div>
      )}

      {/* Fallback if GSI hasn't loaded yet */}
      {!gsiReady && !loading && (
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-lg bg-white text-sm text-slate-400"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Loading Google Sign-In...
        </button>
      )}
    </div>
  );
}