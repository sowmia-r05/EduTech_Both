export default function AISuggestionPanel({ suggestions, studyTips = [] }) {
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;
  const hasStudyTips = Array.isArray(studyTips) && studyTips.length > 0;

  // If nothing to show
  if (!hasSuggestions && !hasStudyTips) return null;

  // Titles
  const displayTitleMap = {
    Improvement: "What to Focus On Next",
    Encouragement: "You Can Improve",
    "Overall Feedback": "Performance Summary",
    "Study Tips": "Study Tips",
  };

  // Group suggestions by title
  const grouped = (suggestions || []).reduce((acc, item) => {
    if (!item?.title || !item?.description) return acc;
    if (!acc[item.title]) acc[item.title] = [];
    acc[item.title].push(item.description);
    return acc;
  }, {});

  // Inject study tips into grouped sections
  if (hasStudyTips) {
    grouped["Study Tips"] = studyTips.filter(Boolean);
  }

  const getStyles = (title) => {
    switch (title) {
      case "Improvement":
        return { bg: "bg-yellow-50", text: "text-yellow-700" };
      case "Encouragement":
        return { bg: "bg-purple-50", text: "text-purple-700" };
      case "Study Tips":
        return { bg: "bg-blue-50", text: "text-blue-700" };
      default:
        return { bg: "bg-gray-50", text: "text-gray-700" };
    }
  };

  // Section order (now includes Study Tips)
  const sectionOrder = ["Improvement", "Encouragement", "Study Tips"];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 font-semibold text-blue-600">AI Study Recommendations</h3>

      <div className="space-y-4">
        {sectionOrder
          .filter((title) => grouped[title]?.length)
          .map((title) => {
            const { bg, text } = getStyles(title);
            const items = grouped[title];

            return (
              <div key={title} className={`border rounded-lg p-3 ${bg}`}>
                <h4 className={`font-medium mb-2 ${text}`}>
                  {displayTitleMap[title] || title}
                </h4>

                {/* If you want Study Tips as separate lines (recommended) */}
                {title === "Study Tips" ? (
                  <div className="space-y-2">
                    {items.map((tip, i) => (
                     <p key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-gray-400">➜</span>
                 <span>{tip}</span>
                  </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 text-justify">
                    {items.join(" ")}
                  </p>
                )}
              </div>
            );
          })}

          
      </div>
    </div>
  );
}
