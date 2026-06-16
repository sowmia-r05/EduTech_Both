/**
 * quizChat.js
 * ===========
 * POST /api/quizzes/:quizId/chat
 *
 * Quiz-scoped AI tutor — Google Gemini, direct from Node.
 *
 * Two modes, decided automatically:
 *   • ATTEMPT-AWARE (student has an attempt loaded): the prompt includes the
 *     student's OWN per-question results — which option they chose, whether it
 *     was right, and the correct answer — so the tutor can answer "what's wrong
 *     with Q3?". These replies are personal and are NOT written to the cache.
 *   • GENERIC (no attempt): standalone conceptual questions use the shared
 *     Qdrant semantic cache (one answer per question, per quiz), with a light
 *     personalization pass from the child's history.
 *
 * ENV (Render backend):
 *   GEMINI_API_KEY        — required (AIza...)
 *   GEMINI_MODEL          — optional, default "gemini-2.5-flash-lite"
 *   QDRANT_URL            — required for caching
 *   QDRANT_API_KEY        — required for caching
 *   QUIZ_CACHE_ENABLED    — optional, default true
 *   PERSONALIZE_REPLIES   — optional, default true
 *
 * Requires Node 18+ (built-in global fetch).
 */

"use strict";

const express   = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const { getAttemptContext } = require("../chat/getAttemptContext");
const { getChildHistory }   = require("../chat/getChildHistory");
const { embedQuestion, checkCache, storeCache } = require("../utils/quizChatCache");

const router = express.Router();

// -- Config -------------------------------------------------------------------
const GEMINI_MODEL     = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const MAX_CHAT_HISTORY = 4;
const MAX_TOKENS       = 350;
const QUIZ_CACHE_TTL   = 10 * 60 * 1000;

const CACHE_ENABLED =
  String(process.env.QUIZ_CACHE_ENABLED ?? "true").toLowerCase() !== "false" &&
  !!process.env.QDRANT_URL;
const PERSONALIZE =
  String(process.env.PERSONALIZE_REPLIES ?? "true").toLowerCase() !== "false";

// -- In-process quiz question cache -------------------------------------------
const _quizCache = new Map();
function _getCachedQuiz(quizId) {
  const entry = _quizCache.get(quizId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > QUIZ_CACHE_TTL) { _quizCache.delete(quizId); return null; }
  return entry.questions;
}
function _setCachedQuiz(quizId, questions) {
  if (_quizCache.size >= 200) _quizCache.delete(_quizCache.keys().next().value);
  _quizCache.set(quizId, { questions, cachedAt: Date.now() });
}

// -- Rate limiter: 20 msg/hour per child --------------------------------------
const chatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.childId || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a little before asking again." },
});

// -- Gemini caller ------------------------------------------------------------
async function callGemini(messages, { maxTokens = MAX_TOKENS, temperature = 0.4 } = {}) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");

  let systemText = "";
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") { systemText += (systemText ? "\n" : "") + (m.content || ""); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    const text = m.content || "";
    if (text) contents.push({ role, parts: [{ text }] });
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Gemini ${resp.status}: ${errBody.slice(0, 400)}`);
  }

  const data = await resp.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const trimmed = (reply || "").trim();
  if (!trimmed) throw new Error("Gemini returned an empty reply");
  return trimmed;
}

// -- Light personalization for the GENERIC (no-attempt) path ------------------
async function personalizeReply(genericAnswer, { childName, yearLevel, historyCtx }) {
  if (!PERSONALIZE || !historyCtx) return genericAnswer;
  const prompt = [
    `Adapt the tutor answer below for ${childName || "this student"} (Year ${yearLevel || 3}),`,
    `gently using their learning history. Keep the facts identical, stay warm, under 120 words.`,
    ``,
    `History:\n${String(historyCtx).slice(0, 400)}`,
    ``,
    `Answer to adapt:\n"""${genericAnswer}"""`,
    ``,
    `Return ONLY the adapted answer.`,
  ].join("\n");
  try {
    return (await callGemini([{ role: "user", content: prompt }], { temperature: 0.5 })) || genericAnswer;
  } catch (err) {
    console.warn("[quizChat] Personalization failed (serving generic):", err.message);
    return genericAnswer;
  }
}

// -- Build the student's per-question results block (ATTEMPT-AWARE path) -------
function buildAttemptBlock(attemptCtx, questions) {
  if (!attemptCtx) return "";
  const wrong = attemptCtx.wrong_questions || [];
  const wrongByText = new Map(
    wrong.map((w) => [String(w.question_text || "").trim(), w])
  );

  const lines = [];
  lines.push(`\n--- THIS STUDENT'S OWN RESULTS (use this to answer how THEY did) ---`);
  if (attemptCtx.score_pct != null) lines.push(`Overall score: ${attemptCtx.score_pct}%`);

  if (questions && questions.length) {
    questions.forEach((q, i) => {
      const w = wrongByText.get(String(q.question_text || "").trim());
      if (w) {
        lines.push(
          `Q${i + 1}: "${q.question_text}" -> student chose "${w.child_answer}" (INCORRECT); ` +
          `correct answer is "${w.correct_answer || q.correct_answer}".`
        );
      } else {
        lines.push(`Q${i + 1}: "${q.question_text}" -> student answered CORRECTLY.`);
      }
    });
  } else if (wrong.length) {
    wrong.forEach((w) =>
      lines.push(`"${w.question_text}" -> student chose "${w.child_answer}" (INCORRECT); correct is "${w.correct_answer}".`)
    );
  }
  lines.push(`When the student says "question 3" / "Q3", use the Q-numbers above. Explain clearly why their choice was wrong and why the correct answer is right.`);
  return lines.join("\n");
}

