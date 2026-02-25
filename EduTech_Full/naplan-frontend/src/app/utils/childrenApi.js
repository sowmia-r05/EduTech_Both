/**
 * Children API utilities
 * All functions that need parent auth use authFetch from AuthContext.
 */

import { authFetch, API_BASE } from "@/app/context/AuthContext";

// ─── Child CRUD (requires parent JWT) ───

export async function fetchChildren() {
  const data = await authFetch("/api/children");
  return data.children || [];
}

export async function createChild({ display_name, username, pin, year_level }) {
  const data = await authFetch("/api/children", {
    method: "POST",
    body: JSON.stringify({ display_name, username, pin, year_level }),
  });
  return data.child;
}

export async function updateChild(childId, updates) {
  const data = await authFetch(`/api/children/${childId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return data.child;
}

export async function deleteChild(childId) {
  return authFetch(`/api/children/${childId}`, { method: "DELETE" });
}

export async function fetchChild(childId) {
  const data = await authFetch(`/api/children/${childId}`);
  return data.child;
}

// ─── Public endpoints ───

export async function checkUsername(username) {
  const res = await fetch(
    `${API_BASE}/api/children/check-username?username=${encodeURIComponent(username)}`
  );
  const data = await res.json().catch(() => ({}));
  return data;
}

export async function childLogin(username, pin) {
  const res = await fetch(`${API_BASE}/api/children/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Login failed");
  }
  return data;
}
