/**
 * ResumeQuizBanner.jsx
 *
 * ✅ Gap 7 (Frontend): Shows a banner on the child dashboard when there
 * are in-progress quiz attempts that can be resumed.
 *
 * Place in: src/app/components/quiz/ResumeQuizBanner.jsx
 *
 * Usage in ChildDashboard.jsx:
 *   import ResumeQuizBanner from "../quiz/ResumeQuizBanner";
 *   // Inside the dashboard layout, before the quiz catalog:
 *   <ResumeQuizBanner childId={childId} token={activeToken} onResume={handleResumeQuiz} />
 *
 * Props:
 *   childId  — MongoDB _id of the child
 *   token    — JWT token (child or parent)
 *   onResume — (quiz) => void  — callback when "Resume" is clicked
 *                                quiz = { quiz_id, quiz_name, subject, attempt_id, time_remaining_seconds }
 */

import { useState, useEffect, useCallback } from "react";
import { Clock, PlayCircle, AlertTriangle } from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

function formatTime(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return "No time limit";
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function ResumeQuizBanner({ childId, token, onResume }) {
  const [inProgress, setInProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(new Set());

  const fetchInProgress = useCallback(async () => {
    if (!childId || !token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/children/${childId}/in-progress`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        setInProgress([]);
        return;
      }

      const data = await res.json();
      setInProgress(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch in-progress quizzes:", err);
      setInProgress([]);
    } finally {
      setLoading(false);
    }
  }, [childId, token]);

  useEffect(() => {
    fetchInProgress();
  }, [fetchInProgress]);

  // Live countdown timer
  useEffect(() => {
    if (inProgress.length === 0) return;

    const interval = setInterval(() => {
      setInProgress((prev) =>
        prev.map((a) => ({
          ...a,
          time_remaining_seconds:
            a.time_remaining_seconds !== null
              ? Math.max(0, a.time_remaining_seconds - 1)
              : null,
        }))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [inProgress.length]);

  const visibleAttempts = inProgress.filter(
    (a) => !dismissed.has(a.attempt_id) && (a.time_remaining_seconds === null || a.time_remaining_seconds > 0)
  );

  if (loading || visibleAttempts.length === 0) return null;

  return (
    <div className="space-y-3">
      {visibleAttempts.map((attempt) => {
        const isUrgent = attempt.time_remaining_seconds !== null && attempt.time_remaining_seconds < 300;

        return (
          <div
            key={attempt.attempt_id}
            className={`rounded-xl border-2 p-4 flex items-center justify-between gap-4 transition-all ${
              isUrgent
                ? "border-red-300 bg-red-50 animate-pulse"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isUrgent ? "bg-red-100" : "bg-amber-100"
                }`}
              >
                {isUrgent ? (
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-600" />
                )}
              </div>

              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${isUrgent ? "text-red-800" : "text-amber-800"}`}>
                  {attempt.quiz_name || "Untitled Quiz"}
                  <span className="ml-2 text-xs font-normal opacity-70">
                    ({attempt.subject})
                  </span>
                </p>
                <p className={`text-xs ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
                  {attempt.time_remaining_seconds !== null ? (
                    <>
                      ⏰ {formatTime(attempt.time_remaining_seconds)} remaining
                      {isUrgent && " — hurry!"}
                    </>
                  ) : (
                    "No time limit — resume anytime"
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() =>
                  onResume?.({
                    quiz_id: attempt.quiz_id,
                    quiz_name: attempt.quiz_name,
                    subject: attempt.subject,
                    attempt_id: attempt.attempt_id,
                    time_remaining_seconds: attempt.time_remaining_seconds,
                  })
                }
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  isUrgent
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                <PlayCircle className="w-4 h-4" />
                Resume Quiz
              </button>
              <button
                onClick={() => setDismissed((prev) => new Set([...prev, attempt.attempt_id]))}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
