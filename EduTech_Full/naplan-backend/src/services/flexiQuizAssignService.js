const axios = require("axios");

const FLEXI_BASE_URL = "https://www.flexiquiz.com/api";
const FLEXI_API_KEY = process.env.FLEXIQUIZ_API_KEY;

function assertKey() {
  if (!FLEXI_API_KEY) throw new Error("Missing FLEXIQUIZ_API_KEY");
}

async function getAllQuizzes() {
  assertKey();
  const url = `${FLEXI_BASE_URL}/v1/quizzes`; // returns [{quiz_id,name,status,...}] :contentReference[oaicite:2]{index=2}
  const { data } = await axios.get(url, {
    headers: { "X-API-KEY": FLEXI_API_KEY },
    timeout: 15000,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Resolve quiz_id by quiz name (case-insensitive match).
 * You must keep FlexiQuiz quiz names consistent (recommended).
 */
async function findQuizIdByName(quizName) {
  const quizzes = await getAllQuizzes();
  const target = String(quizName || "").trim().toLowerCase();

  const hit = quizzes.find((q) => String(q.name || "").trim().toLowerCase() === target);
  return hit?.quiz_id || null;
}

module.exports = { getAllQuizzes, findQuizIdByName };
