const AICoachPanel = ({
  feedback,
  meta,
  weakTopics = [],
  strongTopics = [],
}) => {
  if (!feedback) return null;

  const weakSubjectsList = weakTopics
    .filter(t => t?.topic)
    .map(t => t.topic);

  const strongSubjectsList = strongTopics
    .filter(t => t?.topic)
    .map(t => t.topic);

  return (
  <div className="flex flex-col h-full bg-slate-50 rounded-xl p-4 overflow-hidden border border-slate-200">

    {/* Header */}
    <h2 className="text-blue-600 text-lg font-semibold mb-3 flex-shrink-0">
      AI Coach Feedback 🤖
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
            What You’re Doing Well ✅
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
      {(weakSubjectsList.length > 0 || strongSubjectsList.length > 0) && (
        <div className="mt-4">

          <h4 className="text-slate-800 font-semibold mb-2">
            Skills Breakdown 📊
          </h4>

          <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200">

            {/* Table Header */}
            <div className="grid grid-cols-2 gap-3 mb-2 text-sm font-semibold text-slate-600">
              <div>Stronger Skills 💪</div>
              <div>Skills to Strengthen ⚠️</div>
            </div>

            {/* Scrollable Rows */}
            <div className="max-h-[500px] overflow-y-auto pr-1 space-y-1 custom-scroll">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-100 rounded px-3 py-1 text-sm text-slate-700">
                    {strongSubjectsList[i] || <span className="opacity-50">—</span>}
                  </div>
                  <div className="bg-slate-100 rounded px-3 py-1 text-sm text-slate-700">
                    {weakSubjectsList[i] || <span className="opacity-50">—</span>}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

    </div>
  </div>
);

};

export default AICoachPanel;