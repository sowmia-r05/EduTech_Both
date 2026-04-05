/**
 * quizChat.js
 * ===========
 * POST /api/quizzes/:quizId/chat
 *
 * Quiz-scoped AI chat with semantic caching via Qdrant.
 *
 * Flow:
 *   1. Rate-limit per child (20 messages / hour)
 *   2. Check Qdrant semantic cache  →  return instantly on hit
 *   3. Load quiz questions from MongoDB (in-process LRU cache, 10-min TTL)
 *   4. Build Gemini chat prompt scoped to this quiz's questions only
 *   5. Call gemini_explanation.py (mode=chat)
 *   6. Async: store the Q&A pair in Qdrant cache for future users
 *   7. Return reply + metadata
 *
 * Mount in server.js:
 *   const quizChatRouter = require('./routes/quizChat');
 *   app.use('/api/quizzes', quizChatRouter);
 */

"use strict";

const express    = require("express");
const rateLimit  = require("express-rate-limit");
const { spawn }  = require("child_process");
const path       = require("path");

const router = express.Router();

// ── Config ────────────────────────────────────────────────────────────────────
const GEMINI_SCRIPT     = path.join(__dirname, "../ai/gemini_explanation.py");
const CACHE_SCRIPT      = path.join(__dirname, "../ai/chat_cache.py");
const PYTHON_BIN        = process.env.PYTHON_BIN || "python3";
const CACHE_THRESHOLD   = parseFloat(process.env.CHAT_CACHE_THRESHOLD || "0.92");
const MAX_CHAT_HISTORY  = 6;   // last N messages sent to Gemini (3 turns)
const QUIZ_CACHE_TTL_MS = 10 * 60 * 1000;  // quiz questions cached in-process for 10 min

// ── In-process quiz question cache (avoids DB hit on every message) ───────────
// Map<quizId, { questions: [...], cachedAt: timestamp }>
const _quizCache = new Map();

function _getCachedQuiz(quizId) {
  const entry = _quizCache.get(quizId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > QUIZ_CACHE_TTL_MS) {
    _quizCache.delete(quizId);
    return null;
  }
  return entry.questions;
}

function _setCachedQuiz(quizId, questions) {
  // Keep the map bounded — evict oldest entry if over 200 quizzes
  if (_quizCache.size >= 200) {
    const firstKey = _quizCache.keys().next().value;
    _quizCache.delete(firstKey);
  }
  _quizCache.set(quizId, { questions, cachedAt: Date.now() });
}

// ── Rate limiter: 20 requests / hour per child ─────────────────────────────────
const chatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => {
    // Key on childId from JWT if available, else fallback to IP
    return req.childId || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a little before asking again." },
});