// -- JWT child ID extractor ---------------------------------------------------
function extractChildId(req, _res, next) {
  try {
    const auth = (req.headers.authorization || "");
    if (auth.startsWith("Bearer ")) {
      const parts = auth.slice(7).split(".");
      if (parts[1]) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        req.childId   = decoded.childId || decoded.sub || decoded.id || null;
        req.childName = decoded.displayName || decoded.name || "Student";
        req.yearLevel = decoded.yearLevel || 3;
      }
    }
  } catch (e) { /* non-fatal */ }
  next();
}

// -- Load quiz questions from MongoDB -----------------------------------------
async function loadQuizQuestions(quizId, req) {
  const cached = _getCachedQuiz(quizId);
  if (cached) return cached;

  const db = req.app.locals.db;
  if (db) {
    try {
      const quiz = await db.collection("quizzes").findOne(
        { quiz_id: quizId },
        { projection: { questions: 1, question_ids: 1 } }
      );

      if (quiz && quiz.questions && quiz.questions.length) {
        const questions = quiz.questions.map((q) => ({
          question_text:  q.question_text,
          options:        (q.options || []).map(o => o.text || o.label || String(o)),
          correct_answer: q.correct_answer,
          category:       q.category || q.topic || "",
        }));
        _setCachedQuiz(quizId, questions);
        return questions;
      }

      if (quiz && quiz.question_ids && quiz.question_ids.length) {
        const { ObjectId } = require("mongodb");
        const ids = quiz.question_ids.map(id => { try { return new ObjectId(id); } catch (e) { return id; } });
        const docs = await db.collection("questions")
          .find({ _id: { $in: ids } })
          .project({ question_text: 1, options: 1, correct_answer: 1, category: 1 })
          .toArray();
        if (docs.length) {
          const mapped = docs.map((q) => ({
            question_text:  q.question_text,
            options:        (q.options || []).map(o => o.text || o.label || String(o)),
            correct_answer: q.correct_answer,
            category:       q.category || q.topic || "",
          }));
          _setCachedQuiz(quizId, mapped);
          return mapped;
        }
      }
      console.warn(`[quizChat] Quiz ${quizId} not found`);
    } catch (err) {
      console.warn("[quizChat] DB lookup failed:", err.message);
    }
  } else {
    console.warn("[quizChat] req.app.locals.db is not set");
  }
  return null;
}

