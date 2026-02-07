export default function SubjectCard({ quizName, score, date }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 transition-colors duration-300">
      <h3 className="font-semibold text-lg">{quizName}</h3>
      <p>Score: {score}%</p>
      <p className="text-gray-500 dark:text-gray-400">{new Date(date).toLocaleDateString()}</p>
    </div>
  );
}
