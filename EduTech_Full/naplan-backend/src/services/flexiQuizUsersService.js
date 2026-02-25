const axios = require("axios");
const crypto = require("crypto");

const FQ_BASE = "https://www.flexiquiz.com/api/v1";
const API_KEY = process.env.FLEXIQUIZ_API_KEY;

function assertApiKey() {
  if (!API_KEY) throw new Error("Missing FLEXIQUIZ_API_KEY in environment");
}

function sanitizePart(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function parseYear(yearLevel) {
  if (typeof yearLevel === "number") return yearLevel;
  const s = String(yearLevel || "").trim();
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function buildBaseUsername(firstName, year) {
  const f = sanitizePart(firstName);
  const y = String(year || "").trim();
  if (!f || !y) return null;
  return `${f}_${y}`; // name_year
}

function generatePassword(length = 16) {
  const lowers = "abcdefghijklmnopqrstuvwxyz";
  const uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";

  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];

  let pw = [pick(lowers), pick(uppers), pick(digits), pick(symbols)];
  const all = lowers + uppers + digits + symbols;

  while (pw.length < length) pw.push(pick(all));

  for (let i = pw.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

async function fqPost(path, dataObj) {
  assertApiKey();

  const body = new URLSearchParams();
  Object.entries(dataObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    body.append(k, String(v));
  });

  const url = `${FQ_BASE}${path}`;
  const res = await axios.post(url, body.toString(), {
    headers: {
      "X-API-KEY": API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 20000,
  });

  return res.data;
}

async function fqFindUserIdByUsername(user_name) {
  try {
    const data = await fqPost("/users/find", { user_name });
    return data?.user_id || null;
  } catch {
    return null;
  }
}

async function generateUniqueUsername(base) {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const exists = await fqFindUserIdByUsername(candidate);
    if (!exists) return candidate;
    candidate = `${base}_${i + 2}`;
  }
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}_${suffix}`;
}

/**
 * Creates user in FlexiQuiz using POST /v1/users
 * This supports extra options as well.
 */
async function fqCreateUser({
  user_name,
  password,
  user_type,
  email_address,
  first_name,
  last_name,
  suspended,
  manage_users,
  manage_groups,
  edit_quizzes,
  send_welcome_email,
  extraFields,
}) {
  return fqPost("/users", {
    user_name,
    password,
    user_type,
    email_address,
    first_name,
    last_name,
    suspended,
    manage_users,
    manage_groups,
    edit_quizzes,
    send_welcome_email,

    // passthrough for any other FlexiQuiz-supported fields
    ...(extraFields && typeof extraFields === "object" ? extraFields : {}),
  });
}

/**
 * Main function you call from routes/controllers
 */
async function registerRespondent({
  firstName,
  lastName,
  yearLevel,
  email,

  // optional flags (defaults)
  userType = "respondent",
  sendWelcomeEmail = true,
  suspended = false,
  manageUsers = false,
  manageGroups = false,
  editQuizzes = false,

  // optional passthrough
  extraFields = null,
}) {
  const year = parseYear(yearLevel);
  if (!firstName || !year) {
    throw new Error("registerRespondent requires firstName and yearLevel");
  }

  const base = buildBaseUsername(firstName, year);
  if (!base) throw new Error("Could not generate base user_name");

  const user_name = await generateUniqueUsername(base);
  const password = generatePassword(16);

  const created = await fqCreateUser({
    user_name,
    password,
    user_type: userType,
    email_address: String(email || "").trim().toLowerCase(), // can be duplicate
    first_name: String(firstName || "").trim(),
    last_name: String(lastName || "").trim(),

    suspended: Boolean(suspended),
    manage_users: Boolean(manageUsers),
    manage_groups: Boolean(manageGroups),
    edit_quizzes: Boolean(editQuizzes),
    send_welcome_email: Boolean(sendWelcomeEmail),

    extraFields,
  });

  return {
    mode: "created",
    user_id: created?.user_id || null,
    user_name,
    password,
    fq: created,
  };
}

module.exports = {
  registerRespondent,
};