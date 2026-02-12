const Result = require("../models/result");
const catalog = require("../config/nextQuizCatalog");

const { findUserId, getAssignedQuizzes, assignQuizToUser } = require("./flexiQuizAssignService"); 
// uses POST /v1/users/find and POST /v1/users/{user_id}/quizzes :contentReference[oaicite:3]{index=3}

const { findQuizIdByName } = require("./flexiQuizQuizLookupService");
const { sendNextQuizMail } = require("./mailService");

const norm = (s) => String(s || "").trim().toLowerCase();

function decideLevel(percent) {
  if (percent < 40) return "Easy";
  if (percent < 70) return "Medium";
  return "Hard";
}

function parseSetNameFromQuizName(quizName) {
  const raw = String(quizName || "");
  const m1 = raw.match(/\b(Easy|Medium|Hard)_Set_(\d+)\b/i);
  if (m1) return `${m1[1][0].toUpperCase()}${m1[1].slice(1).toLowerCase()}_Set_${String(m1[2]).padStart(2,"0")}`;

  const m2 = raw.match(/\b(Easy|Medium|Hard)\s*Set\s*(\d+)\b/i);
  if (m2) return `${m2[1][0].toUpperCase()}${m2[1].slice(1).toLowerCase()}_Set_${String(m2[2]).padStart(2,"0")}`;

  return null;
}

// IMPORTANT: Make your FlexiQuiz quiz names follow ONE format
function buildFlexiQuizName({ year, subject, set_name }) {
  // Example you should use in FlexiQuiz:
  // "Year3 Language - Medium_Set_03"
  const SubjectTitle = subject === "language" ? "Language" : subject;
  return `Year${year} ${SubjectTitle} - ${set_name}`;
}

function pickNextSet(list, currentSetName, usedSetNames) {
  if (!Array.isArray(list) || list.length === 0) return null;

  let start = 0;
  if (currentSetName) {
    const idx = list.indexOf(currentSetName);
    if (idx >= 0) start = idx + 1;
  }

  for (let i = start; i < list.length; i++) {
    if (!usedSetNames.has(list[i])) return list[i];
  }
  for (let i = 0; i < list.length; i++) {
    if (!usedSetNames.has(list[i])) return list[i];
  }
  return null;
}

async function autoAssignNextQuizAndEmail(resultId) {
  const r = await Result.findById(resultId).lean();
  if (!r) return;

  const email = norm(r?.user?.email_address);
  if (!email) return;

  const year = 3;                // you can infer this if needed
  const subject = "language";    // infer if needed
  const percent = Number(r?.score?.percentage ?? 0);
  const level = decideLevel(percent);

  const currentSetName = parseSetNameFromQuizName(r.quiz_name);

  // used sets from DB attempts (so user never gets same set again)
  const prev = await Result.find(
    { "user.email_address": new RegExp(`^${email}$`, "i") },
    { quiz_name: 1 }
  ).lean();

  const usedSetNames = new Set(
    prev.map(x => parseSetNameFromQuizName(x.quiz_name)).filter(Boolean)
  );

  const list = catalog?.[year]?.[subject]?.[level] || [];
  const nextSetName = pickNextSet(list, currentSetName, usedSetNames);
  if (!nextSetName) return;

  // find flexiquiz user_id using POST /v1/users/find :contentReference[oaicite:4]{index=4}
  const userNameOrEmail = r?.user?.user_name || email;
  const userId = r?.user?.user_id || await findUserId(userNameOrEmail);
  if (!userId) return;

  // safety: don't assign same quiz twice if already assigned
  const assigned = await getAssignedQuizzes(userId); // GET /v1/users/{user_id}/quizzes :contentReference[oaicite:5]{index=5}
  const assignedQuizIds = new Set(assigned.map(a => a.quiz_id).filter(Boolean));

  // Resolve quiz_id by quiz name via GET /v1/quizzes :contentReference[oaicite:6]{index=6}
  const flexiQuizName = buildFlexiQuizName({ year, subject, set_name: nextSetName });
  const nextQuizId = await findQuizIdByName(flexiQuizName);

  if (!nextQuizId) {
    console.log("❌ Quiz not found in FlexiQuiz with name:", flexiQuizName);
    return;
  }
  if (assignedQuizIds.has(nextQuizId)) {
    console.log("ℹ️ Already assigned, skipping:", flexiQuizName);
    return;
  }

  // Assign quiz (POST /v1/users/{user_id}/quizzes) :contentReference[oaicite:7]{index=7}
  await assignQuizToUser(userId, nextQuizId);

  // Send email (FlexiQuiz API doesn't show send-email flag for assignment, so we send ourselves) :contentReference[oaicite:8]{index=8}
  await sendNextQuizMail({
    to: email,
    name: r?.user?.first_name || "",
    quizTitle: flexiQuizName,
    quizUrl: "", // optional: if you keep quiz link mapping, place here
  });

  // Save on result for UI (optional)
  await Result.updateOne(
    { _id: resultId },
    { $set: { "next_quiz.set_name": nextSetName, "next_quiz.quiz_name": flexiQuizName, "next_quiz.quiz_id": nextQuizId, "next_quiz.assigned_at": new Date() } }
  );

  console.log(`✅ Assigned next quiz (${flexiQuizName}) and mailed ${email}`);
}

module.exports = { autoAssignNextQuizAndEmail };
