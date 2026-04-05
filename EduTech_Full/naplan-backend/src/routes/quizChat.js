/**
 * quizChat.js
 * ===========
 * POST /api/quizzes/:quizId/chat
 *
 * Quiz-scoped AI chat with semantic caching (Qdrant + Gemini embeddings).
 *
 * Mount in server.js:
 *   app.use('/api/quizzes', require('./routes/quizChat'));
 */

"use strict";

const express   = require("express");
const rateLimit = require("express-rate-limit");
const { spawn } = require("child_process");
const path      = require("path");

const router = express.Router();

// ── Config ─────────────────────────────────────────────────────────────────
const GEMINI_SCRIPT    = path.join(__dirname, "../ai/gemini_explanation.py");
const CACHE_SCRIPT     = path.join(__dirname, "../ai/chat_cache.py");
const PYTHON_BIN       = process.env.PYTHON_BIN || "python3";
const CACHE_THRESHOLD  = parseFloat(process.env.CHAT_CACHE_THRESHOLD || "0.92");
const MAX_CHAT_HISTORY = 6;
const QUIZ_CACHE_TTL   = 10 * 60 * 1000; // 10 min in-process cache

// ── In-process quiz question cache ─────────────────────────────────────────
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

// ── Rate limiter: 20 msg/hour per child ────────────────────────────────────
const chatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.childId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a little before asking again." },
});

// ── Python runner ──────────────────────────────────────────────────────────
function runPython(scriptPath, payload) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [scriptPath]);
    let stdout = "", stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", () => {
      if (stderr) console.warn(`[quizChat] Python stderr (${path.basename(scriptPath)}):`, stderr.slice(0, 500));
      if (!stdout.trim()) return reject(new Error(`Python script produced no output. stderr: ${stderr.slice(0, 300)}`));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error(`Failed to parse Python output: ${stdout.slice(0, 200)}`)); }
    });

    proc.on("error", (err) => reject(new Error(`Failed to spawn Python: ${err.message}. Is '${PYTHON_BIN}' installed?`)));
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

// ── JWT child ID extractor (for rate limiting) ─────────────────────────────
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
  } catch { /* non-fatal */ }
  next();
}

// ── Load quiz questions from MongoDB ───────────────────────────────────────
// Tries multiple strategies to find the quiz, since collection names vary.
async function loadQuizQuestions(quizId, req) {
  // 1. Check in-process cache
  const cached = _getCachedQuiz(quizId);
  if (cached) { console.log(`[quizChat] Quiz ${quizId} served from in-process cache`); return cached; }

  // 2. Try mongoose model (most reliable if you have a Quiz model)
  try {
    const mongoose = require("mongoose");

    // Try common model names — adjust if yours is different
    let QuizModel = null;
    for (const name of ["Quiz", "quiz", "Quizzes"]) {
      try { QuizModel = mongoose.model(name); break; } catch { /* try next */ }
    }

    if (QuizModel) {
      const quiz = await QuizModel.findOne({ quiz_id: quizId }).lean();
      if (quiz && quiz.questions?.length) {
        const questions = quiz.questions.map((q) => ({
          question_id:    q.question_id,
          question_text:  q.question_text,
          options:        q.options || [],
          correct_answer: q.correct_answer,
          category:       q.category || q.topic || "",
        }));
        _setCachedQuiz(quizId, questions);
        console.log(`[quizChat] Loaded ${questions.length} questions via mongoose model`);
        return questions;
      }
    }
  } catch (err) {
    console.warn("[quizChat] Mongoose model lookup failed:", err.message);
  }

  // 3. Try req.app.locals.db (raw MongoDB driver)
  const db = req.app.locals.db;
  if (db) {
    // Try common collection names
    for (const collName of ["quizzes", "quiz", "Quizzes"]) {
      try {
        const quiz = await db.collection(collName).findOne(
          { quiz_id: quizId },
          { projection: { questions: 1, quiz_name: 1, year_level: 1 } }
        );
        if (quiz && quiz.questions?.length) {
          const questions = quiz.questions.map((q) => ({
            question_id:    q.question_id,
            question_text:  q.question_text,
            options:        q.options || [],
            correct_answer: q.correct_answer,
            category:       q.category || q.topic || "",
          }));
          _setCachedQuiz(quizId, questions);
          console.log(`[quizChat] Loaded ${questions.length} questions from '${collName}' collection`);
          return questions;
        }
      } catch { /* try next */ }
    }
    console.warn(`[quizChat] Quiz ${quizId} not found in any known collection`);
  } else {
    console.warn("[quizChat] req.app.locals.db is not set — add: app.locals.db = mongoose.connection.db in server.js");
  }

  return null;
}

