const axios = require("axios");

const FLEXI_BASE_URL = "https://www.flexiquiz.com/api";
const FLEXI_API_KEY = process.env.FLEXIQUIZ_API_KEY;

function assertKey() {
  if (!FLEXI_API_KEY) throw new Error("Missing FLEXIQUIZ_API_KEY in env");
}

async function listQuizzes() {
  assertKey();
  const url = `${FLEXI_BASE_URL}/v1/quizzes`;
  const { data } = await axios.get(url, {
    headers: { "X-API-KEY": FLEXI_API_KEY },
    timeout: 15000,
  });
  return Array.isArray(data) ? data : [];
}

async function findQuizIdByName(quizName) {
  const target = String(quizName || "").trim().toLowerCase();
  if (!target) return null;

  const quizzes = await listQuizzes();
  const match = quizzes.find((q) => String(q?.name || "").trim().toLowerCase() === target);

  return match?.quiz_id || match?.id || null;
}

module.exports = { findQuizIdByName };
