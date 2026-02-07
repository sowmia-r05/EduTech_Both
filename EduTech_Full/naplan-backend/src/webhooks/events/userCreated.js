const User = require("../../models/user");

// helper: pick first non-empty
function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

module.exports = async function userCreated(payload) {
  const data = payload?.data || payload?.Data || {};

  const user_id = pickFirst(data.user_id, data.userId);
  if (!user_id) {
    console.error("❌ user.created missing data.user_id. Skipping user save.");
    return;
  }

  const doc = {
    user_id,
    user_name: data.user_name ?? null,
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    email_address: data.email_address ?? "",
    deleted: false,
    updatedAt: new Date(),
  };

  console.log(`👤 user.created received (user_id=${user_id})`);

  // Upsert so retries don't create duplicates
  await User.findOneAndUpdate({ user_id }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });

  console.log(`✅ Saved user in MongoDB (user_id=${user_id})`);
};
