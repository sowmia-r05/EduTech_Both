const Result = require("../models/result");
const catalog = require("../config/nextQuizCatalog");

const { findUserId, getAssignedQuizzes, assignQuizToUser } = require("./flexiQuizAssignService");
const { findQuizIdByName } = require("./flexiQuizQuizLookupService");
const { sendNextQuizMail } = require("./mailService");

const norm = (s) => String(s || "").trim().toLowerCase();

function decideLevel(percent) {
  if (percent < 40) return "Easy";
  if (percent < 70) return "Medium";
  return "Hard";
}

function pickNextQuizName(list, usedNames) {
  for (const name of list) if (!usedNames.has(norm(name))) return name;
  return null;
}

async function autoAssignNextQuizAndEmail(resultId) {
  const r = await Result.findById(resultId).lean();
  if (!r) return;

  const email = norm(r?.user?.email_address);
  if (!email) return;

  // TODO: infer these from quiz_name if needed
  const year = 3;
  const subject = "language";

  const percent = Number(r?.score?.percentage ?? 0);
  const level = decideLevel(percent);

  // Previous attempts => don’t repeat same quiz name
  const prev = await Result.find(
    { "user.email_address": new RegExp(`^${email}$`, "i") },
    { quiz_name: 1 }
  ).lean();

  const usedQuizNames = new Set(prev.map(x => norm(x.quiz_name)).filter(Boolean));

  const list = catalog?.[year]?.[subject]?.[level] || [];
  const nextQuizName = pickNextQuizName(list, usedQuizNames);
  if (!nextQuizName) {
    console.log("No next quiz available for", email, year, subject, level);
    return;
  }

  const userNameOrEmail = r?.user?.user_name || email;
  const userId = r?.user?.user_id || await findUserId(userNameOrEmail);
  if (!userId) return;

  // avoid assigning same quiz twice
  const assigned = await getAssignedQuizzes(userId);
  const assignedQuizIds = new Set(assigned.map(a => a.quiz_id).filter(Boolean));

  const nextQuizId = await findQuizIdByName(nextQuizName);
  if (!nextQuizId) {
    console.log("❌ Quiz not found in FlexiQuiz:", nextQuizName);
    return;
  }
  if (assignedQuizIds.has(nextQuizId)) {
    console.log("ℹ️ Already assigned, skipping:", nextQuizName);
    return;
  }

  await assignQuizToUser(userId, nextQuizId);

  await Result.updateOne(
    { _id: resultId },
    {
      $set: {
        "next_quiz.quiz_name": nextQuizName,
        "next_quiz.quiz_id": nextQuizId,
        "next_quiz.subject": subject,
        "next_quiz.year": year,
        "next_quiz.level": level,
        "next_quiz.assigned_at": new Date(),
      },
    }
  );

  await sendNextQuizMail({
    to: email,
    name: r?.user?.first_name || "",
    quizTitle: nextQuizName,
    quizUrl: "", // optional if you have mapping
  });

  console.log(`✅ Assigned next quiz (${nextQuizName}) + emailed ${email}`);
}

module.exports = { autoAssignNextQuizAndEmail };
