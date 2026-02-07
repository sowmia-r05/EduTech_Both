import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center bg-white p-6 rounded-xl shadow">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">
          404
        </h1>
        <p className="text-gray-600 mb-4">
          Oops! The page you’re looking for doesn’t exist.
        </p>

        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
