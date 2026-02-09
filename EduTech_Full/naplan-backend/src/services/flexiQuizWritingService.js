const axios = require("axios");
const env = require("../config/env");

const BASE = "https://www.flexiquiz.com/api/v1";

/* -------------------- small utils -------------------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickFirst(obj, keys, fallback = "") {
  if (!obj || typeof obj !== "object") return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      return v;
    }
  }
  return fallback;
}

function normalizeRegistrationFields(regFields) {
  const out = {};
  for (const f of regFields || []) {
    const name = String(f?.name || "").trim().toLowerCase();
    const value = String(f?.value || "").trim();
    if (name) out[name] = value;
  }
  return out;
}

function parseFlexiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  // FlexiQuiz sometimes returns "YYYY-MM-DD HH:mm:ss" (no timezone)
  if (typeof value === "string" && value.includes(" ")) {
    const iso = value.replace(" ", "T") + "Z";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function extractUserFields(meta) {
  const reg = normalizeRegistrationFields(meta?.registration_fields || []);

  const first_name = (pickFirst(meta, ["first_name", "firstname"], "") || reg["first name"] || "").trim();
  const last_name = (pickFirst(meta, ["last_name", "lastname"], "") || reg["last name"] || "").trim();
  const email_address = (
    pickFirst(meta, ["email_address", "email", "emailAddress"], "") || reg["email address"] || ""
  ).trim();

  const user_id = pickFirst(meta, ["user_id", "userid", "userId", "account_user_id"], "") || null;
  const user_type = pickFirst(meta, ["user_type", "type", "role"], "");

  const user_name =
    (pickFirst(meta, ["user_name", "username", "display_name", "name"], "") || "").trim() ||
    `${first_name} ${last_name}`.trim() ||
    (reg.name || "").trim() ||
    null;

  const date_created = parseFlexiDate(
    pickFirst(meta, ["date_created", "created_at", "created", "submitted_at", "submittedAt"], "")
  );
  const submitted_at = parseFlexiDate(pickFirst(meta, ["submitted_at", "submittedAt", "date_submitted"], ""));
  const status = pickFirst(meta, ["status"], "");
  const duration_sec = pickFirst(meta, ["duration", "duration_sec", "duration_seconds"], null);

  return {
    user: {
      user_id,
      user_name,
      user_type,
      email_address,
      first_name,
      last_name,
    },
    date_created,
    submitted_at,
    status,
    duration_sec: duration_sec === null || duration_sec === "" ? null : Number(duration_sec),
  };
}

function extractAnswerText(q) {
  const direct = pickFirst(
    q,
    ["answer_text", "answer", "response", "entered_text", "text_answer", "user_answer", "value"],
    ""
  );
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const selected = (q?.options || []).filter((opt) => opt?.selected === true);
  if (selected.length) {
    const parts = selected
      .map((opt) => opt?.answer || opt?.text || opt?.value || "")
      .filter((p) => typeof p === "string" && p.trim())
      .map((p) => p.trim());
    return parts.join("\n");
  }

  return "";
}

function extractQna(questions) {
  const out = [];
  for (const q of questions || []) {
    out.push({
      question_id: q?.question_id ?? q?.questionId ?? null,
      type: q?.type || "",
      question_text: q?.text || "",
      answer_text: extractAnswerText(q),
    });
  }
  return out;
}

function flexiHeaders() {
  return { "X-API-KEY": env.flexiQuizApiKey };
}

function assertApiKey() {
  if (!env.flexiQuizApiKey) {
    throw new Error("FLEXIQUIZ_API_KEY is missing. Set it in .env / deployment env vars.");
  }
}

/* -------------------- API calls -------------------- */

async function fetchResponseMeta(quizId, responseId, timeoutMs) {
  const url = `${BASE}/quizzes/${quizId}/responses/${responseId}`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: timeoutMs });
  return res.data || {};
}

async function fetchResponseQuestions(quizId, responseId, timeoutMs) {
  const url = `${BASE}/quizzes/${quizId}/responses/${responseId}/questions`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: timeoutMs });
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchQuizDetails(quizId, timeoutMs) {
  const url = `${BASE}/quizzes/${quizId}`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: timeoutMs });
  return res.data || {};
}

/**
 * Retry wrapper: used because right after submit FlexiQuiz can return:
 * - status not yet "submitted"
 * - questions empty for a short time
 */
async function withRetry(fn, { retries = 4, baseDelayMs = 800 } = {}) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const wait = baseDelayMs + (attempt - 1) * 500; // 0.8s, 1.3s, 1.8s, 2.3s
        await sleep(wait);
      }
    }
  }

  throw lastErr || new Error("Retry failed");
}

/* -------------------- exports -------------------- */

/**
 * Fetch quiz name by quiz id (used when webhook payload doesn't include quiz_name).
 * Kept same signature.
 */
exports.fetchQuizNameById = async (quizId) => {
  if (!quizId) return "";
  assertApiKey();

  // shorter timeout than 30s
  const details = await fetchQuizDetails(quizId, 10000);
  return String(details?.name || "").trim();
};

/**
 * Build the Writing document payload by calling FlexiQuiz API.
 * Kept same signature + same returned shape.
 *
 * SPEED IMPROVEMENTS:
 * - meta + questions fetched in parallel
 * - retries if not submitted yet / questions empty
 * - smaller timeout per attempt
 */
exports.buildWritingDoc = async ({
  event_id,
  event_type,
  delivery_attempt,
  quiz_id,
  quiz_name,
  response_id,
}) => {
  assertApiKey();

  return withRetry(
    async (attempt) => {
      const timeoutMs = 10000; // per attempt
      // fetch meta + questions in parallel
      const [meta, questions] = await Promise.all([
        fetchResponseMeta(quiz_id, response_id, timeoutMs),
        fetchResponseQuestions(quiz_id, response_id, timeoutMs),
      ]);

      const { user, date_created, submitted_at, status, duration_sec } = extractUserFields(meta);

      // If still not submitted, retry (common immediately after webhook)
      if (String(status || "").toLowerCase() !== "submitted") {
        throw new Error(`Not submitted yet (status=${status || "NA"})`);
      }

      // If questions empty, retry (also common)
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("Questions empty (not finalized yet)");
      }

      const qna = extractQna(questions);

      return {
        event_id,
        event_type,
        delivery_attempt,
        response_id,
        quiz_id,
        quiz_name,
        user,
        date_created,
        submitted_at,
        status,
        duration_sec,
        attempt: meta?.attempt ?? null,
        qna,
      };
    },
    { retries: 4, baseDelayMs: 800 }
  ).catch((err) => {
    // Helpful context without huge dumps
    throw new Error(
      `buildWritingDoc failed (quiz_id=${quiz_id}, response_id=${response_id}): ${err.message}`
    );
  });
};
