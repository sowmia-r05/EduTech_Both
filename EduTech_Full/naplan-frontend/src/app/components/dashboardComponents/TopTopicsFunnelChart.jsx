import React, { useMemo } from "react";

export default function TopTopicsPerformance({
  topicBreakdown = {},
  topN = 5,
  title = "Top 5 Topics Overview",
}) {
  /* ------------------ Transform Data ------------------ */
  const data = useMemo(() => {
    return Object.entries(topicBreakdown)
      .map(([topic, value]) => {
        const scored = Number(value?.scored ?? 0);
        const total = Number(value?.total ?? 0);
        if (!total || total <= 0) return null;

        const wrong = total - scored;
        const accuracy = Math.round((scored / total) * 100);

        return {
          name: topic,
          scored,
          total,
          wrong,
          accuracy,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, topN);
  }, [topicBreakdown, topN]);

  const getColor = (accuracy) => {
    if (accuracy <= 30) return "bg-red-500";
    if (accuracy <= 60) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const getSoftBg = (accuracy) => {
    if (accuracy <= 30) return "bg-red-50";
    if (accuracy <= 60) return "bg-amber-50";
    return "bg-emerald-50";
  };

  if (!data.length) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="text-lg font-semibold text-gray-900">{title}</div>
        <div className="mt-6 text-sm text-gray-500">No data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>

      {/* Topics */}
      <div className="mt-6 space-y-6">
        {data.map((topic, index) => (
          <div key={index}>
            {/* Top Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-800">
                {topic.name}
              </div>

              <div className="text-sm font-semibold text-gray-900">
                {topic.accuracy}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className={`w-full h-3 rounded-full ${getSoftBg(topic.accuracy)}`}>
              <div
                className={`h-3 rounded-full transition-all duration-700 ease-out ${getColor(
                  topic.accuracy
                )}`}
                style={{ width: `${topic.accuracy}%` }}
              />
            </div>

            {/* Meta Info */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>
                {topic.scored} correct
              </span>
              <span>
                {topic.wrong} wrong
              </span>
              <span>
                {topic.total} total
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex justify-center gap-5 text-xs text-gray-500">
        <Legend color="#dc2626" label="0–30%" />
        <Legend color="#f59e0b" label="31–60%" />
        <Legend color="#16a34a" label="61–100%" />
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="tracking-tight">{label}</span>
    </div>
  );
}

