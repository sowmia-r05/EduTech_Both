import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const p = payload[0]?.payload;
  if (!p || p.name === "No Data") return null;

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-2xl"
      style={{
        opacity: 1,
        backgroundColor: "#fff",
        zIndex: 9999,
        maxWidth: 135,
        pointerEvents: "none",
      }}
    >
      <div className="text-2xl font-semibold text-gray-900">{p.name}</div>
      <div className="mt-1 text-base text-gray-700">
        value : <span className="font-semibold">{p.value}%</span>
      </div>
    </div>
  );
}

export default function DonutScoreChart({
  correctPercent = 0,
  incorrectPercent = 0,
}) {
  const [activeIndex, setActiveIndex] = useState(null);

  const correct = Math.max(0, Math.min(100, Math.round(correctPercent)));
  const incorrect =
    incorrectPercent != null
      ? Math.max(0, Math.min(100, Math.round(incorrectPercent)))
      : Math.max(0, 100 - correct);

  const hasData = correct + incorrect > 0;

  const data = hasData
    ? [
        { name: "On track", value: correct, color: "#22c55e" },
        { name: "Improve", value: incorrect, color: "#ef4444" },
      ]
    : [{ name: "No Data", value: 1, color: "#e5e7eb" }];

  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx} cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.95}
        />
      </g>
    );
  };

  const onPieEnter = (_, index) => setActiveIndex(index);
  const onPieLeave = () => setActiveIndex(null);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      {/* Header — emerald instead of indigo */}
      <h2 className="text-lg font-semibold text-emerald-600">
        Performance Overview
      </h2>

      {/* Donut */}
      <div className="relative w-[75%] aspect-square">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {hasData && (
              <Tooltip
                content={<DonutTooltip />}
                cursor={false}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{
                  opacity: 1,
                  zIndex: 9999,
                  outline: "none",
                  backgroundColor: "transparent",
                }}
              />
            )}

            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              style={{ cursor: hasData ? "pointer" : "default" }}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  opacity={activeIndex !== null && activeIndex !== i ? 0.6 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold">
            {hasData ? `${correct}%` : "--"}
          </span>
          <span className="text-sm text-gray-500">Score</span>
        </div>
      </div>

      {/* Legend */}
      {hasData && (
        <div className="flex gap-6 mt-3 text-sm">
          <div
            className="flex items-center gap-2 cursor-pointer transition-opacity"
            onMouseEnter={() => setActiveIndex(0)}
            onMouseLeave={() => setActiveIndex(null)}
            style={{ opacity: activeIndex !== null && activeIndex !== 0 ? 0.6 : 1 }}
          >
            <span className="w-3 h-3 bg-green-500 rounded-full" />
            On track: <b>{correct}</b>
          </div>
          <div
            className="flex items-center gap-2 cursor-pointer transition-opacity"
            onMouseEnter={() => setActiveIndex(1)}
            onMouseLeave={() => setActiveIndex(null)}
            style={{ opacity: activeIndex !== null && activeIndex !== 1 ? 0.6 : 1 }}
          >
            <span className="w-3 h-3 bg-red-500 rounded-full" />
            Improve: <b>{incorrect}</b>
          </div>
        </div>
      )}
    </div>
  );
}
