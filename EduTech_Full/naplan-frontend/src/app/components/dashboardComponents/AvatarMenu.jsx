import { useNavigate } from "react-router-dom";

export default function AvatarMenu() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // 1. Clear auth data
    localStorage.clear();        // or removeItem("token")
    sessionStorage.clear();

    // 2. Replace history (prevents back button)
    navigate("/NonWritingLookupQuizResults", { replace: true });
  };

  return (
    <div className="flex w-full px-6 py-4">
      <div className="flex gap-4 ml-auto">

        {/* Back to Quiz (external site is fine) */}
        <button
          onClick={() =>
            (window.location.href =
              "https://www.flexiquiz.com/Dashboard/Index")
          }
          className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        >
          Back To Quiz
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        >
          Log Out
        </button>

      </div>
    </div>
  );
}