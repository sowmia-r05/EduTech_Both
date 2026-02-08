import { useNavigate } from "react-router-dom";

export default function AvatarMenu() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate("/NonWritingLookupQuizResults", { replace: true });
  };

  return (
    <div className="flex items-center gap-3">
      {/* Back to Quiz */}
      <button
        onClick={() =>
          (window.location.href = "https://www.flexiquiz.com/Dashboard/Index")
        }
        className="whitespace-nowrap px-3 py-1.5 rounded-lg text-white text-sm
                   bg-[#4338CA] hover:bg-[#3730A3] transition"
                  
      >
        Back To Quiz
      </button>

      {/* Log Out */}
      <button
        onClick={handleLogout}
        className="whitespace-nowrap px-3 py-1.5 rounded-lg text-white text-sm
                   bg-[#F87171] hover:bg-[#EF4444] transition"
      >
        Log Out
      </button>
    </div>
  );
}
