import { useNavigate } from "react-router-dom";

export default function AvatarMenu({ className = "" }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate("/NonWritingLookupQuizResults", { replace: true });
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Back to Quiz */}
      <button
        onClick={() => (window.location.href = "https://www.flexiquiz.com/Dashboard/Index")}
        className="whitespace-nowrap px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
      >
        Back To Quiz
      </button>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="whitespace-nowrap px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
      >
        Log Out
      </button>
    </div>
  );
}