// ── Store in cache async (fire-and-forget) ─────────────────────────────────
function storeInCacheAsync(quizId, message, answer) {
  runPython(CACHE_SCRIPT, { mode: "store_cache", quiz_id: quizId, message, answer })
    .catch((err) => console.warn("[quizChat] Cache store failed (non-fatal):", err.message));
}

// ── Route ──────────────────────────────────────────────────────────────────
router.post("/:quizId/chat", extractChildId, chatRateLimit, async (req, res) => {
  const { quizId } = req.params;
  const { message, chat_history: chatHistory = [] } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  console.log(`[quizChat] Message for quiz ${quizId}: "${message.slice(0, 60)}"`);

  // ── 1. Check semantic cache ──────────────────────────────────────────────
  let cacheHit = false, reply = null, cacheScore = null;

  try {
    const cacheResult = await runPython(CACHE_SCRIPT, {
      mode: "check_cache", quiz_id: quizId, message: message.trim(), threshold: CACHE_THRESHOLD,
    });
    if (cacheResult.hit) {
      cacheHit   = true;
      reply      = cacheResult.answer;
      cacheScore = cacheResult.score;
      console.log(`[quizChat] Cache HIT (score: ${cacheScore}) for quiz ${quizId}`);
    } else {
      console.log(`[quizChat] Cache MISS for quiz ${quizId}`);
    }
  } catch (err) {
    console.warn("[quizChat] Cache check failed (non-fatal):", err.message);
  }

  // ── 2. Cache miss → call Gemini ──────────────────────────────────────────
  if (!cacheHit) {
    // Load quiz questions
    let questions = [];
    try {
      questions = (await loadQuizQuestions(quizId, req)) || [];
    } catch (err) {
      console.error("[quizChat] Failed to load quiz questions:", err.message);
    }

    if (!questions.length) {
      console.warn(`[quizChat] No questions found for quiz ${quizId} — proceeding without context`);
      // Don't 404 — still try to answer without quiz context
    }

    const yearLevel = req.yearLevel || 3;
    const childName = req.childName || "Student";

    // Build quiz context string
    const quizContext = questions.length
      ? questions.map((q, i) =>
          `Q${i + 1}: ${q.question_text}` +
          (q.options?.length ? ` [Options: ${q.options.join(" / ")}]` : "") +
          (q.correct_answer ? ` [Answer: ${q.correct_answer}]` : "") +
          (q.category ? ` [Topic: ${q.category}]` : "")
        ).join("\n")
      : "No specific quiz context available.";

    const geminiPayload = {
      mode:         "chat",
      year_level:   yearLevel,
      child_name:   childName,
      message:      message.trim(),
      chat_history: (chatHistory || []).slice(-MAX_CHAT_HISTORY),
      question_context: {
        question_text:  `[QUIZ CONTEXT — answer only from this material]\n\n${quizContext}`,
        correct_answer: "",
        child_answer:   "",
        category:       "NAPLAN quiz",
      },
    };

    let geminiResult;
    try {
      geminiResult = await runPython(GEMINI_SCRIPT, geminiPayload);
    } catch (err) {
      console.error("[quizChat] Gemini call failed:", err.message);
      return res.status(500).json({ error: "AI tutor is temporarily unavailable. Please try again." });
    }

    if (!geminiResult?.success) {
      console.error("[quizChat] Gemini returned error:", geminiResult?.error);
      return res.status(500).json({ error: geminiResult?.error || "AI response failed." });
    }

    reply = geminiResult.reply;

    // Async store in cache
    if (reply) storeInCacheAsync(quizId, message.trim(), reply);
  }

  return res.json({
    reply,
    cached: cacheHit,
    ...(cacheHit && cacheScore != null ? { cache_score: cacheScore } : {}),
  });
});

module.exports = router;