/**
 * quizChat.js
 * ===========
 * POST /api/quizzes/:quizId/chat
 *
 * Quiz-scoped AI chat.
 *
 * Mount in server.js:
 *   app.use('/api/quizzes', require('./routes/quizChat'));
 *
 * NOTES:
 *   - Python is launched as a MODULE from the backend root (cwd: BACKEND_ROOT)
 *     so that `ai.prompts.*` imports inside gemini_explanation.py resolve.
 *     Launching by file path put only `ai/` on sys.path and broke agent_chat.
 *   - The semantic cache (chat_cache.py) uses Gemini embeddings. While Gemini
 *     is disabled it can't work, so it's gated behind CHAT_CACHE_ENABLED.
 *     Set CHAT_CACHE_ENABLED=true only after migrating embeddings to OpenAI.
 */

"use strict";

const express   = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { spawn } = require("child_process");
const path      = require("path");

const { getAttemptContext } = require("../chat/getAttemptContext");
const { getChildHistory }   = require("../chat/getChildHistory");

const router = express.Router();

// ── Config ─────────────────────────────────────────────────────────────────
const BACKEND_ROOT     = path.resolve(__dirname, "../..");          // naplan-backend/
const GEMINI_SCRIPT    = path.join(BACKEND_ROOT, "ai/gemini_explanation.py");
const CACHE_SCRIPT     = path.join(BACKEND_ROOT, "ai/chat_cache.py");
const PYTHON_BIN       = process.env.PYTHON_BIN || "python3";
const CACHE_ENABLED    = process.env.CHAT_CACHE_ENABLED === "true"; // OFF by default
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
  keyGenerator: (req) => req.childId || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a little before asking again." },
});

