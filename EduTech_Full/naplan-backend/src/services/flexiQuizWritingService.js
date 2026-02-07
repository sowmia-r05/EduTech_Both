const axios = require("axios");
const env = require("../config/env");

const BASE = "https://www.flexiquiz.com/api/v1";

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
  // Many schemas store the typed answer directly on the question object
  const direct = pickFirst(
    q,
    ["answer_text", "answer", "response", "entered_text", "text_answer", "user_answer", "value"],
    ""
  );
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // Otherwise fall back to selected options
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
  return {
    "X-API-KEY": env.flexiQuizApiKey,
  };
}

async function fetchResponseMeta(quizId, responseId) {
  const url = `${BASE}/quizzes/${quizId}/responses/${responseId}`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: 30000 });
  return res.data || {};
}

async function fetchResponseQuestions(quizId, responseId) {
  const url = `${BASE}/quizzes/${quizId}/responses/${responseId}/questions`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: 30000 });
  return res.data || [];
}

async function fetchQuizDetails(quizId) {
  const url = `${BASE}/quizzes/${quizId}`;
  const res = await axios.get(url, { headers: flexiHeaders(), timeout: 30000 });
  return res.data || {};
}

/**
 * Fetch quiz name by quiz id (used when webhook payload doesn't include quiz_name).
 */
exports.fetchQuizNameById = async (quizId) => {
  if (!quizId) return "";
  if (!env.flexiQuizApiKey) {
    throw new Error("FLEXIQUIZ_API_KEY is missing. Set it in .env / deployment env vars.");
  }
  const details = await fetchQuizDetails(quizId);
  return String(details?.name || "").trim();
};

/**
 * Build the Writing document payload by calling FlexiQuiz API.
 */
exports.buildWritingDoc = async ({ event_id, event_type, delivery_attempt, quiz_id, quiz_name, response_id }) => {
  if (!env.flexiQuizApiKey) {
    throw new Error("FLEXIQUIZ_API_KEY is missing. Set it in .env / deployment env vars.");
  }

  const meta = await fetchResponseMeta(quiz_id, response_id);
  const { user, date_created, submitted_at, status, duration_sec } = extractUserFields(meta);

  // Only keep submitted attempts (extra safety)
  if (String(status || "").toLowerCase() !== "submitted") {
    return null;
  }

  const questions = await fetchResponseQuestions(quiz_id, response_id);
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
};
