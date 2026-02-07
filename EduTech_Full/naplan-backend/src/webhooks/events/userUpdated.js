const User = require("../../models/user");

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

module.exports = async function userUpdated(payload) {
  const data = payload?.data || payload?.Data || {};
  const user_id = pickFirst(data.user_id, data.userId);

  if (!user_id) {
    console.error("❌ user.updated missing data.user_id. Skipping user update.");
    return;
  }

  const updates = {
    user_name: data.user_name ?? null,
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    email_address: data.email_address ?? "",
    deleted: false,
    updatedAt: new Date(),
  };

  console.log(`👤 user.updated received (user_id=${user_id})`);

  await User.findOneAndUpdate(
    { user_id },
    { $set: updates, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  console.log(`✅ Updated user in MongoDB (user_id=${user_id})`);
};
