export default function TopicProgress({ topic, scored, total }) {
  const percent = Math.round((scored / total) * 100);

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-medium">{topic}</span>
        <span className="text-sm text-gray-500">{percent}%</span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
