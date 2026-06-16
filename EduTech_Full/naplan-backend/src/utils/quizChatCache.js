/**
 * utils/quizChatCache.js
 *
 * Semantic cache for the quiz AI tutor, backed by Qdrant.
 *
 * Strategy (per-quiz, generic shared answers):
 *   - Embed the student's question with Gemini (via embeddingClient).
 *   - Search Qdrant for a near-identical past question ON THE SAME QUIZ.
 *   - Hit (score ≥ threshold)  → return the stored answer, no Gemini call.
 *   - Miss                     → caller generates a fresh answer, then stores it.
 *
 * The stored point's payload carries user details (childId, name, year level)
 * purely as METADATA for later feedback analysis — it never affects matching,
 * which is by question similarity + quizId only.
 *
 * The collection is auto-created on first use, sized to whatever dimension the
 * Gemini embedding returns — so no manual dimension config is needed.
 *
 * Env:
 *   QDRANT_URL                 — required (e.g. https://xxxx.qdrant.io)
 *   QDRANT_API_KEY             — required
 *   QUIZ_CACHE_COLLECTION      — optional, default "quiz_chat_cache"
 *   QUIZ_CACHE_THRESHOLD       — optional, default 0.90 (cosine similarity)
 *
 * Place in: naplan-backend/src/utils/quizChatCache.js
 */

"use strict";

const crypto = require("crypto");
const { embedText } = require("./embeddingClient");

const QDRANT_URL     = (process.env.QDRANT_URL || "").replace(/\/+$/, "");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const COLLECTION     = process.env.QUIZ_CACHE_COLLECTION || "quiz_chat_cache";
const THRESHOLD      = parseFloat(process.env.QUIZ_CACHE_THRESHOLD) || 0.90;

let _collectionReady = false;

function qFetch(path, options = {}) {
  return fetch(`${QDRANT_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": QDRANT_API_KEY,
      ...(options.headers || {}),
    },
  });
}

// Create the collection (sized to the embedding dimension) if it doesn't exist.
async function ensureCollection(dim) {
  if (_collectionReady) return;

  const check = await qFetch(`/collections/${COLLECTION}`);
  if (check.ok) { _collectionReady = true; return; }

  const res = await qFetch(`/collections/${COLLECTION}`, {
    method: "PUT",
    body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } }),
  });
  // 409 = already exists (race) — treat as success
  if (!res.ok && res.status !== 409) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant create collection ${res.status}: ${err.slice(0, 200)}`);
  }
  _collectionReady = true;
}

/**
 * Embed a question once and return the vector (reused for check + store).
 */
async function embedQuestion(text) {
  return embedText(String(text || "").slice(0, 2000));
}

/**
 * Look for a cached answer to a near-identical question on the same quiz.
 * @returns {Promise<{hit:boolean, answer?:string, score?:number}>}
 */
async function checkCache(quizId, embedding) {
  await ensureCollection(embedding.length);

  const res = await qFetch(`/collections/${COLLECTION}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: embedding,
      limit: 1,
      with_payload: true,
      filter: { must: [{ key: "quizId", match: { value: quizId } }] },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant search ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const top = data?.result?.[0];
  if (top && typeof top.score === "number" && top.score >= THRESHOLD) {
    return { hit: true, answer: top.payload?.answer || "", score: top.score };
  }
  return { hit: false };
}

/**
 * Store a generic question→answer pair, with user details as metadata.
 */
async function storeCache(quizId, embedding, meta = {}) {
  await ensureCollection(embedding.length);

  const point = {
    id: crypto.randomUUID(),
    vector: embedding,
    payload: {
      quizId,
      question:  meta.question || "",
      answer:    meta.answer   || "",
      // ── metadata for feedback analysis (NOT used for matching) ──
      childId:   meta.childId   || null,
      childName: meta.childName || null,
      yearLevel: meta.yearLevel || null,
      subject:   meta.subject   || null,
      createdAt: new Date().toISOString(),
    },
  };

  const res = await qFetch(`/collections/${COLLECTION}/points`, {
    method: "PUT",
    body: JSON.stringify({ points: [point] }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant upsert ${res.status}: ${err.slice(0, 200)}`);
  }
  return { stored: true, id: point.id };
}

module.exports = { embedQuestion, checkCache, storeCache, COLLECTION, THRESHOLD };