// src/app/components/support/SupportWidgetGate.jsx
//
// Route allowlist for the floating "Need help?" button.
//
// Paths verified against App.jsx:
//     "/"                 → WelcomePage        (landing)
//     "/parent/create"    → ParentCreatePage   (signup)
//     "/parent-dashboard" → ParentDashboard
//
// Note the inconsistency in the app's own routing: signup is "/parent/create"
// (slash) while the dashboard is "/parent-dashboard" (hyphen). Both spellings
// are listed exactly as App.jsx declares them — do not "tidy" one to match the
// other here without changing the <Route> as well.
//
// WHY A GATE INSTEAD OF EDITING SupportWidget: the widget stays a dumb
// presentational component with no knowledge of routing. If the allowed pages
// change, only this file changes.
//
// WHY AN ALLOWLIST, NOT A BLOCKLIST: a blocklist fails open — add a new page
// tomorrow and the button silently appears on it. An allowlist fails closed,
// which is the behaviour you want for anything that floats over a live exam.
//
// This must render INSIDE the Router (it is — App.jsx mounts it under
// <AuthProvider>, below <Routes>, and the Router lives above AppRoutes).

import { useLocation } from "react-router-dom";
import SupportWidget from "./SupportWidget";

/* Exact-match only. "/" must never be a prefix rule — that would match
   every path in the app. */
const ALLOWED_EXACT = [
  "/",                    // landing page (WelcomePage)
];

/* Prefix rules — also match nested children and query strings, e.g.
   /parent-dashboard?onboarding=free-trial */
const ALLOWED_PREFIXES = [
  "/parent/create",       // ParentCreatePage
  "/parent-dashboard",    // ParentDashboard
];

function isAllowed(pathname) {
  // Normalise one trailing slash so "/parent-dashboard/" behaves like
  // "/parent-dashboard". Root is left untouched.
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (ALLOWED_EXACT.includes(path)) return true;

  return ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}

export default function SupportWidgetGate() {
  const { pathname } = useLocation();

  if (!isAllowed(pathname)) return null;

  return <SupportWidget />;
}