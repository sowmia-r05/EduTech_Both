const Result = require("../../models/result");
const Writing = require("../../models/writing");

module.exports = async function responseDeleted(payload) {
  const data = payload?.data || payload?.Data || {};
  const response_id = data.response_id || data.responseId || data?.response?.id;

  if (!response_id) {
    console.log("⚠️ response.deleted received without response_id");
    return;
  }

  await Promise.all([
    Result.deleteOne({ response_id }),
    Writing.deleteOne({ response_id }),
  ]);

  console.log(`🗑️ Deleted response (response_id=${response_id}) from Result/Writing collections`);
};
