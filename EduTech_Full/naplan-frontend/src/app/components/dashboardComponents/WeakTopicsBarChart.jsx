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
      <h3 className="font-semibold mb-3 text-rose-600">
        Priority Improvement Areas
      </h3>

      {/* Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={topThreeWeakTopics}
            layout="vertical"
            margin={{ top: 10, right: 24, left: 24, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} />
            <YAxis type="category" dataKey="topic" width={100} tick={{ fill: "#374151", fontSize: 15 }} axisLine={false} />
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