// -- Route --------------------------------------------------------------------
router.post("/:quizId/chat", extractChildId, chatRateLimit, async (req, res) => {
  const { quizId } = req.params;
  const { message, chat_history: chatHistory = [], attempt_id, subject } = req.body;

  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

  console.log(`[quizChat] Message for quiz ${quizId}: "${message.slice(0, 60)}"`);

  const yearLevel = req.yearLevel || 3;
  const cleanMsg  = message.trim().slice(0, 500);
  const db        = req.app.locals.db;

  // Off-topic guard
  const offTopicPhrases = ["joke","weather","football","cricket","movie","youtube","tiktok","instagram","who made you","are you real","do you like"];
  if (offTopicPhrases.some((p) => message.toLowerCase().includes(p))) {
    return res.json({
      reply: yearLevel <= 5
        ? "I can only help with questions from this quiz! 😊 Try asking about one of the topics here."
        : "I can only answer questions related to this quiz and its topics.",
      cached: false,
    });
  }

  // History → standalone vs follow-up
  const historyMessages = (chatHistory || [])
    .slice(-MAX_CHAT_HISTORY)
    .map((m) => ({
      role: (m.role === "assistant" || m.sender === "ai" || m.sender === "assistant") ? "assistant" : "user",
      content: String(m.content != null ? m.content : (m.text != null ? m.text : "")).slice(0, 500),
    }))
    .filter((m) => m.content);
  const isStandalone = historyMessages.length === 0;

  // ✅ FIX: pass db so the student's attempt data actually loads
  const [attemptCtx, historyCtx] = await Promise.all([
    attempt_id ? getAttemptContext(attempt_id, db).catch(() => null) : Promise.resolve(null),
    req.childId ? getChildHistory(req.childId, db).catch(() => null) : Promise.resolve(null),
  ]);
  const hasAttempt = !!attemptCtx;

  // -- GENERIC cache path (no attempt → shareable) ----------------------------
  let embedding = null;
  if (!hasAttempt && CACHE_ENABLED && isStandalone) {
    try {
      embedding = await embedQuestion(cleanMsg);
      const hit = await checkCache(quizId, embedding);
      if (hit.hit) {
        console.log(`[quizChat] Cache HIT (score ${hit.score.toFixed(3)}) quiz ${quizId}`);
        const reply = await personalizeReply(hit.answer, { childName: req.childName, yearLevel, historyCtx });
        return res.json({ reply, cached: true, cache_score: hit.score });
      }
      console.log(`[quizChat] Cache MISS quiz ${quizId}`);
    } catch (err) {
      console.warn("[quizChat] Cache check failed (non-fatal):", err.message);
    }
  }

  // -- Load quiz context ------------------------------------------------------
  let questions = [];
  try {
    questions = (await loadQuizQuestions(quizId, req)) || [];
  } catch (err) {
    console.error("[quizChat] Failed to load quiz questions:", err.message);
  }
  if (!questions.length) {
    console.warn(`[quizChat] No questions found for quiz ${quizId} — proceeding without context`);
  }

  const quizContext = questions.length
    ? questions.map((q, i) =>
        `Q${i + 1}: ${q.question_text}` +
        (q.options && q.options.length ? ` [Options: ${q.options.join(" / ")}]` : "") +
        (q.correct_answer ? ` [Answer: ${q.correct_answer}]` : "") +
        (q.category ? ` [Topic: ${q.category}]` : "")
      ).join("\n")
    : "No specific quiz context available.";

  const attemptBlock = hasAttempt ? buildAttemptBlock(attemptCtx, questions) : "";

  // -- Build prompt -----------------------------------------------------------
  const systemPrompt = [
    `You are a warm, encouraging AI tutor inside a NAPLAN practice quiz for Australian students.`,
    `The student is in Year ${yearLevel}. Use clear, simple, age-appropriate language and be supportive.`,
    `Only help with this quiz and its topics. If asked about something unrelated, gently steer back to the quiz.`,
    `Keep replies under 120 words. Guide the student's thinking step by step rather than only giving the final answer, unless they explicitly ask for the answer.`,
    `\nQuiz questions for context:\n${quizContext}`,
    attemptBlock,
    subject ? `\nSubject: ${subject}` : "",
  ].filter(Boolean).join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: cleanMsg },
  ];

  // -- Generate ---------------------------------------------------------------
  let genericReply;
  try {
    genericReply = await callGemini(messages);
  } catch (err) {
    console.error("[quizChat] Gemini call failed:", err.message);
    return res.status(500).json({ error: `AI tutor error: ${err.message}` });
  }

  // -- Store in shared cache (GENERIC standalone turns only) ------------------
  if (!hasAttempt && CACHE_ENABLED && isStandalone && embedding && genericReply) {
    storeCache(quizId, embedding, {
      question: cleanMsg, answer: genericReply,
      childId: req.childId, childName: req.childName, yearLevel, subject,
    })
      .then(() => console.log(`[quizChat] Cache STORED quiz ${quizId}`))
      .catch((e) => console.warn("[quizChat] Cache store failed (non-fatal):", e.message));
  }

  // -- Deliver ----------------------------------------------------------------
  // Attempt-aware replies are already personal (built from the student's
  // results). Generic replies get the light history-based personalization.
  const reply = hasAttempt
    ? genericReply
    : await personalizeReply(genericReply, { childName: req.childName, yearLevel, historyCtx });

  return res.json({ reply, cached: false });
});

module.exports = router;