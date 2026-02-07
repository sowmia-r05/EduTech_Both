const axios = require("axios");
const env = require("../config/env");

const FLEXIQUIZ_BASE_URL = "https://www.flexiquiz.com/api/v1";

exports.getQuizResult = async (attemptId) => {
  try {
    const response = await axios.get(
      `${FLEXIQUIZ_BASE_URL}/attempts/${attemptId}`,
      {
        headers: {
          Authorization: `Bearer ${env.flexiQuizApiKey}`,
        },
      }
    );

    return response.data;
  } catch (err) {
    console.error("FlexiQuiz API error:", err.message);
    throw err;
  }
};
