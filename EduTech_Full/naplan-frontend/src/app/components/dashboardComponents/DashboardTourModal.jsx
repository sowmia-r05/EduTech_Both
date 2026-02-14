export default function DashboardTourModal({ isOpen, onStart, onSkip }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center animate-fadeIn">
        <h2 className="text-2xl font-bold mb-4">
          Welcome to Your Dashboard
        </h2>

        <p className="mb-6 text-gray-600">
          Would you like a quick guided tour to understand your performance insights?
        </p>

        <div className="flex justify-center gap-4">
          <button
            onClick={onSkip}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
          >
            Skip
          </button>

          <button
            onClick={onStart}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Start Tour
          </button>
        </div>
      </div>
    </div>
  );
}
