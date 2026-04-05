/**
 * QuizChatWidget.jsx
 * ==================
 * A floating AI chat assistant scoped to a single quiz.
 * Lives OUTSIDE the question cards — mounts once per quiz page.
 *
 * Features:
 *  - Floating button (bottom-right) that opens a slide-up chat panel
 *  - Quiz-scoped: AI only knows about this quiz's questions
 *  - Client-side memory: last 6 messages sent with every request
 *  - ⚡ "Instant" badge when the reply came from the semantic cache
 *  - Age-appropriate tone (young = Year 1-4, older = Year 5+)
 *
 * Props:
 *  quizId      {string}   required — the quiz being taken / reviewed
 *  yearLevel   {number}   optional — child's year level (default: 3)
 *  apiFetch    {function} required — authenticated fetch wrapper from useAuth()
 *
 * Usage (in NativeQuizPlayer.jsx or AITutorTab.jsx parent):
 *   import QuizChatWidget from "./QuizChatWidget";
 *   ...
 *   <QuizChatWidget quizId={quizId} yearLevel={yearLevel} apiFetch={apiFetch} />
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_HISTORY   = 6;    // messages kept in memory and sent to backend
const YOUNG_CUTOFF  = 5;    // year levels 1-4 get a friendlier tone

function isYoung(yearLevel) {
  return Number(yearLevel || 3) <= YOUNG_CUTOFF;
}

// ── Tiny SVG icons (no external dep) ──────────────────────────────────────────
function IcBot({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <path d="M12 11V7"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M7 15h.01M12 15h.01M17 15h.01"/>
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

function IcSend({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

// ── Styles (inline — no CSS file dependency) ──────────────────────────────────
const S = {
  // Floating trigger button
  fab: (open, accent) => ({
    position:     "fixed",
    bottom:       24,
    right:        24,
    zIndex:       9999,
    width:        52,
    height:       52,
    borderRadius: "50%",
    background:   open ? "#374151" : accent,
    color:        "#fff",
    border:       "none",
    cursor:       "pointer",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
    boxShadow:    "0 4px 16px rgba(0,0,0,0.18)",
    transition:   "background 0.2s, transform 0.15s",
    transform:    open ? "rotate(0deg)" : "rotate(0deg)",
  }),

  // Unread dot
  dot: (accent) => ({
    position:   "absolute",
    top:        8,
    right:      8,
    width:      10,
    height:     10,
    borderRadius: "50%",
    background: "#EF4444",
    border:     "2px solid #fff",
  }),

  // Panel
  panel: (open) => ({
    position:       "fixed",
    bottom:         88,
    right:          20,
    zIndex:         9998,
    width:          360,
    maxWidth:       "calc(100vw - 40px)",
    maxHeight:      520,
    display:        "flex",
    flexDirection:  "column",
    background:     "#fff",
    border:         "1px solid #E5E7EB",
    borderRadius:   16,
    boxShadow:      "0 8px 32px rgba(0,0,0,0.14)",
    overflow:       "hidden",
    opacity:        open ? 1 : 0,
    transform:      open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
    pointerEvents:  open ? "auto" : "none",
    transition:     "opacity 0.18s ease, transform 0.18s ease",
  }),

  // Panel header
  header: (accent) => ({
    padding:        "12px 16px",
    background:     accent,
    display:        "flex",
    alignItems:     "center",
    gap:            10,
    flexShrink:     0,
  }),

  // Messages area
  messages: {
    flex:           1,
    overflowY:      "auto",
    padding:        "12px",
    display:        "flex",
    flexDirection:  "column",
    gap:            8,
    background:     "#FAFAFA",
  },

  // Individual message bubble
  bubble: (role, accent) => ({
    maxWidth:     "82%",
    padding:      "9px 13px",
    borderRadius: role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
    background:   role === "user" ? accent : "#fff",
    color:        role === "user" ? "#fff" : "#1F2937",
    fontSize:     13,
    lineHeight:   1.55,
    border:       role === "ai" ? "1px solid #E5E7EB" : "none",
    alignSelf:    role === "user" ? "flex-end" : "flex-start",
    position:     "relative",
  }),

  // Cache badge
  cacheBadge: {
    display:      "inline-flex",
    alignItems:   "center",
    gap:          3,
    fontSize:     10,
    fontWeight:   600,
    color:        "#059669",
    background:   "#ECFDF5",
    border:       "1px solid #A7F3D0",
    borderRadius: 4,
    padding:      "1px 5px",
    marginTop:    4,
  },

  // Input row
  inputRow: {
    display:        "flex",
    gap:            8,
    padding:        "10px 12px",
    borderTop:      "1px solid #F3F4F6",
    background:     "#fff",
    flexShrink:     0,
  },

  input: (loading) => ({
    flex:           1,
    padding:        "9px 12px",
    borderRadius:   10,
    border:         "1px solid #D1D5DB",
    fontSize:       13,
    outline:        "none",
    color:          "#111827",
    background:     loading ? "#F9FAFB" : "#fff",
    resize:         "none",
  }),

  sendBtn: (canSend, accent) => ({
    padding:        "8px 12px",
    borderRadius:   10,
    border:         "none",
    background:     canSend ? accent : "#E5E7EB",
    color:          "#fff",
    cursor:         canSend ? "pointer" : "not-allowed",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
    transition:     "background 0.15s",
  }),
};

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 2px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width:       7,
            height:      7,
            borderRadius: "50%",
            background:  "#9CA3AF",
            animation:   `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function QuizChatWidget({ quizId, yearLevel, apiFetch }) {
  const young        = isYoung(yearLevel);
  const accent       = young ? "#F97316" : "#6366F1";

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  // Inject keyframe CSS once
  useEffect(() => {
    if (document.getElementById("quiz-chat-keyframes")) return;
    const style = document.createElement("style");
    style.id = "quiz-chat-keyframes";
    style.textContent = `
      @keyframes chatDot {
        0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
        40%            { transform: scale(1);   opacity: 1;   }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Send message
  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg = { role: "user", content: msg };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    // Build history payload (last MAX_HISTORY messages, excluding the one we just added)
    const history = next.slice(-(MAX_HISTORY + 1), -1).map((m) => ({
      role:    m.role === "user" ? "child" : "ai",
      content: m.content,
    }));

    try {
      const res = await apiFetch(`/api/quizzes/${quizId}/chat`, {
        method: "POST",
        body:   JSON.stringify({ message: msg, chat_history: history }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role:    "ai",
          content: data.reply || "Sorry, I couldn't respond. Try again!",
          cached:  data.cached || false,
          score:   data.cache_score || null,
        },
      ]);

      if (!open) setHasUnread(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Something went wrong. Please try again.", cached: false },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, quizId, apiFetch, open]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const canSend = !!input.trim() && !loading;

  // Welcome message shown when chat first opens empty
  const showWelcome = open && messages.length === 0;

  return (
    <>
      {/* ── Chat panel ── */}
      <div style={S.panel(open)} aria-hidden={!open}>
        {/* Header */}
        <div style={S.header(accent)}>
          <IcBot size={22} color="#fff" />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>
              {young ? "Your AI tutor" : "AI tutor"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>
              Ask anything about this quiz
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.85)", padding: 4, borderRadius: 6,
              display: "flex", alignItems: "center",
            }}
            aria-label="Close chat"
          >
            <IcClose size={18} />
          </button>
        </div>

        {/* Messages */}
        <div style={S.messages}>
          {/* Welcome placeholder */}
          {showWelcome && (
            <div style={{ textAlign: "center", padding: "20px 8px 4px" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>👋</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                {young ? "Hi! I'm your AI helper." : "Hi! I'm your AI tutor."}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                {young
                  ? "Ask me anything about this quiz!"
                  : "Ask me about any question in this quiz."}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div style={S.bubble(m.role, accent)}>{m.content}</div>
              {/* Cache hit badge — only show on AI messages that were cached */}
              {m.role === "ai" && m.cached && (
                <div style={S.cacheBadge}>
                  <span>⚡</span>
                  <span>Instant answer</span>
                  {m.score && (
                    <span style={{ opacity: 0.65 }}>({Math.round(m.score * 100)}% match)</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ alignSelf: "flex-start" }}>
              <div style={{
                ...S.bubble("ai", accent),
                padding: "8px 14px",
              }}>
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={S.inputRow}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={young ? "Type your question here..." : "Ask about this quiz..."}
            disabled={loading}
            maxLength={500}
            style={S.input(loading)}
            aria-label="Chat input"
          />
          <button
            onClick={send}
            disabled={!canSend}
            style={S.sendBtn(canSend, accent)}
            aria-label="Send message"
          >
            <IcSend size={15} />
          </button>
        </div>
      </div>

      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={S.fab(open, accent)}
        aria-label={open ? "Close AI tutor" : "Open AI tutor"}
        title={open ? "Close" : "Ask AI tutor"}
      >
        {open ? <IcClose size={18} /> : <IcBot size={22} color="#fff" />}
        {/* Unread notification dot */}
        {!open && hasUnread && <div style={S.dot(accent)} />}
      </button>
    </>
  );
}