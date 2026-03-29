import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const STRONG_RED = "#ef4444";
const MUTED_RED = "#fca5a5";

const WeakTopicsBarChart = ({ topics = [] }) => {
  if (!topics.length) {
    return <p className="text-center mt-20 text-gray-500">No weak topics data</p>;
  }

  const topThreeWeakTopics = [...topics]
    .sort((a, b) => b.lostMarks - a.lostMarks)
    .slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Header — rose instead of blue */}
     
      {/* Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={topThreeWeakTopics}
          layout="vertical"
          margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} />
          <YAxis
            type="category"
            dataKey="topic"
            width={150}
            axisLine={false}
            tick={({ x, y, payload }) => {
              const words = payload.value.split(" ");
              const lines = [];
              let current = "";
              words.forEach((word) => {
                if ((current + " " + word).trim().length > 16) {
                  if (current) lines.push(current.trim());
                  current = word;
                } else {
                  current = (current + " " + word).trim();
                }
              });
              if (current) lines.push(current.trim());
              const capped = lines.slice(0, 2);
              if (lines.length > 2) capped[1] = capped[1].slice(0, 14) + "…";
              return (
                <text x={x} y={y} textAnchor="end" fill="#374151">
                  {capped.map((line, i) => (
                    <tspan key={i} x={x} dy={i === 0 ? (capped.length > 1 ? -6 : 0) : 14} fontSize={12}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            }}
          />
          <Tooltip />
          <Bar dataKey="lostMarks" radius={[0, 8, 8, 0]} barSize={26}>
            {topThreeWeakTopics.map((_, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? STRONG_RED : MUTED_RED} />
            ))}
          </Bar>
        </BarChart>


        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WeakTopicsBarChart;
