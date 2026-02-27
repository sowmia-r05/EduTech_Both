import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

export default function AvatarMenu() {
  const navigate = useNavigate();
  const { childToken, logoutChild, logout } = useAuth();

  const handleBackToDashboard = () => {
    navigate("/child-dashboard");
  };

  const handleLogout = () => {
    if (childToken) {
      logoutChild();
    } else {
      logout();
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Back to Dashboard */}
      <button
        onClick={handleBackToDashboard}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                   bg-white border border-slate-300 text-slate-700 shadow-sm
                   hover:bg-slate-50 hover:border-slate-400 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </button>

      {/* Log Out */}
      <button
        onClick={handleLogout}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                   bg-rose-50 border border-rose-200 text-rose-700
                   hover:bg-rose-100 hover:border-rose-300 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        Log Out
      </button>
    </div>
  );
}
