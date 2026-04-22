/**
 * fixQuestionOrder.js — one-time repair script
 *
 * For every quiz, sets the `order` field on its questions based on their
 * position in quiz.question_ids (the authoritative admin-set order).
 * If question_ids is empty, falls back to createdAt order.
 *
 * Run with:  node src/scripts/fixQuestionOrder.js
 * Safe to run multiple times.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Quiz     = require("../src/models/quiz");
const Question = require("../src/models/question");

(async () => {
  try {
    await connectDB();
    console.log("✅ Connected to DB");

    const quizzes = await Quiz.find({ subject: "Reading" }).lean();

    console.log(`Found ${quizzes.length} quizzes\n`);

    let totalFixed = 0;

    for (const quiz of quizzes) {
      const questionIds = quiz.question_ids || [];

      // Fetch this quiz's questions
      const questions = await Question.find({ quiz_ids: quiz.quiz_id })
        .sort({ createdAt: 1 })
        .lean();

      if (questions.length === 0) continue;

      // Determine canonical order
      let orderedIds;
      if (questionIds.length > 0) {
        // Use quiz.question_ids as source of truth
        orderedIds = [...questionIds];
        // Append any questions not listed (safety net)
        for (const q of questions) {
          if (!orderedIds.includes(q.question_id)) {
            orderedIds.push(q.question_id);
          }
        }
      } else {
        // Fall back to createdAt order
        orderedIds = questions.map((q) => q.question_id);
      }

      // Write order field on every question
      await Promise.all(
        orderedIds.map((qid, idx) =>
          Question.updateOne(
            { question_id: qid },
            { $set: { order: idx * 1000 } }
          )
        )
      );

      // Also sync question_ids on the quiz in case it was empty
      if (questionIds.length === 0) {
        await Quiz.updateOne(
          { quiz_id: quiz.quiz_id },
          { $set: { question_ids: orderedIds } }
        );
      }

      console.log(`✓ ${quiz.quiz_name} — fixed ${orderedIds.length} questions`);
      totalFixed += orderedIds.length;
    }

    console.log(`\n🎉 Done. Fixed ${totalFixed} question orders across ${quizzes.length} quizzes.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();