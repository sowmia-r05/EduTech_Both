import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function ScoreChart({ data }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="quizName" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="score.percentage" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
