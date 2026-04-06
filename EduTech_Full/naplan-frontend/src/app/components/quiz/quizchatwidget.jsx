/**
 * QuizChatWidget.jsx
 * Floating AI chat scoped to a quiz.
 * - Sparkle/AI icon on the FAB
 * - Pulses once after 3s to draw attention
 * - window.__openQuizChat() lets AITutorTab hint open it directly
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY  = 6;
const YOUNG_CUTOFF = 5;
function isYoung(y) { return Number(y || 3) <= YOUNG_CUTOFF; }

function IcSparkle({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c-1 2.5-3.5 4-3.5 4S12 8.5 12 12c0-3.5 3.5-5 3.5-5S13 5.5 12 3z"/>
      <path d="M5 14c-.5 1.5-2 2.5-2 2.5S5 18 5 20c0-2 2.5-3 2.5-3S5.5 15.5 5 14z"/>
      <path d="M19 14c.5 1.5 2 2.5 2 2.5S19 18 19 20c0-2-2.5-3-2.5-3S18.5 15.5 19 14z"/>
    </svg>
  );
}
function IcClose({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  );
}
function IcSend({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 2px" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: "50%", background: "#9CA3AF",
          animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

export default function QuizChatWidget({ quizId, yearLevel, apiFetch }) {
  const young  = isYoung(yearLevel);
  const accent = young ? "#F97316" : "#7C3AED";

  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [pulse,     setPulse]     = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (document.getElementById("qcw-kf")) return;
    const s = document.createElement("style");
    s.id = "qcw-kf";
    s.textContent = `
      @keyframes chatDot { 0%,80%,100%{transform:scale(0.7);opacity:.5} 40%{transform:scale(1);opacity:1} }
      @keyframes qcwPulse { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.5)} 60%{box-shadow:0 0 0 12px rgba(124,58,237,0)} }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPulse(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) { setHasUnread(false); setPulse(false); setTimeout(() => inputRef.current?.focus(), 120); }
  }, [open]);

  // Expose globally so AITutorTab hint can open this widget
  useEffect(() => {
    window.__openQuizChat = () => setOpen(true);
    return () => { delete window.__openQuizChat; };
  }, []);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const userMsg = { role: "user", content: msg };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    const history = next.slice(-(MAX_HISTORY + 1), -1).map((m) => ({
      role: m.role === "user" ? "child" : "ai", content: m.content,
    }));
    try {
      const res  = await apiFetch(`/api/quizzes/${quizId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: msg, chat_history: history }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, {
        role: "ai",
        content: data.reply || "Sorry, I couldn't respond. Try again!",
        cached: data.cached || false,
        score:  data.cache_score || null,
      }]);
      if (!open) setHasUnread(true);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "Something went wrong. Please try again.", cached: false }]);
    } finally { setLoading(false); }
  }, [input, loading, messages, quizId, apiFetch, open]);

  const canSend = !!input.trim() && !loading;

  return (
    <>
      {/* Panel */}
      <div style={{
        position: "fixed", bottom: 88, right: 20, zIndex: 9998,
        width: 500, maxWidth: "calc(100vw - 40px)", maxHeight: 700,
        display: "flex", flexDirection: "column",
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)", overflow: "hidden",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.18s ease, transform 0.18s ease",
      }}>
        <div style={{ padding: "12px 16px", background: accent, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <IcSparkle size={20} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 17}}>{young ? "Your AI tutor ✨" : "AI Tutor"}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>Ask anything about this quiz</div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.85)", padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}>
            <IcClose size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#FAFAFA" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 8px 4px" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>
                {young ? "Hi! I'm your AI helper." : "Hi! I'm your AI tutor."}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                {young ? "Ask me anything about this quiz!" : "Ask me about any question in this quiz."}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%", padding: "9px 13px",
                borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                background: m.role === "user" ? accent : "#fff",
                color: m.role === "user" ? "#fff" : "#1F2937",
                fontSize: 16, lineHeight: 1.7,
                border: m.role === "ai" ? "1px solid #E5E7EB" : "none",
              }}>{m.content}</div>
              {m.role === "ai" && m.cached && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#059669", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 4, padding: "1px 5px", marginTop: 4 }}>
                  <span>⚡</span><span>Instant answer</span>
                  {m.score && <span style={{ opacity: 0.65 }}>({Math.round(m.score * 100)}% match)</span>}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start" }}>
              <div style={{ padding: "8px 14px", borderRadius: "14px 14px 14px 2px", background: "#fff", border: "1px solid #E5E7EB" }}>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #F3F4F6", background: "#fff", flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={young ? "Type your question here..." : "Ask about this quiz..."}
            disabled={loading}
            maxLength={500}
            style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 10, padding: "10px 14px", fontSize: 16, outline: "none", color: "#111827", background: loading ? "#F9FAFB" : "#fff" }}
          />
          <button onClick={send} disabled={!canSend} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: canSend ? accent : "#E5E7EB", color: "#fff", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
            <IcSend size={15} />
          </button>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 54, height: 54, borderRadius: "50%",
          background: open ? "#374151" : accent,
          color: "#fff", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          transition: "background 0.2s",
          animation: pulse && !open ? "qcwPulse 1.6s ease-in-out 3" : "none",
        }}
        aria-label={open ? "Close AI tutor" : "Open AI tutor"}
      >
        {open ? <IcClose size={18} /> : <IcSparkle size={22} />}
        {!open && hasUnread && (
          <div style={{ position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", background: "#EF4444", border: "2px solid #fff" }} />
        )}
      </button>
    </>
  );
}