const User = require("../../models/user");

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

module.exports = async function userDeleted(payload) {
  const data = payload?.data || payload?.Data || {};
  const user_id = pickFirst(data.user_id, data.userId);

  if (!user_id) {
    console.error("❌ user.deleted missing data.user_id. Skipping user delete reflect.");
    return;
  }

  console.log(`👤 user.deleted received (user_id=${user_id})`);

  // We **do not remove** the document. We mark it deleted so your DB has history.
  await User.findOneAndUpdate(
    { user_id },
    { $set: { deleted: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), user_id } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  console.log(`✅ Marked user as deleted in MongoDB (user_id=${user_id})`);
};
