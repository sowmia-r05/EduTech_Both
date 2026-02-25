import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import { childLogin } from "@/app/utils/api-children";

export default function ChildLoginPage() {
  const navigate = useNavigate();
  const { loginChild } = useAuth();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUsername) {
      setError("Please enter your username");
      return;
    }
    if (!cleanPin) {
      setError("Please enter your PIN");
      return;
    }

    try {
      setLoading(true);
      const res = await childLogin({ username: cleanUsername, pin: cleanPin });
      loginChild(res.token, res.child);
      navigate("/child-dashboard");
    } catch (err) {
      setError(err.message || "Login failed. Check your username and PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-100 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Fun header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎓</div>
          <h1 className="text-2xl font-bold text-indigo-700">Student Login</h1>
          <p className="text-slate-500 text-sm mt-1">Enter your username and PIN to start</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                placeholder="e.g. vishaka_y3"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-base focus:border-indigo-500 focus:outline-none transition"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* PIN */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Enter your PIN"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-base text-center tracking-[0.5em] focus:border-indigo-500 focus:outline-none transition"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl text-lg hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging in...
                </span>
              ) : (
                "Let's Go!"
              )}
            </button>
          </form>

          {/* Back link */}
          <div className="text-center pt-2">
            <button
              onClick={() => navigate("/")}
              className="text-sm text-slate-500 hover:text-indigo-600 transition"
            >
              &larr; Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}