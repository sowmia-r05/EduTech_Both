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
  return `${f}_${y}`;
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

async function fqGet(path) {
  assertApiKey();
  const url = `${FQ_BASE}${path}`;
  const res = await axios.get(url, {
    headers: { "X-API-KEY": API_KEY },
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
    ...(extraFields && typeof extraFields === "object" ? extraFields : {}),
  });
}

/**
 * Assign a quiz to a FlexiQuiz user.
 * POST /v1/users/{user_id}/quizzes/{quiz_id}
 */
async function fqAssignQuiz(userId, quizId) {
  return fqPost(`/users/${userId}/quizzes/${quizId}`, {});
}

/**
 * Assign a user to a FlexiQuiz group (gives access to all group quizzes).
 * POST /v1/users/{user_id}/groups/{group_id}
 */
async function fqAssignGroup(userId, groupId) {
  return fqPost(`/users/${userId}/groups/${groupId}`, {});
}

/**
 * Get full user details from FlexiQuiz (includes quizzes array).
 * GET /v1/users/{user_id}
 */
async function fqGetUser(userId) {
  return fqGet(`/users/${userId}`);
}

/**
 * Main function: register a respondent on FlexiQuiz.
 *
 * @param {Object} opts
 * @param {string} opts.firstName - Child display name
 * @param {string} opts.lastName - Parent last name
 * @param {number|string} opts.yearLevel - 3, 5, 7, or 9
 * @param {string} opts.email - Parent email
 * @param {string} [opts.username] - EXACT username to use on FlexiQuiz (same as our DB).
 *                                   If provided, skips the auto-generated name logic.
 * @param {string} [opts.userType='respondent']
 * @param {boolean} [opts.sendWelcomeEmail=false]
 * @param {boolean} [opts.suspended=false]
 * @param {boolean} [opts.manageUsers=false]
 * @param {boolean} [opts.manageGroups=false]
 * @param {boolean} [opts.editQuizzes=false]
 * @param {Object} [opts.extraFields=null]
 */
async function registerRespondent({
  firstName,
  lastName,
  yearLevel,
  email,
  username = null, // ← NEW: pass the child's exact username
  userType = "respondent",
  sendWelcomeEmail = false,
  suspended = false,
  manageUsers = false,
  manageGroups = false,
  editQuizzes = false,
  extraFields = null,
}) {
  let user_name;

  if (username) {
    // ── Use the exact username from our DB ──
    // First check if this username already exists on FlexiQuiz
    const existingId = await fqFindUserIdByUsername(username);
    if (existingId) {
      // User already exists on FlexiQuiz — return existing info
      return {
        mode: "existing",
        user_id: existingId,
        user_name: username,
        password: null, // We don't know the existing password
        fq: { user_id: existingId },
      };
    }
    user_name = username;
  } else {
    // ── Legacy: auto-generate username from firstName + yearLevel ──
    const year = parseYear(yearLevel);
    if (!firstName || !year) {
      throw new Error("registerRespondent requires firstName and yearLevel");
    }
    const base = buildBaseUsername(firstName, year);
    if (!base) throw new Error("Could not generate base user_name");
    user_name = await generateUniqueUsername(base);
  }

  const password = generatePassword(16);

  const created = await fqCreateUser({
    user_name,
    password,
    user_type: userType,
    email_address: String(email || "").trim().toLowerCase(),
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

/**
 * Delete a user from FlexiQuiz.
 * DELETE /v1/users/{user_id}
 *
 * @param {string} userId - FlexiQuiz user_id
 * @returns {Object} - { message: '200: OK' }
 */
async function fqDeleteUser(userId) {
  assertApiKey();
  const url = `${FQ_BASE}/users/${userId}`;
  const res = await axios.delete(url, {
    headers: { "X-API-KEY": API_KEY },
    timeout: 20000,
  });
  return res.data;
}

module.exports = {
  registerRespondent,
  fqAssignQuiz,
  fqAssignGroup,
  fqGetUser,
  fqDeleteUser,        // ← NEW
  fqFindUserIdByUsername,
  generatePassword,
};