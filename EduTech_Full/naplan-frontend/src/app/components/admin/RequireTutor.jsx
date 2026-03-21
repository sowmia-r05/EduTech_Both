/**
 * RequireTutor.jsx
 *
 * ✅ FIXED: Now reads from "tutor_token" / "tutor_info" (separate from admin).
 *           This prevents admin and tutor sessions from overwriting each other.
 */

import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

function isTutorTokenValid() {
  try {
    const token = localStorage.getItem("tutor_token");
    if (!token || token === "null" || token === "undefined") return false;

    const payload = JSON.parse(atob(token.split(".")[1]));

    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("tutor_token");
      localStorage.removeItem("tutor_info");
      return false;
    }

    if (!["tutor"].includes(payload.role)) {
      localStorage.removeItem("tutor_token");
      localStorage.removeItem("tutor_info");
      return false;
    }

    return true;
  } catch {
    localStorage.removeItem("tutor_token");
    localStorage.removeItem("tutor_info");
    return false;
  }
}

export default function RequireTutor({ children }) {
  if (!isTutorTokenValid()) {
    return <Navigate to={`${ADMIN_PATH}/tutor`} replace />;
  }
  return children;
}