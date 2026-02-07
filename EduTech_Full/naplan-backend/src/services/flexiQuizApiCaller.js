const axios = require("axios");

const FLEXI_BASE_URL = "https://www.flexiquiz.com/api";
const FLEXI_API_KEY = process.env.FLEXIQUIZ_API_KEY; // put in .env

function assertIds(quizId, responseId) {
  if (!quizId) throw new Error("Missing quizId");
  if (!responseId) throw new Error("Missing responseId");
  if (!FLEXI_API_KEY) throw new Error("Missing FLEXIQUIZ_API_KEY in env");
}

async function getResponseQuestions(quizId, responseId) {
  assertIds(quizId, responseId);

  const url = `${FLEXI_BASE_URL}/v1/quizzes/${quizId}/responses/${responseId}/questions`;

  try {
    const { data } = await axios.get(url, {
      headers: { "X-API-KEY": FLEXI_API_KEY },
      timeout: 20000,
    });

    // FlexiQuiz returns an array of questions (like your sample)
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;

    // Helpful debug message
    throw new Error(
      `FlexiQuiz getResponseQuestions failed: status=${status || "NA"} ` +
      `message=${err.message} body=${JSON.stringify(body || {})}`
    );
  }
}

module.exports = {
  getResponseQuestions,
};
