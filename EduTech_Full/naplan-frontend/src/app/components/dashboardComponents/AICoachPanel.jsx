/**
 * AICoachPanel.jsx
 *
 * ✅ UPDATED: Shows a loading spinner when AI feedback is being generated
 *    instead of returning null (which left an empty white box).
 *
 * New prop: isRegenerating — boolean, shows spinner while auto-generating.
 */
const AICoachPanel = ({
  feedback,
  meta,
  weakTopics = [],
  strongTopics = [],
  isRegenerating = false,
}) => {
  // ✅ Check if feedback has REAL content (not just empty Mongoose defaults)
  const hasFeedback =
    feedback &&
    ((feedback.overall_feedback && String(feedback.overall_feedback).trim().length > 0) ||
      (Array.isArray(feedback.strengths) && feedback.strengths.length > 0) ||
      (Array.isArray(feedback.weaknesses) && feedback.weaknesses.length > 0) ||
      (Array.isArray(feedback.coach) && feedback.coach.length > 0) ||
      (Array.isArray(feedback.study_tips) && feedback.study_tips.length > 0) ||
      (Array.isArray(feedback.topic_wise_tips) && feedback.topic_wise_tips.length > 0));

  // ✅ If no feedback, show loading state (auto-generating in background)
  if (!hasFeedback) {
    return (
      <div className="flex flex-col h-full bg-slate-50 rounded-xl p-4 overflow-hidden border border-slate-200">
        <h2 className="text-teal-600 text-lg font-semibold mb-3 flex-shrink-0">
          Coach Feedback 🤖
        </h2>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          {isRegenerating ? (
            <>
              <div className="w-14 h-14 mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-600 animate-spin" />
                <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-400 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              </div>
              <p className="text-slate-700 text-sm font-semibold">Generating AI Insights…</p>
              <p className="text-slate-400 text-xs mt-1">Analysing your performance — this takes 15–30 seconds</p>
            </>
          ) : (
            <>
              <div className="text-3xl mb-2 opacity-40">🤖</div>
              <p className="text-slate-400 text-sm">AI insights not available for this attempt</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const weakSubjectsList = (weakTopics || [])
    .filter((t) => t?.topic && String(t.topic).trim())
    .map((t) => String(t.topic).trim());

  const strongSubjectsList = (strongTopics || [])
    .filter((t) => t?.topic && String(t.topic).trim())
    .map((t) => String(t.topic).trim());

  const finalRowCount = Math.max(strongSubjectsList.length, weakSubjectsList.length);
  const EMPTY_PLACEHOLDER = "----";

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl p-4 overflow-hidden border border-slate-200">
      {/* Header */}
      <h2 className="text-teal-600 text-lg font-semibold mb-3 flex-shrink-0">
        Coach Feedback 🤖
      </h2>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pr-2 min-h-0 custom-scroll">
        {/* Performance Summary */}
        {feedback.overall_feedback && (
          <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">
              Performance Summary
            </h3>
            <p className="text-slate-600 text-sm leading-snug">
              {feedback.overall_feedback}
            </p>
          </div>
        )}

        {/* Strengths */}
        {feedback.strengths?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-slate-800 font-semibold mb-2">
              What You're Doing Well ✅
            </h4>
            <div className="space-y-1">
              {feedback.strengths.map((s, i) => (
                <div
                  key={i}
                  className="bg-green-50 border border-green-200 rounded-md px-3 py-1 text-sm text-green-800"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Areas to Improve */}
        {feedback.weaknesses?.length > 0 && (
          <div className="mb-8">
            <h4 className="text-slate-800 font-semibold mb-2">
              Areas to Improve ⚠️
            </h4>
            <div className="space-y-1">
              {feedback.weaknesses.map((w, i) => (
                <div
                  key={i}
                  className="bg-amber-50 border border-amber-200 rounded-md px-3 py-1 text-sm text-amber-800"
                >
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills Breakdown */}
        {finalRowCount > 0 && (
          <div className="mb-4">
            <h4 className="text-slate-800 font-semibold mb-2">
              Skills Breakdown 📊
            </h4>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="px-3 py-2 bg-green-50 text-green-700 text-xs font-bold border-b border-green-200">
                  Stronger Skills 💪
                </div>
                <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs font-bold border-b border-amber-200">
                  Skills to Strengthen ⚠️
                </div>
              </div>
              {Array.from({ length: finalRowCount }).map((_, i) => (
                <div key={i} className="grid grid-cols-2 border-b border-slate-100 last:border-0">
                  <div className="px-3 py-1.5 text-sm text-slate-700">
                    {strongSubjectsList[i] || EMPTY_PLACEHOLDER}
                  </div>
                  <div className="px-3 py-1.5 text-sm text-slate-700">
                    {weakSubjectsList[i] || EMPTY_PLACEHOLDER}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AICoachPanel;
