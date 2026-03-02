/**
 * AISuggestionPanel.jsx
 *
 * ✅ UPDATED: Shows loading spinner when AI is auto-generating
 *    instead of returning null (which left an empty white box).
 *
 * New prop: isRegenerating — boolean, shows spinner while generating.
 */
export default function AISuggestionPanel({
  suggestions,
  studyTips = [],
  topicWiseTips = [],
  isRegenerating = false,
}) {
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;
  const hasStudyTips = Array.isArray(studyTips) && studyTips.length > 0;
  const hasTopicWiseTips = Array.isArray(topicWiseTips) && topicWiseTips.length > 0;

  // ✅ If nothing to show, display loading or empty state
  if (!hasSuggestions && !hasStudyTips && !hasTopicWiseTips) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-3 text-amber-600">
          AI Study Recommendations
        </h3>
        <div className="flex flex-col items-center justify-center text-center py-6">
          {isRegenerating ? (
            <>
              <div className="w-8 h-8 mb-3 relative">
                <div className="absolute inset-0 rounded-full border-3 border-amber-100" />
                <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-amber-500 animate-spin" />
              </div>
              <p className="text-slate-500 text-xs">Generating study recommendations…</p>
            </>
          ) : (
            <>
              <div className="text-2xl mb-2 opacity-40">📚</div>
              <p className="text-slate-400 text-xs">
                Study recommendations not available for this attempt
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const displayTitleMap = {
    Improvement: "What to Focus On Next",
    Encouragement: "You Can Improve",
    "Overall Feedback": "Performance Summary",
    "Study Tips": "Study Tips",
    "Topic Wise Tips": "Topic Wise Tips",
  };

  const grouped = (suggestions || []).reduce((acc, item) => {
    if (!item?.title || !item?.description) return acc;
    if (!acc[item.title]) acc[item.title] = [];
    acc[item.title].push(item.description);
    return acc;
  }, {});

  if (hasStudyTips) {
    grouped["Study Tips"] = studyTips.filter(Boolean);
  }

  if (hasTopicWiseTips) {
    grouped["Topic Wise Tips"] = topicWiseTips;
  }

  const getStyles = (title) => {
    switch (title) {
      case "Improvement":
        return { bg: "bg-yellow-50", text: "text-yellow-700" };
      case "Encouragement":
        return { bg: "bg-purple-50", text: "text-purple-700" };
      case "Study Tips":
        return { bg: "bg-sky-50", text: "text-sky-700" };
      case "Topic Wise Tips":
        return { bg: "bg-green-50", text: "text-green-700" };
      default:
        return { bg: "bg-gray-50", text: "text-gray-700" };
    }
  };

  const sectionOrder = ["Improvement", "Encouragement", "Study Tips", "Topic Wise Tips"];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 text-amber-600">
        AI Study Recommendations
      </h3>

      <div className="space-y-4">
        {sectionOrder
          .filter((title) => grouped[title])
          .map((title) => {
            const { bg, text } = getStyles(title);
            const items = grouped[title];

            return (
              <div key={title} className={`border rounded-lg p-3 ${bg}`}>
                <h4 className={`font-medium mb-3 ${text}`}>
                  {displayTitleMap[title] || title}
                </h4>

                {title === "Study Tips" && (
                  <div className="space-y-2">
                    {items.map((tip, i) => (
                      <p key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">→</span>
                        <span>{tip}</span>
                      </p>
                    ))}
                  </div>
                )}

                {title === "Topic Wise Tips" && (
                  <div className="space-y-3">
                    {items.map((item, i) => {
                      if (!item?.topic || !Array.isArray(item.tips)) return null;
                      return (
                        <div key={i}>
                          <p className="text-sm font-semibold text-gray-700 mb-1">
                            📌 {item.topic}
                          </p>
                          <div className="space-y-1 ml-4">
                            {item.tips.map((tip, j) => (
                              <p key={j} className="text-sm text-gray-600 flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">•</span>
                                <span>{tip}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {title !== "Study Tips" && title !== "Topic Wise Tips" && (
                  <div className="space-y-2">
                    {items.map((desc, i) => (
                      <p key={i} className="text-sm text-gray-600 leading-snug">
                        {desc}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