// ── Python runner ──────────────────────────────────────────────────────────
// Runs the target script as a MODULE from BACKEND_ROOT so package imports
// (e.g. `import ai.prompts.maths_agent`) resolve correctly.
function runPython(scriptPath, payload) {
  const moduleName = path
    .relative(BACKEND_ROOT, scriptPath)
    .replace(/\.py$/, "")
    .replace(/[\\/]/g, ".");

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, ["-m", moduleName], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
    });
    let stdout = "", stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", () => {
      if (stderr) console.warn(`[quizChat] Python stderr (${moduleName}):`, stderr.slice(0, 500));
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

  // 2. Try req.app.locals.db
  const db = req.app.locals.db;
  if (db) {
    try {
      // Strategy A — questions embedded in quizzes collection
      const quiz = await db.collection("quizzes").findOne(
        { quiz_id: quizId },
        { projection: { questions: 1, question_ids: 1 } }
      );

      if (quiz?.questions?.length) {
        const questions = quiz.questions.map((q) => ({
          question_id:    q.question_id,
          question_text:  q.question_text,
          options:        (q.options || []).map(o => o.text || o.label || String(o)),
          correct_answer: q.correct_answer,
          category:       q.category || q.topic || "",
        }));
        _setCachedQuiz(quizId, questions);
        console.log(`[quizChat] Loaded ${questions.length} questions from quizzes collection`);
        return questions;
      }

      // Strategy B — question_ids array pointing to questions collection
      if (quiz?.question_ids?.length) {
        const { ObjectId } = require("mongodb");
        const ids = quiz.question_ids.map(id => {
          try { return new ObjectId(id); } catch { return id; }
        });
        const questions = await db.collection("questions")
          .find({ _id: { $in: ids } })
          .project({ question_text: 1, options: 1, correct_answer: 1, category: 1 })
          .toArray();
        if (questions.length) {
          const mapped = questions.map((q) => ({
            question_id:    q._id,
            question_text:  q.question_text,
            options:        (q.options || []).map(o => o.text || o.label || String(o)),
            correct_answer: q.correct_answer,
            category:       q.category || q.topic || "",
          }));
          _setCachedQuiz(quizId, mapped);
          console.log(`[quizChat] Loaded ${mapped.length} questions via question_ids`);
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

// ── Store in cache async (fire-and-forget) ─────────────────────────────────
function storeInCacheAsync(quizId, message, answer) {
  if (!CACHE_ENABLED) return; // cache disabled — skip
  runPython(CACHE_SCRIPT, { mode: "store_cache", quiz_id: quizId, message, answer })
    .then((result) => {
      if (result.stored) {
        console.log(`[quizChat] Cache STORED for quiz ${quizId}`);
      } else if (result.error) {
        console.warn(`[quizChat] Cache store returned error: ${result.error}`);
      }
    })
    .catch((err) => console.warn("[quizChat] Cache store failed (non-fatal):", err.message));
}

// ── Route ──────────────────────────────────────────────────────────────────
router.post("/:quizId/chat", extractChildId, chatRateLimit, async (req, res) => {
  const { quizId } = req.params;
  const { message, chat_history: chatHistory = [], attempt_id, subject } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  console.log(`[quizChat] Message for quiz ${quizId}: "${message.slice(0, 60)}"`);

  // ── 1. Check semantic cache (only if enabled) ────────────────────────────
  let cacheHit = false, reply = null, cacheScore = null;

  if (CACHE_ENABLED) {
    try {
      const cacheResult = await runPython(CACHE_SCRIPT, {
        mode: "check_cache", quiz_id: quizId, message: message.trim(), threshold: CACHE_THRESHOLD,
      });
      if (cacheResult.error) {
        console.error(`[quizChat] Cache ERROR: ${cacheResult.error}`);
      } else if (cacheResult._qdrant_error) {
        console.error(`[quizChat] Qdrant ERROR: ${cacheResult._qdrant_error}`);
      } else if (cacheResult.hit) {
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
  }

  // ── 2. Cache miss (or disabled) → call the AI tutor ──────────────────────
  if (!cacheHit) {
    // Load quiz questions
    let questions = [];
    try {
      questions = (await loadQuizQuestions(quizId, req)) || [];
    } catch (err) {
      console.error("[quizChat] Failed to load quiz questions:", err.message);
    }

    // ── Off-topic guard ──────────────────────────────────────────────────
    const offTopicPhrases = ["joke","weather","football","cricket","movie","youtube","tiktok","instagram","who made you","are you real","do you like"];
    const isOffTopic = offTopicPhrases.some((p) => message.toLowerCase().includes(p));
    if (isOffTopic) {
      const youngKid = (req.yearLevel || 3) <= 5;
      return res.json({
        reply: youngKid
          ? "I can only help with questions from this quiz! 😊 Try asking about one of the topics here."
          : "I can only answer questions related to this quiz and its topics.",
        cached: false,
      });
    }

    if (!questions.length) {
      console.warn(`[quizChat] No questions found for quiz ${quizId} — proceeding without context`);
      // Don't 404 — still try to answer without quiz context
    }

    // ── Fetch attempt context + child history in parallel ──
    const [attemptCtx, historyCtx] = await Promise.all([
      attempt_id ? getAttemptContext(attempt_id) : Promise.resolve(null),
      req.childId ? getChildHistory(req.childId) : Promise.resolve(null),
    ]);

    const agentPayload = {
      mode:            "agent_chat",
      subject:         subject || attemptCtx?.subject || "",
      message:         message.trim().slice(0, 500),
      chat_history:    (chatHistory || []).slice(-MAX_CHAT_HISTORY),
      attempt_context: attemptCtx || {},
      history_context: historyCtx  || "",
    };

    let agentResult;
    try {
      agentResult = await runPython(GEMINI_SCRIPT, agentPayload);
    } catch (err) {
      console.error("[quizChat] Agent call failed:", err.message);
      return res.status(500).json({ error: "AI tutor is temporarily unavailable. Please try again." });
    }

    if (!agentResult?.success) {
      console.error("[quizChat] Agent returned error:", agentResult?.error);
      return res.status(500).json({ error: agentResult?.error || "AI response failed." });
    }

    reply = agentResult.reply;

    // Async store in cache (no-op while cache disabled)
    if (reply) storeInCacheAsync(quizId, message.trim(), reply);
  }

  return res.json({
    reply,
    cached: cacheHit,
    ...(cacheHit && cacheScore != null ? { cache_score: cacheScore } : {}),
  });
});

module.exports = router;