/**
 * QuizChatWidget.jsx
 * Floating AI chat scoped to a quiz.
 * - Sparkle/AI icon on the FAB
 * - Pulses once after 3s to draw attention
 * - window.__openQuizChat() lets AITutorTab hint open it directly
 * - AI replies render **bold** and line breaks (lightweight, no deps)
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY  = 6;
const YOUNG_CUTOFF = 5;
function isYoung(y) { return Number(y || 3) <= YOUNG_CUTOFF; }

// ── Minimal inline markdown: **bold** + *italic*, newlines via pre-wrap ──
function renderFormatted(text) {
  const str = String(text ?? "");
  const parts = str.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

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

export default function QuizChatWidget({
  quizId, attemptId, subject, yearLevel, apiFetch,
  open: controlledOpen,
  onOpenChange,
}) {
  const young  = isYoung(yearLevel);
  const accent = young ? "#F97316" : "#7C3AED";

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (val) => {
    const next = typeof val === "function" ? val(open) : val;
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
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


  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const userMsg = { role: "user", content: msg };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    const history = next.slice(-(MAX_HISTORY + 1), -1).map((m) => ({
      role: m.role === "user" ? "user" : "assistant", content: m.content,
    }));
    try {
      const res  = await apiFetch(`/api/quizzes/${quizId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: msg, chat_history: history, attempt_id: attemptId, subject }),
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
        position: "fixed", bottom: 96, right: 20, zIndex: 9998,
        width: 720, maxWidth: "calc(100vw - 40px)", height: "min(820px, calc(100vh - 110px))",
        display: "flex", flexDirection: "column",
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)", overflow: "hidden",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.18s ease, transform 0.18s ease",
      }}>
        <div style={{ padding: "18px 22px", background: accent, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <IcSparkle size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 30}}>{young ? "Your AI tutor ✨" : "AI Tutor"}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 19 }}>Ask anything about this quiz</div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.85)", padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}>
            <IcClose size={30} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14, background: "#FAFAFA" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "26px 8px 4px" }}>
              <div style={{ fontSize: 42, marginBottom: 8 }}>✨</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: "#374151" }}>
                {young ? "Hi! I'm your AI helper." : "Hi! I'm your AI tutor."}
              </div>
              <div style={{ fontSize: 19, color: "#9CA3AF", marginTop: 4 }}>
                {young ? "Ask me anything about this quiz!" : "Ask me about any question in this quiz."}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%", padding: "16px 20px",
                borderRadius: m.role === "user" ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                background: m.role === "user" ? accent : "#fff",
                color: m.role === "user" ? "#fff" : "#1F2937",
                fontSize: 26, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
                border: m.role === "ai" ? "1px solid #E5E7EB" : "none",
              }}>{m.role === "ai" ? renderFormatted(m.content) : m.content}</div>
              {m.role === "ai" && m.cached && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: "#059669", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 4, padding: "2px 6px", marginTop: 4 }}>
                  <span>⚡</span><span>Instant answer</span>
                  {m.score && <span style={{ opacity: 0.65 }}>({Math.round(m.score * 100)}% match)</span>}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start" }}>
              <div style={{ padding: "8px 14px", borderRadius: "16px 16px 16px 2px", background: "#fff", border: "1px solid #E5E7EB" }}>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 10, padding: "16px 18px", borderTop: "1px solid #F3F4F6", background: "#fff", flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={young ? "Type your question here..." : "Ask about this quiz..."}
            disabled={loading}
            maxLength={500}
            style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 12, padding: "16px 20px", fontSize: 24, outline: "none", color: "#111827", background: loading ? "#F9FAFB" : "#fff" }}
          />
          <button onClick={send} disabled={!canSend} style={{ padding: "12px 22px", borderRadius: 12, border: "none", background: canSend ? accent : "#E5E7EB", color: "#fff", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
            <IcSend size={28} />
          </button>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 66, height: 66, borderRadius: "50%",
          background: open ? "#374151" : accent,
          color: "#fff", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          transition: "background 0.2s",
          animation: pulse && !open ? "qcwPulse 1.6s ease-in-out 3" : "none",
        }}
        aria-label={open ? "Close AI tutor" : "Open AI tutor"}
      >
        {open ? <IcClose size={26} /> : <IcSparkle size={30} />}
        {!open && hasUnread && (
          <div style={{ position: "absolute", top: 10, right: 10, width: 12, height: 12, borderRadius: "50%", background: "#EF4444", border: "2px solid #fff" }} />
        )}
      </button>
    </>
  );
}