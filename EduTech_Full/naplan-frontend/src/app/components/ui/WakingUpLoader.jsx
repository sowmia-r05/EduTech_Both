/**
 * WakingUpLoader.jsx
 *
 * Loading state that tells the truth about cold starts.
 *
 * Render's free tier spins the backend down after ~15 min idle; the next
 * request takes 30-60s to get a response. A bare spinner for that long reads
 * as "broken" and people leave — so the copy escalates with elapsed time
 * rather than staying silent.
 *
 * Stages:
 *   0-3s   nothing but the spinner (most requests land here; text would be noise)
 *   3-8s   "Loading..."
 *   8-25s  explain the wake-up, give the expected duration
 *   25s+   reassure that it's still working, show elapsed time
 *   60s+   offer a retry
 */

import { useState, useEffect } from "react";

export default function WakingUpLoader({ onRetry }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stage =
    elapsed < 3  ? "quiet" :
    elapsed < 8  ? "loading" :
    elapsed < 25 ? "waking" :
    elapsed < 60 ? "still" : "slow";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />

      {stage !== "quiet" && (
        <div className="mt-6 max-w-sm">
          {stage === "loading" && (
            <p className="text-slate-600 text-sm">Loading…</p>
          )}

          {stage === "waking" && (
            <>
              <p className="text-slate-800 text-base font-medium">
                Waking up the server
              </p>
              <p className="text-slate-500 text-sm mt-2">
                It rests when nobody's using it, so the first visit of the day
                takes a little longer. Usually about a minute.
              </p>
            </>
          )}

          {stage === "still" && (
            <>
              <p className="text-slate-800 text-base font-medium">
                Almost there
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Still starting up — thanks for your patience.
              </p>
              <p className="text-slate-400 text-xs mt-3 tabular-nums">
                {elapsed}s
              </p>
            </>
          )}

          {stage === "slow" && (
            <>
              <p className="text-slate-800 text-base font-medium">
                This is taking longer than usual
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Something may be wrong on our side. Try again, and if it keeps
                happening please let us know.
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
                >
                  Try again
                </button>
              )}
              <p className="text-slate-400 text-xs mt-3 tabular-nums">
                {elapsed}s
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}