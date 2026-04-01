/**
 * AITutorTab.jsx  (v3)
 * - Renders inline on Results tab (no tab switching)
 * - sessionStorage caching — explanations never regenerate for same attemptId
 * - Clean SVG icons only (no emoji icons)
 * - Chat per wrong question
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Helpers ───
function isYoung(yearLevel) { return Number(yearLevel) <= 5; }

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function getChildAnswer(card) { return card.child_answer || card.child_answer_text || "No answer given"; }

function getCorrectAnswer(card) {
  if (card.type === "short_answer" && card.correct_answer) return card.correct_answer;
  if (Array.isArray(card.correct_answers) && card.correct_answers.length > 0) return card.correct_answers.join(", ");
  return card.correct_answer || card.correct_answer_text || "—";
}

function getIsCorrect(card) {
  if (card.is_correct === true) return true;
  if (card.is_correct === false) return false;
  if ((card.points_earned || 0) > 0) return true;
  if ((card.points_scored || 0) > 0) return true;
  return false;
}

// ─── Cache helpers using sessionStorage ───
function getCached(attemptId) {
  try {
    const raw = sessionStorage.getItem(`explanations_${attemptId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCached(attemptId, data) {
  try { sessionStorage.setItem(`explanations_${attemptId}`, JSON.stringify(data)); } catch {}
}

// ─── SVG Icons ───
const IcCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcCircle = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
  </svg>
);
const IcChat = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);
const IcSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IcBulb = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
  </svg>
);

// ─── Question image ───
function QuestionImage({ card }) {
  const [failed, setFailed] = useState(false);
  const src = card.image_url || card.question_image || card.imageUrl || card.image || null;
  if (!src || failed) return null;
  return (
    <div style={{ marginTop: "10px", borderRadius: "10px", overflow: "hidden", border: "1px solid #E5E7EB" }}>
      <img src={src} alt="" style={{ width: "100%", maxHeight: "220px", objectFit: "contain", display: "block" }} onError={() => setFailed(true)} />
    </div>
  );
}

// ─── Chat panel (wrong answers only) ───
function ChatPanel({ card, attemptId, apiFetch, young }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const newMessages = [...messages, { role: "child", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await apiFetch(`/api/attempts/${attemptId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          question_id: card.question_id,
          message: msg,
          chat_history: newMessages.map((m) => ({ role: m.role === "child" ? "child" : "ai", content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "ai", content: data.reply || "Sorry, I couldn't respond. Try again!" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "Something went wrong. Please try again." }]);
    } finally { setLoading(false); }
  }, [input, loading, messages, attemptId, card.question_id, apiFetch]);

  const accentColor = young ? "#F97316" : "#6366F1";

  return (
    <div style={{ marginTop: "12px", border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", background: "#F9FAFB", display: "flex", alignItems: "center", gap: "6px" }}>
        <IcChat />
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
          {young ? "Ask your AI tutor a question" : "Ask a follow-up question"}
        </span>
      </div>
      {/* Messages */}
      <div style={{ maxHeight: "200px", overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px", background: "#FAFAFA" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: "12px", padding: "8px 0" }}>
            {young ? "What would you like to know about this question?" : "Ask anything about this question."}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "child" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%", padding: "8px 12px",
              borderRadius: m.role === "child" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role === "child" ? accentColor : "#fff",
              color: m.role === "child" ? "#fff" : "#374151",
              fontSize: "13px", lineHeight: 1.5,
              border: m.role === "ai" ? "1px solid #E5E7EB" : "none",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "8px 14px", borderRadius: "12px 12px 12px 2px", background: "#fff", border: "1px solid #E5E7EB", fontSize: "13px", color: "#9CA3AF" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderTop: "1px solid #F3F4F6", background: "#fff" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={young ? "Type your question here..." : "Type a follow-up question..."}
          disabled={loading}
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px", outline: "none", color: "#111827", background: loading ? "#F9FAFB" : "#fff" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: !input.trim() || loading ? "#E5E7EB" : accentColor, color: "#fff", cursor: !input.trim() || loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600 }}
        >
          <IcSend />
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Single question card ───
function QuestionCard({ card, questionNum, explanation, attemptId, yearLevel, apiFetch }) {
  const young = isYoung(yearLevel);
  const isCorrect = getIsCorrect(card);
  const [chatOpen, setChatOpen] = useState(false);

  // Passage / reading block
  if (card.type === "free_text") {
    return (
      <div style={{ borderRadius: "12px", border: "1px solid #BFDBFE", background: "#EFF6FF", padding: "16px", marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reading Passage</span>
        </div>
        {card.question_text && <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{stripHtml(card.question_text)}</p>}
        <QuestionImage card={card} />
      </div>
    );
  }

  const childAnswer = getChildAnswer(card);
  const correctAnswer = getCorrectAnswer(card);
  const options = card.options || [];
  const accentColor = young ? "#F97316" : "#6366F1";

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${isCorrect ? "#A7F3D0" : "#FECACA"}`, borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>

      {/* Header row */}
      <div style={{ background: isCorrect ? "#F0FDF4" : "#FFF5F5", borderBottom: `1px solid ${isCorrect ? "#A7F3D0" : "#FECACA"}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: isCorrect ? "#059669" : "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
          {isCorrect ? <IcCheck /> : <IcX />}
        </div>
        <span style={{ fontSize: "12px", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Question {questionNum}
        </span>
        <div style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "20px", background: isCorrect ? "#DCFCE7" : "#FEE2E2", color: isCorrect ? "#166534" : "#991B1B" }}>
          {isCorrect ? "Correct" : "Incorrect"}
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {/* Question text */}
        <p style={{ fontSize: "14px", color: "#111827", lineHeight: 1.65, fontWeight: 500, marginBottom: "12px" }}>
          {stripHtml(card.question_text)}
        </p>
        <QuestionImage card={card} />

        {/* Options */}
        {options.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
            {options.map((opt, i) => {
              const optText = typeof opt === "string" ? opt : (opt.text || opt.label || "");
              const isChildPick = childAnswer === optText || (Array.isArray(card.child_option_ids) && card.child_option_ids.includes(opt.option_id));
              const isCorrectOpt = correctAnswer.includes(optText) || (Array.isArray(card.correct_answer_ids) && card.correct_answer_ids.includes(opt.option_id));

              let bg = "#F9FAFB", border = "#E5E7EB", color = "#374151";
              if (isCorrectOpt) { bg = "#F0FDF4"; border = "#86EFAC"; color = "#166534"; }
              else if (isChildPick) { bg = "#FFF5F5"; border = "#FCA5A5"; color = "#991B1B"; }

              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "8px", background: bg, border: `1px solid ${border}`, color, fontSize: "13px", fontWeight: isChildPick || isCorrectOpt ? 600 : 400 }}>
                  <span style={{ flexShrink: 0, color: isCorrectOpt ? "#059669" : isChildPick ? "#EF4444" : "#9CA3AF" }}>
                    {isCorrectOpt ? <IcCheck /> : isChildPick ? <IcX /> : <IcCircle />}
                  </span>
                  <span style={{ flex: 1 }}>{optText}</span>
                  {isChildPick && isCorrectOpt && <span style={{ fontSize: "10px", color: "#059669", fontWeight: 700, flexShrink: 0 }}>Your answer — Correct</span>}
                  {isChildPick && !isCorrectOpt && <span style={{ fontSize: "10px", color: "#EF4444", fontWeight: 700, flexShrink: 0 }}>Your answer</span>}
                  {!isChildPick && isCorrectOpt && <span style={{ fontSize: "10px", color: "#059669", fontWeight: 700, flexShrink: 0 }}>Correct answer</span>}
                </div>
              );
            })}
          </div>
        ) : (
          // Short answer
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
            <div style={{ padding: "9px 12px", borderRadius: "8px", background: isCorrect ? "#F0FDF4" : "#FFF5F5", border: `1px solid ${isCorrect ? "#86EFAC" : "#FCA5A5"}`, fontSize: "13px", color: isCorrect ? "#166534" : "#991B1B" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, marginBottom: "2px", opacity: 0.65, textTransform: "uppercase" }}>Your answer</div>
              {childAnswer}
            </div>
            {!isCorrect && (
              <div style={{ padding: "9px 12px", borderRadius: "8px", background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: "13px", color: "#166534" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, marginBottom: "2px", opacity: 0.65, textTransform: "uppercase" }}>Correct answer</div>
                {correctAnswer}
              </div>
            )}
          </div>
        )}

        {/* AI Explanation */}
        {explanation ? (
          <div style={{ marginTop: "14px", background: isCorrect ? "#F0FDF4" : "#F5F3FF", border: `1px solid ${isCorrect ? "#86EFAC" : "#C4B5FD"}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <IcBulb />
              <span style={{ fontSize: "11px", fontWeight: 700, color: isCorrect ? "#059669" : "#6D28D9", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {isCorrect ? "Why this is correct" : "Explanation"}
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.6, margin: 0 }}>
              {explanation.explanation}
            </p>
            {explanation.tip && (
              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px dashed ${isCorrect ? "#86EFAC" : "#C4B5FD"}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  <p style={{ fontSize: "12px", color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                    <strong style={{ color: "#374151" }}>Strategy: </strong>{explanation.tip}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: "14px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid #D1D5DB", borderTopColor: "#6366F1", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Loading AI explanation...</span>
          </div>
        )}

        {/* Chat — wrong answers only */}
        {!isCorrect && (
          <div style={{ marginTop: "12px" }}>
            <button
              onClick={() => setChatOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", background: chatOpen ? (young ? "#FFF7ED" : "#EEF2FF") : "#F9FAFB", border: `1px solid ${chatOpen ? (young ? "#FED7AA" : "#C7D2FE") : "#E5E7EB"}`, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: chatOpen ? (young ? "#C2410C" : "#4338CA") : "#6B7280", transition: "all 0.15s" }}
            >
              <IcChat />
              {chatOpen ? "Close" : "Ask a question about this"}
            </button>
            {chatOpen && <ChatPanel card={card} attemptId={attemptId} yearLevel={yearLevel} apiFetch={apiFetch} young={young} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function AITutorTab({ attemptId, yearLevel, apiFetch }) {
  const young = isYoung(yearLevel);

  const [flashcards, setFlashcards] = useState([]);
  const [explanations, setExplanations] = useState({});
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  // ── Load flashcards ──
  useEffect(() => {
    if (!attemptId) return;
    setLoadingCards(true);
    apiFetch(`/api/attempts/${attemptId}/flashcards`)
      .then((res) => res.json())
      .then((data) => { setFlashcards(data.flashcards || data || []); setLoadingCards(false); })
      .catch(() => { setError("Failed to load questions."); setLoadingCards(false); });
  }, [attemptId, apiFetch]);

  // ── Load AI explanations — with sessionStorage cache ──
  useEffect(() => {
    if (!attemptId || loadingCards || flashcards.length === 0) return;

    // ✅ Return cached explanations immediately — never call Gemini twice
    const cached = getCached(attemptId);
    if (cached) {
      setExplanations(cached);
      return;
    }

    setLoadingAI(true);
    const timeout = setTimeout(() => setLoadingAI(false), 30000);

    apiFetch(`/api/attempts/${attemptId}/explain`, { method: "POST", body: JSON.stringify({}) })
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeout);
        const map = {};
        (data.explanations || []).forEach((e) => { map[e.question_id] = e; });
        setCached(attemptId, map); // ✅ cache it
        setExplanations(map);
        setLoadingAI(false);
      })
      .catch(() => { clearTimeout(timeout); setLoadingAI(false); });

    return () => clearTimeout(timeout);
  }, [attemptId, loadingCards, flashcards.length, apiFetch]);

  if (loadingCards) {
    return (
      <div style={{ padding: "32px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
        <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid #E5E7EB", borderTopColor: "#6366F1", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: "13px", color: "#6B7280" }}>Loading questions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", color: "#6B7280" }}>{error}</p>
      </div>
    );
  }

  const allQuestions = flashcards.filter((c) => c.type !== "free_text");
  const totalCorrect = allQuestions.filter(getIsCorrect).length;
  const totalWrong = allQuestions.length - totalCorrect;

  const filteredCards = filter === "wrong"
    ? flashcards.filter((c) => c.type === "free_text" || !getIsCorrect(c))
    : filter === "correct"
    ? flashcards.filter((c) => c.type === "free_text" || getIsCorrect(c))
    : flashcards;

  let questionNum = 0;

  return (
    <div style={{ padding: "24px 0 32px" }}>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>
            Answers &amp; AI Explanations
          </h2>
          <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>
            {totalCorrect} correct · {totalWrong} incorrect
            {loadingAI && (
              <span style={{ marginLeft: "8px", color: "#6366F1", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", border: "1.5px solid #C7D2FE", borderTopColor: "#6366F1", animation: "spin 0.8s linear infinite" }} />
                Loading AI explanations...
              </span>
            )}
          </p>
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: "6px", background: "#F1F5F9", padding: "4px", borderRadius: "10px" }}>
          {[
            { key: "all", label: `All (${allQuestions.length})` },
            { key: "wrong", label: `Incorrect (${totalWrong})` },
            { key: "correct", label: `Correct (${totalCorrect})` },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "5px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
              fontSize: "12px", fontWeight: 600,
              background: filter === f.key ? "#fff" : "transparent",
              color: filter === f.key ? "#111827" : "#64748B",
              boxShadow: filter === f.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s",
            }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {filteredCards.map((card, i) => {
          if (card.type !== "free_text") questionNum++;
          return (
            <QuestionCard
              key={card.question_id || i}
              card={card}
              questionNum={questionNum}
              explanation={explanations[card.question_id]}
              attemptId={attemptId}
              yearLevel={yearLevel}
              apiFetch={apiFetch}
            />
          );
        })}
      </div>
    </div>
  );
}