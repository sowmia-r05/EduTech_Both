import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  Cell,
} from "recharts";

export default function TopTopicsFunnelChart({
  topicBreakdown = {},
  topN = 5,
  height = 275,
  title = "Top 5 Topics",
}) {
  const colorForAccuracy = (acc) => {
    if (acc <= 30) return "#ef4444";
    if (acc <= 60) return "#f59e0b";
    return "#22c55e";
  };

  const data = useMemo(() => {
    return Object.entries(topicBreakdown || {})
      .map(([topic, v]) => {
        const scored = Number(v?.scored ?? 0);
        const total = Number(v?.total ?? 0);
        if (!Number.isFinite(total) || total <= 0) return null;

        const wrong = Math.max(0, total - scored);
        const accuracy = Math.round((scored / total) * 100);

        // ✅ Extract ONLY first word
        const firstWord = String(topic || "").trim().split(/\s+/)[0] || topic;

        return {
          name: firstWord,
          fullName: topic,
          value: scored,
          scored,
          total,
          wrong,
          accuracy,
          fill: colorForAccuracy(accuracy),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }, [topicBreakdown, topN]);

  if (!data.length) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="mb-3 text-xl font-bold text-blue-600">{title}</div>

        <div
          className="flex-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center"
          style={{ height }}
        >
          <div className="text-sm font-semibold text-gray-500">No data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <div className="mb-3 text-xl font-bold text-blue-600">{title}</div>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <FunnelChart>
            <Tooltip content={<FunnelTooltip />} />

            <Funnel dataKey="value" data={data} isAnimationActive>
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.fill} />
              ))}

              {/* ✅ CENTER-ALIGNED label inside funnel */}
              <LabelList
                dataKey="name"
                position="inside"
                content={(props) => <CenteredLabel {...props} />}
              />

              {/* Score label on the right */}
              <LabelList
                dataKey="value"
                position="right"
                fill="#111827"
                fontSize={12}
                fontWeight={600}
              />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-gray-700">
        <LegendDot color="#ef4444" label="Needs Help (0–30%)" />
        <LegendDot color="#f59e0b" label="Developing (31–60%)" />
        <LegendDot color="#22c55e" label="Strong (61–100%)" />
      </div>
    </div>
  );
}

// ✅ CENTER-ALIGNED Label Component
function CenteredLabel(props) {
  const { value, viewBox } = props;

  const x = Number(viewBox?.x ?? props.x);
  const y = Number(viewBox?.y ?? props.y);
  const w = Number(viewBox?.width ?? props.width);
  const h = Number(viewBox?.height ?? props.height);

  if (
    !value ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return null;
  }

  // ✅ Value is already the first word
  const text = String(value).trim();
  if (!text) return null;

  const padding = 8;
  const maxFont = 16;
  const minFont = 10;

  // Calculate if text fits
  const fits = (txt, fontSize) => {
    const approxCharWidth = fontSize * 0.6;
    const textWidth = txt.length * approxCharWidth;
    return textWidth <= (w - padding * 2);
  };

  let displayText = text;
  let fontSize = maxFont;

  // Try to fit the first word
  while (fontSize >= minFont && !fits(displayText, fontSize)) {
    fontSize -= 1;
  }

  // If still doesn't fit, try first 3-4 letters with ellipsis
  if (!fits(displayText, fontSize)) {
    const maxChars = Math.max(3, Math.floor((w - padding * 2) / (minFont * 0.6)));
    displayText = text.substring(0, maxChars) + "…";
    fontSize = minFont;
    
    // If even abbreviated doesn't fit, hide
    if (!fits(displayText, fontSize)) {
      return null;
    }
  }

  // ✅ CENTER ALIGNMENT: x + (w / 2)
  const centerX = x + (w / 2);
  const centerY = y + (h / 2);

  return (
    <text
      x={centerX}
      y={centerY}
      textAnchor="middle"  // ✅ Center horizontal alignment
      dominantBaseline="middle"  // ✅ Center vertical alignment
      fill="#111827"
      fontSize={fontSize}
      fontWeight={700}
      style={{ pointerEvents: "none" }}
    >
      {displayText}
    </text>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

function FunnelTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  const band =
    p.accuracy <= 30 ? "Needs Help" : p.accuracy <= 60 ? "Developing" : "Strong";

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xl">
      <div className="text-sm font-semibold text-gray-900">
        {p.fullName || p.name}
      </div>

      <div className="mt-1 text-sm text-gray-700">
        Band: <span className="font-semibold">{band}</span>
      </div>

      <div className="text-sm text-gray-700">
        Correct: <span className="font-semibold">{p.scored}</span>
      </div>

      <div className="text-sm text-gray-700">
        Wrong: <span className="font-semibold">{p.wrong}</span>
      </div>

      <div className="text-sm text-gray-700">
        Total: <span className="font-semibold">{p.total}</span>
      </div>

      <div className="text-sm text-gray-700">
        Accuracy: <span className="font-semibold">{p.accuracy}%</span>
      </div>
    </div>
  );
}