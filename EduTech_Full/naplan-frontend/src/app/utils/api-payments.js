// src/app/utils/api-payments.js
// Payment-related API functions
//
// Usage:
//   import { fetchBundles, createCheckout, fetchPurchaseHistory } from "@/app/utils/api-payments";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

// ─── Helpers ───

async function authGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed: ${res.status}`);
  return body;
}

async function authPost(path, data, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed: ${res.status}`);
  return body;
}

// ─── Bundle Catalog (public) ───

/**
 * Fetch all active bundles.
 * Optional yearLevel filter.
 */
export async function fetchBundles(yearLevel) {
  const qs = yearLevel ? `?year_level=${yearLevel}` : "";
  return authGet(`/api/catalog/bundles${qs}`);
}

// ─── Checkout (Parent JWT required) ───

/**
 * Create a Stripe Checkout session.
 * @param {string} token - Parent JWT
 * @param {{ bundle_id: string, child_ids: string[] }} data
 * @returns {{ ok, checkout_url, session_id }}
 */
export async function createCheckout(token, { bundle_id, child_ids }) {
  return authPost("/api/payments/checkout", { bundle_id, child_ids }, token);
}

// ─── Purchase History (Parent JWT required) ───

/**
 * Fetch all purchases for the authenticated parent.
 */
export async function fetchPurchaseHistory(token) {
  return authGet("/api/payments/history", token);
}