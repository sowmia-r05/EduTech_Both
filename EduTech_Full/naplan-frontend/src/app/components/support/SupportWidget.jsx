// src/app/components/support/SupportWidget.jsx
//
// Floating "Need help?" button + large contact panel. On wider screens it opens
// as a big centered dialog (with a dimmed backdrop) so it's easy to see and type
// in; on phones it fills the screen. Submits to POST /api/support/contact, which
// emails your support inbox via Brevo. Dependency-free (only React).
//
// Mount ONCE, high in the tree so it shows on every page. In App.jsx, inside
// <AuthProvider>, add:  <SupportWidget />

import { useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:3000";

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    childUsername: "",
    category: "Payment / can't log in",
    message: "",
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => setOpen(false);

  const submit = async () => {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/.test(form.email.trim())) {
      setError("Please enter a valid email so we can reply.");
      return;
    }
    if (form.message.trim().length < 5) {
      setError("Please describe the problem.");
      return;
    }
    try {
      setSending(true);
      const res = await fetch(`${API_BASE}/api/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Something went wrong.");
      }
      setDone(true);
    } catch (e) {
      setError(e.message || "Could not send. Please email support@kaisolutions.ai directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating launcher button (always visible, bottom-right) */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setError("");
        }}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700"
      >
        <span aria-hidden>💬</span> Need help?
      </button>

      {/* Full dialog with dimmed backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — click to close */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Panel: big and centered on desktop, full-height on mobile */}
          <div className="relative z-10 flex h-[85vh] max-h-[820px] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-5">
              <span className="text-xl font-semibold text-white">Need help?</span>
              <button
                type="button"
                onClick={close}
                className="text-2xl leading-none text-white/80 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6 md:px-8">
              {done ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-5xl">✅</p>
                  <p className="mt-4 text-xl font-semibold text-slate-800">Message sent</p>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">
                    We'll reply within 1 business day. Check your inbox for a confirmation email.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-6 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-4">
                  <p className="text-sm text-slate-500">
                    Paid but your child can't log in? Include your account email and your
                    child's username below — that's all we need to fix it.
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Your name (optional)"
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      value={form.email}
                      onChange={set("email")}
                      placeholder="Your account email"
                      type="email"
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      value={form.childUsername}
                      onChange={set("childUsername")}
                      placeholder="Child's username (if relevant)"
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <select
                      value={form.category}
                      onChange={set("category")}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option>Payment / can't log in</option>
                      <option>Technical problem</option>
                      <option>Billing question</option>
                      <option>Something else</option>
                    </select>
                  </div>

                  {/* Big message box — fills the rest of the panel */}
                  <textarea
                    value={form.message}
                    onChange={set("message")}
                    placeholder="Describe the problem in as much detail as you like..."
                    className="min-h-[220px] w-full flex-1 resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {sending ? "Sending..." : "Send message"}
                  </button>

                  <p className="text-center text-xs text-slate-400">
                    Or email us directly at support@kaisolutions.ai
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}