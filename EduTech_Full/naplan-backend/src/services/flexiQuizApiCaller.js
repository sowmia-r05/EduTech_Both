const axios = require("axios");

const FLEXI_BASE_URL = "https://www.flexiquiz.com/api";
const FLEXI_API_KEY = process.env.FLEXIQUIZ_API_KEY; // put in .env

function assertIds(quizId, responseId) {
  if (!quizId) throw new Error("Missing quizId");
  if (!responseId) throw new Error("Missing responseId");
  if (!FLEXI_API_KEY) throw new Error("Missing FLEXIQUIZ_API_KEY in env");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Faster + more reliable:
 * - multiple short attempts instead of one long 20s wait
 * - retries if FlexiQuiz isn't finalized yet (empty questions)
 */
async function getResponseQuestions(
  quizId,
  responseId,
  { retries = 4, timeoutMs = 9000, baseDelayMs = 900 } = {}
) {
  assertIds(quizId, responseId);

  const url = `${FLEXI_BASE_URL}/v1/quizzes/${quizId}/responses/${responseId}/questions`;

  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: { "X-API-KEY": FLEXI_API_KEY },
        timeout: timeoutMs,
      });

      const arr = Array.isArray(data) ? data : [];

      // ✅ IMPORTANT: treat empty as "not ready yet" and retry
      if (arr.length === 0) {
        throw new Error("Empty questions (likely not finalized yet)");
      }

      return arr;
    } catch (err) {
      lastErr = err;

      const status = err?.response?.status;
      const body = err?.response?.data;

      // Print short error info (avoid huge JSON stringify)
      console.warn(
        `⚠️ FlexiQuiz getResponseQuestions attempt ${attempt}/${retries} failed` +
          ` status=${status || "NA"} msg=${err.message}` +
          (body ? ` body_keys=${Object.keys(body).slice(0, 10).join(",")}` : "")
      );

      if (attempt < retries) {
        // exponential-ish backoff: 0.9s, 1.4s, 1.9s, 2.4s...
        const wait = baseDelayMs + (attempt - 1) * 500;
        await sleep(wait);
        continue;
      }
    }
  }

  const status = lastErr?.response?.status;
  const body = lastErr?.response?.data;

  throw new Error(
    `FlexiQuiz getResponseQuestions failed after ${retries} attempts: ` +
      `status=${status || "NA"} message=${lastErr?.message || "unknown"} ` +
      `body=${body ? JSON.stringify(body).slice(0, 500) : "{}"}`
  );
}

module.exports = {
  getResponseQuestions,
};