// ── Python helper ──────────────────────────────────────────────────────────────
function runPython(scriptPath, payload) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [scriptPath]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (!stdout.trim()) {
        return reject(new Error(`Python script produced no output. stderr: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Failed to parse Python output: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on("error", (err) => reject(err));
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

// ── Auth middleware (reuse your existing pattern) ─────────────────────────────
// This extracts childId from the JWT so the rate limiter can key on it.
// If you already have a verifyChildToken middleware, replace this with that.
function extractChildId(req, _res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      // JWT payload is base64url — decode without verifying here (verification
      // happens in your auth middleware upstream). We only need the child ID for
      // rate limiting; actual auth should be validated by your existing guards.
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
        req.childId = decoded.childId || decoded.sub || decoded.id || null;
        req.childName = decoded.displayName || decoded.name || "Student";
        req.yearLevel = decoded.yearLevel || 3;
      }
    }
  } catch {
    // Non-fatal — rate limiter falls back to IP
  }
  next();
}

// ── Quiz questions loader ──────────────────────────────────────────────────────
async function loadQuizQuestions(quizId, db) {
  // Check in-process cache first
  const cached = _getCachedQuiz(quizId);
  if (cached) return cached;

  // Load from MongoDB
  // Adjust the collection name / query to match your actual schema
  const Quiz = db.collection("quizzes");
  const quiz = await Quiz.findOne(
    { quiz_id: quizId },
    { projection: { questions: 1, quiz_name: 1, year_level: 1 } }
  );

  if (!quiz) return null;

  // Flatten to minimal context for Gemini — we don't need to send image URLs etc.
  const questions = (quiz.questions || []).map((q) => ({
    question_id:    q.question_id,
    question_text:  q.question_text,
    options:        q.options || [],
    correct_answer: q.correct_answer,
    category:       q.category || q.topic || "",
    explanation:    q.explanation || "",
  }));

  _setCachedQuiz(quizId, questions);
  return questions;
}

// ── Build Gemini chat prompt ───────────────────────────────────────────────────
function buildQuizChatPayload({
  questions,
  chatHistory,
  message,
  yearLevel,
  childName,
}) {
  // Summarise the quiz content so Gemini stays scoped to it
  const quizContext = questions
    .map(
      (q, i) =>
        `Q${i + 1}: ${q.question_text}` +
        (q.options?.length ? ` [Options: ${q.options.join(" / ")}]` : "") +
        (q.correct_answer ? ` [Answer: ${q.correct_answer}]` : "") +
        (q.category ? ` [Topic: ${q.category}]` : "")
    )
    .join("\n");

  return {
    mode:        "chat",
    year_level:  yearLevel || 3,
    child_name:  childName || "Student",
    message,
    chat_history: (chatHistory || []).slice(-MAX_CHAT_HISTORY),
    // We inject the quiz context into question_context so gemini_explanation.py
    // can use it. The build_chat_prompt function already reads question_context.
    question_context: {
      question_text:  `[QUIZ CONTEXT — answer only from this material]\n\n${quizContext}`,
      correct_answer: "",
      child_answer:   "",
      category:       "NAPLAN quiz",
    },
  };
}

// ── Store cache async (fire-and-forget, never blocks the response) ─────────────
function storeInCacheAsync(quizId, message, answer) {
  runPython(CACHE_SCRIPT, {
    mode:    "store_cache",
    quiz_id: quizId,
    message,
    answer,
  }).catch((err) => {
    console.warn("[quizChat] Cache store failed (non-fatal):", err.message);
  });
}

// ── Route ──────────────────────────────────────────────────────────────────────
router.post(
  "/:quizId/chat",
  extractChildId,
  chatRateLimit,
  async (req, res) => {
    const { quizId } = req.params;
    const { message, chat_history: chatHistory = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    // Access the MongoDB db instance — adjust to how your app exposes it.
    // Common patterns: req.app.locals.db  |  require('../db').getDb()
    const db = req.app.locals.db;

    // ── 1. Check semantic cache ────────────────────────────────────────────
    let cacheHit = false;
    let reply    = null;
    let cacheScore = null;

    try {
      const cacheResult = await runPython(CACHE_SCRIPT, {
        mode:      "check_cache",
        quiz_id:   quizId,
        message:   message.trim(),
        threshold: CACHE_THRESHOLD,
      });

      if (cacheResult.hit) {
        cacheHit   = true;
        reply      = cacheResult.answer;
        cacheScore = cacheResult.score;
      }
    } catch (err) {
      // Cache miss on error — continue to Gemini
      console.warn("[quizChat] Cache check failed (non-fatal):", err.message);
    }

    // ── 2. Cache miss → call Gemini ────────────────────────────────────────
    if (!cacheHit) {
      // Load quiz questions (cached in-process)
      let questions = [];
      try {
        questions = (await loadQuizQuestions(quizId, db)) || [];
      } catch (err) {
        console.error("[quizChat] Failed to load quiz questions:", err.message);
        // Continue with empty context rather than 500-ing the user
      }

      if (!questions.length) {
        return res.status(404).json({ error: "Quiz not found or has no questions." });
      }

      const yearLevel = req.yearLevel || questions[0]?.year_level || 3;
      const childName = req.childName || "Student";

      // Build Gemini payload
      const geminiPayload = buildQuizChatPayload({
        questions,
        chatHistory,
        message: message.trim(),
        yearLevel,
        childName,
      });

      // Call gemini_explanation.py (mode=chat)
      let geminiResult;
      try {
        geminiResult = await runPython(GEMINI_SCRIPT, geminiPayload);
      } catch (err) {
        console.error("[quizChat] Gemini call failed:", err.message);
        return res.status(500).json({ error: "AI tutor is temporarily unavailable." });
      }

      if (!geminiResult.success) {
        return res.status(500).json({ error: geminiResult.error || "AI response failed." });
      }

      reply = geminiResult.reply;

      // ── 3. Async: store in cache (never blocks response) ────────────────
      storeInCacheAsync(quizId, message.trim(), reply);
    }

    return res.json({
      reply,
      cached: cacheHit,
      ...(cacheHit && cacheScore != null ? { cache_score: cacheScore } : {}),
    });
  }
);

module.exports = router;