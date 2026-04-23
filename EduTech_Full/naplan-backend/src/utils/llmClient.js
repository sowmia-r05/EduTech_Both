/**
 * llmClient.js
 *
 * Unified LLM client supporting multiple providers.
 * Switch providers by setting LLM_PROVIDER in .env:
 *
 *   - gemini    (Google Gemini — closed, free tier available)
 *   - openai    (OpenAI GPT-4o, gpt-4o-mini — closed)
 *   - anthropic (Claude — closed)
 *   - groq      (Llama 3.3 70B, Mixtral via Groq — OPEN-SOURCE, free tier, fast)
 *   - together  (Together.ai — hosted open-source Llama/Mistral/Qwen)
 *   - ollama    (self-hosted open-source — no API key needed)
 *
 * All providers expose the same interface:
 *   const llm = createLLMClient();
 *   const text = await llm.generate({ prompt, temperature, maxTokens, systemPrompt });
 *
 * For auto-fallback (recommended in production):
 *   const llm = createLLMClientWithFallback();
 */

// ─── Provider: Gemini ────────────────────────────────────────
async function geminiGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini: no API key set (GEMINI_API_KEY or LLM_API_KEY)");

  const model = process.env.LLM_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const finalPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Provider: OpenAI ────────────────────────────────────────
async function openaiGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI: no API key set (OPENAI_API_KEY or LLM_API_KEY)");

  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ─── Provider: Anthropic (Claude) ────────────────────────────
async function anthropicGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic: no API key set (ANTHROPIC_API_KEY or LLM_API_KEY)");

  const model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ─── Provider: Groq (OPEN-SOURCE, free tier) ─────────────────
// Hosts Llama 3.3 70B, Mixtral, Gemma. OpenAI-compatible API.
// Free tier: ~14,400 req/day, 30 req/min. Sign up at console.groq.com
async function groqGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq: no API key set (GROQ_API_KEY or LLM_API_KEY)");

  const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ─── Provider: Together.ai (OPEN-SOURCE, hosted) ─────────────
async function togetherGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("Together: no API key set (TOGETHER_API_KEY or LLM_API_KEY)");

  const model = process.env.LLM_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Together error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ─── Provider: Ollama (self-hosted OPEN-SOURCE) ──────────────
// Run models locally: https://ollama.com
// No API key needed. Set OLLAMA_BASE_URL if not on localhost.
async function ollamaGenerate({ prompt, temperature = 0.4, maxTokens = 4000, systemPrompt }) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.LLM_MODEL || "llama3.2";

  const finalPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: finalPrompt,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.response || "";
}

// ─── Dispatcher ──────────────────────────────────────────────
const PROVIDERS = {
  gemini: geminiGenerate,
  openai: openaiGenerate,
  anthropic: anthropicGenerate,
  groq: groqGenerate,
  together: togetherGenerate,
  ollama: ollamaGenerate,
};

/**
 * Create an LLM client. Reads provider from env by default.
 * Override per call: createLLMClient({ provider: "groq" })
 */
function createLLMClient(overrides = {}) {
  const provider = (overrides.provider || process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const fn = PROVIDERS[provider];
  if (!fn) {
    throw new Error(
      `Unknown LLM provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  return {
    provider,
    async generate(args) {
      return fn(args);
    },
  };
}

/**
 * Create a client with automatic fallback.
 * If the primary fails (rate limit, outage, JSON parse error), tries the fallback.
 *
 * Config:
 *   LLM_PROVIDER=groq            (primary — free open-source)
 *   LLM_FALLBACK_PROVIDER=gemini (fallback if primary fails)
 */
function createLLMClientWithFallback() {
  const primaryProvider = process.env.LLM_PROVIDER || "gemini";
  const fallbackProvider = process.env.LLM_FALLBACK_PROVIDER || null;

  const primary = createLLMClient({ provider: primaryProvider });
  const fallback = fallbackProvider ? createLLMClient({ provider: fallbackProvider }) : null;

  return {
    provider: fallback ? `${primary.provider} → ${fallback.provider}` : primary.provider,
    async generate(args) {
      try {
        return await primary.generate(args);
      } catch (err) {
        if (!fallback) throw err;
        console.warn(
          `⚠️  ${primary.provider} failed (${err.message.slice(0, 100)}). Falling back to ${fallback.provider}...`
        );
        return await fallback.generate(args);
      }
    },
  };
}

/**
 * Generate + parse JSON from model output.
 * Handles markdown code fences (```json) and extracts JSON object.
 */
async function generateJSON(client, args) {
  const text = await client.generate(args);
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    // Extract the outermost JSON object
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end));
      } catch {
        // fallthrough to the error below
      }
    }
    throw new Error(`No valid JSON in LLM output: ${clean.slice(0, 300)}`);
  }
}

module.exports = {
  createLLMClient,
  createLLMClientWithFallback,
  generateJSON,
};