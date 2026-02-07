import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function TopicBarChart({ topicBreakdown }) {
  if (!topicBreakdown) return null;

  // convert object → array
  const data = Object.entries(topicBreakdown).map(
    ([topic, values]) => ({
      topic,
      percentage: Math.round((values.scored / values.total) * 100),
    })
  );

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="topic" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="percentage" fill="#46e576" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
