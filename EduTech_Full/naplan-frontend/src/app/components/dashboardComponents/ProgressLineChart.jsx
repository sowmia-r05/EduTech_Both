import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const PRIMARY_COLOR = "#3F51B5"; // consistent indigo

const ProgressLineChart = ({ attempts = [] }) => {
  if (!attempts.length) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-center text-gray-500">
        No performance data yet
      </div>
    );
  }

  // Add readable labels like Attempt 1, Attempt 2...
  const formattedAttempts = attempts.map((item, index) => ({
    ...item,
    label: `Attempt ${index + 1}`,
  }));

  return (
    <div className="bg-white rounded-xl shadow p-4 w-full h-full flex flex-col">
      {/* Header */}
      <h3
        className="font-semibold mb-5 text-base"
        style={{ color: PRIMARY_COLOR }}
      >
        Performance Trend
      </h3>
      <p className="text-xs text-gray-500 mb-2">
        Last practice attempts
      </p>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={formattedAttempts}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
            />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              width={35}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              formatter={(value) => [`${value}%`, "Score"]}
            />

            <Line
              type="monotone"
              dataKey="score"
              stroke={PRIMARY_COLOR}
              strokeWidth={2.5}
              dot={{ r: 4, stroke: PRIMARY_COLOR, strokeWidth: 2, fill: "#fff" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProgressLineChart;
