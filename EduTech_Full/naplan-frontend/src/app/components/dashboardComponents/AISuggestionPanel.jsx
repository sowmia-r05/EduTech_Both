export default function AISuggestionPanel({
  suggestions,
  studyTips = [],
  topicWiseTips = [], // ✅ 1) add this
}) {
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;
  const hasStudyTips = Array.isArray(studyTips) && studyTips.length > 0;
  const hasTopicWiseTips =
    Array.isArray(topicWiseTips) && topicWiseTips.length > 0;

  if (!hasSuggestions && !hasStudyTips && !hasTopicWiseTips) return null;

  const displayTitleMap = {
    Improvement: "What to Focus On Next",
    Encouragement: "You Can Improve",
    "Overall Feedback": "Performance Summary",
    "Study Tips": "Study Tips",
    "Topic Wise Tips": "Topic Wise Tips",
  };

  // Group suggestions
  const grouped = (suggestions || []).reduce((acc, item) => {
    if (!item?.title || !item?.description) return acc;
    if (!acc[item.title]) acc[item.title] = [];
    acc[item.title].push(item.description);
    return acc;
  }, {});

  // Inject Study Tips
  if (hasStudyTips) {
    grouped["Study Tips"] = studyTips.filter(Boolean);
  }

  // ✅ 2) Inject REAL topic wise tips (remove mock data)
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
        return { bg: "bg-blue-50", text: "text-blue-700" };
      case "Topic Wise Tips":
        return { bg: "bg-green-50", text: "text-green-700" };
      default:
        return { bg: "bg-gray-50", text: "text-gray-700" };
    }
  };

  const sectionOrder = ["Improvement", "Encouragement", "Study Tips", "Topic Wise Tips"];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 text-blue-600">
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

                {/* Study Tips */}
                {title === "Study Tips" && (
                  <div className="space-y-2">
                    {items.map((tip, i) => (
                      <p
                        key={i}
                        className="text-sm text-gray-600 flex items-start gap-2"
                      >
                        <span className="text-gray-400">➜</span>
                        <span>{tip}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* ✅ 3) Topic Wise Tips (NEW RENDER LOGIC) */}
                {title === "Topic Wise Tips" && (
                  <div className="space-y-4">
                    {items.map((block, idx) => (
                      <div key={`${block?.topic || "topic"}-${idx}`}>
                        <h5 className="text-sm font-semibold text-gray-700 mb-1">
                          {block?.topic}
                        </h5>

                        <div className="space-y-1 pl-3">
                          {(block?.tips || []).map((tip, i) => (
                            <p
                              key={i}
                              className="text-sm text-gray-600 flex items-start gap-2"
                            >
                              <span className="text-gray-400">➜</span>
                              <span>{tip}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Default Sections */}
                {title !== "Study Tips" && title !== "Topic Wise Tips" && (
                  <p className="text-sm text-gray-600 text-justify">
                    {Array.isArray(items) ? items.join(" ") : String(items)}
                  </p>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}