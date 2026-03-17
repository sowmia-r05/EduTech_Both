/**
 * RequireTutor.jsx
 */

import { Navigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

function isTutorTokenValid() {
  const token = localStorage.getItem("admin_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
      return false;
    }
    if (!["admin", "tutor"].includes(payload.role)) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    return false;
  }
}

export default function RequireTutor({ children }) {
  if (!isTutorTokenValid()) {
    return <Navigate to={`${ADMIN_PATH}/tutor`} replace />;
  }
  return children;
}