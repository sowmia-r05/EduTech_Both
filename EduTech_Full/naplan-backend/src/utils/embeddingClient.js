/**
 * embeddingClient.js
 *
 * Multi-provider embedding client for originality checks.
 *
 *   gemini   → text-embedding-004                 (768-dim)   — GEMINI_API_KEY
 *   grok     → grok-embedding-small               (1024-dim)  — XAI_API_KEY
 *   openai   → text-embedding-3-small             (1536-dim)  — OPENAI_API_KEY
 *
 * Place at: src/utils/embeddingClient.js
 *
 * Configure via .env:
 *   EMBEDDING_PROVIDER=grok          (gemini | grok | openai — default: gemini)
 *   EMBEDDING_MODEL=                 (override default model for the provider)
 *
 * IMPORTANT: vector dimensionality varies by provider. Once you have ingested
 * the corpus with one provider you cannot mix providers — switching means
 * re-embedding the entire corpus_items collection. Pick one and stick with it.
 *
 * Usage:
 *   const { embedText, embedBatch, cosineSimilarity } = require("./embeddingClient");
 *   const vec = await embedText("What is 2 + 2?");
 *   const sim = cosineSimilarity(vecA, vecB);   // 0..1
 */

// ═══════════════════════════════════════════════════════════════
// PROVIDER: Gemini
// ═══════════════════════════════════════════════════════════════

async function embedTextGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("Embedding (gemini): GEMINI_API_KEY not set");

  const model = process.env.EMBEDDING_MODEL || "text-embedding-004";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: String(text || "").slice(0, 9000) }] },
      taskType: "SEMANTIC_SIMILARITY",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Gemini embed: malformed response");
  return values;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER: Grok (xAI) — OpenAI-compatible /v1/embeddings endpoint
// ═══════════════════════════════════════════════════════════════

async function embedTextGrok(text) {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("Embedding (grok): XAI_API_KEY not set");

  const model = process.env.EMBEDDING_MODEL || "grok-embedding-small";

  const res = await fetch("https://api.x.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: String(text || "").slice(0, 9000),
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok embed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const values = data?.data?.[0]?.embedding;
  if (!Array.isArray(values)) throw new Error("Grok embed: malformed response");
  return values;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER: OpenAI
// ═══════════════════════════════════════════════════════════════

async function embedTextOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Embedding (openai): OPENAI_API_KEY not set");

  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: String(text || "").slice(0, 9000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const values = data?.data?.[0]?.embedding;
  if (!Array.isArray(values)) throw new Error("OpenAI embed: malformed response");
  return values;
}

// ═══════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════

const PROVIDERS = {
  gemini: embedTextGemini,
  grok:   embedTextGrok,
  openai: embedTextOpenAI,
};

async function embedText(text) {
  const provider = (process.env.EMBEDDING_PROVIDER || "gemini").toLowerCase();
  const fn = PROVIDERS[provider];
  if (!fn) {
    throw new Error(
      `Unknown EMBEDDING_PROVIDER: "${provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return fn(text);
}

/**
 * Embed many texts in parallel with concurrency cap.
 * Failed items become null (caller decides what to do).
 */
async function embedBatch(texts, { concurrency = 4, onProgress } = {}) {
  const results = new Array(texts.length).fill(null);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < texts.length) {
      const i = next++;
      try {
        results[i] = await embedText(texts[i]);
      } catch (err) {
        console.error(`embedBatch[${i}] failed:`, err.message);
      }
      done++;
      if (onProgress) onProgress(done, texts.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0..1.
 * Returns 0 if dimensions don't match — important guard when changing providers.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { embedText, embedBatch, cosineSimilarity };