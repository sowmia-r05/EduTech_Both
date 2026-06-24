/**
 * AICoachPanel.jsx
 *
 * ✅ UPDATED: Shows a loading spinner when AI feedback is being generated
 *    instead of returning null (which left an empty white box).
 *
 * New prop: isRegenerating — boolean, shows spinner while auto-generating.
 * New props: isReading + readingTiers — for Reading, show a difficulty
 *            breakdown instead of the (passage-name) skills table.
 */
const AICoachPanel = ({
  feedback,
  meta,
  weakTopics = [],
  strongTopics = [],
  isReading = false,        // 👈 ADDED
  readingTiers = [],        // 👈 ADDED
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
    // Show the spinner if the parent passed isRegenerating OR if meta.status says we're still working
    const inferredLoading =
      isRegenerating ||
      ["queued", "generating", "pending"].includes(meta?.status);

    return (
      <div className="flex flex-col h-full bg-slate-50 rounded-xl p-4 overflow-hidden border border-slate-200">
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          {inferredLoading ? (
            <>
              <div className="w-14 h-14 mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-600 animate-spin" />
                <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-400 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              </div>
              <p className="text-slate-700 text-sm font-semibold">Generating AI Insights…</p>
              <p className="text-slate-400 text-xs mt-1">
                Analysing your performance — this takes 15–30 seconds
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-slate-600 text-sm font-medium">No AI insights yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Feedback wasn't generated for this attempt.
              </p>
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

  // 👈 Reading gets its own section wording; every other subject is unchanged.
  const L = isReading
    ? {
        summary: "Reading Summary",
        strengths: "What You Read Well 📖",
        weaknesses: "Trickier Passages ⚠️",
      }
    : {
        summary: "Performance Summary",
        strengths: "What You're Doing Well ✅",
        weaknesses: "Areas to Improve ⚠️",
      };

  // 👈 Reading breakdown rows: always show all three groups in plain English,
  // so users see "Did well / Nearly there / Found tricky" even when a group is 0.
  const READING_GROUPS = [
    { key: "easier", label: "Did well",     sub: "got most right", color: "emerald" },
    { key: "medium", label: "Nearly there", sub: "about half right", color: "amber" },
    { key: "harder", label: "Found tricky", sub: "needs more practice", color: "rose" },
  ];
  const tierByKey = Object.fromEntries((readingTiers || []).map((t) => [t.key, t]));
  const readingRows = READING_GROUPS.map((g) => ({
    ...g,
    count: tierByKey[g.key]?.count || 0,
  }));
  const totalPassages = readingRows.reduce((a, r) => a + r.count, 0);
  const BAR_COLOR = { emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400" };
  const DOT_COLOR = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" };

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl p-4 overflow-hidden border border-slate-200">
      {/* Header */}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pr-2 min-h-0 custom-scroll">
        {/* Performance Summary */}
        {feedback.overall_feedback && (
          <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">
              {L.summary}
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
              {L.strengths}
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
              {L.weaknesses}
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

        {/* 👈 READING: difficulty breakdown instead of the skills table */}
        {isReading ? (
          totalPassages > 0 && (
            <div className="mb-4">
              <h4 className="text-slate-800 font-semibold mb-1">
                Reading Breakdown 📖
              </h4>
              <p className="text-slate-500 text-xs mb-3">
                Out of {totalPassages} passage{totalPassages === 1 ? "" : "s"} read, here's how it went.
              </p>

              {/* One bar split by how many passages fell in each group */}
              <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 mb-3">
                {readingRows.map((r) =>
                  r.count > 0 ? (
                    <div
                      key={r.key}
                      className={BAR_COLOR[r.color]}
                      style={{ width: `${(r.count / totalPassages) * 100}%` }}
                      title={`${r.label}: ${r.count}`}
                    />
                  ) : null
                )}
              </div>

              {/* Plain-English rows — all three always shown */}
              <div className="space-y-1.5">
                {readingRows.map((r) => {
                  const muted = r.count === 0;
                  return (
                    <div
                      key={r.key}
                      className="flex items-center justify-between bg-white rounded-lg shadow-sm px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${muted ? "bg-slate-300" : DOT_COLOR[r.color]}`} />
                        <span className={`text-sm font-medium ${muted ? "text-slate-400" : "text-slate-700"}`}>
                          {r.label}
                        </span>
                        <span className="text-xs text-slate-400 truncate">— {r.sub}</span>
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ${muted ? "text-slate-400" : "text-slate-600"}`}>
                        {r.count} {r.count === 1 ? "passage" : "passages"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          finalRowCount > 0 && (
            <div className="mb-4">
              <h4 className="text-slate-800 font-semibold mb-2">
                Skills Breakdown 📊
              </h4>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Sticky column headers */}
                <div className="grid grid-cols-2 sticky top-0 z-10">
                  <div className="px-3 py-2 bg-green-50 text-green-700 text-xs font-bold border-b border-green-200">
                    Stronger Skills 💪
                  </div>
                  <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs font-bold border-b border-amber-200">
                    Skills to Strengthen ⚠️
                  </div>
                </div>
                {/* Scrollable rows only */}
                <div className="max-h-[600px] overflow-y-auto">
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
            </div>
          )
        )}


      </div>
    </div>
  );
};

export default AICoachPanel;