/**
 * routes/adminRoutes.js
 * 
 * Admin-only API routes for quiz management.
 * Protected by adminAuth middleware — not accessible to parents/children.
 * 
 * Mount in server.js:
 *   const adminRoutes = require("./routes/adminRoutes");
 *   app.use("/api/admin", adminRoutes);
 */

const express = require("express");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { adminLogin, requireAdmin } = require("../middleware/adminAuth");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizCatalog = require("../models/quizCatalog");
const Child = require("../models/child");

const router = express.Router();

// ─── Public: Admin Login ───
router.post("/login", adminLogin);

// ─── Public: Download Excel Template ───
// The template file should be placed at: /public/Quiz_Upload_Template.xlsx
// Or serve from a static location
router.get("/template", (req, res) => {
  const templatePath = path.join(__dirname, "..", "public", "Quiz_Upload_Template.xlsx");
  res.download(templatePath, "Quiz_Upload_Template.xlsx", (err) => {
    if (err) {
      console.error("Template download error:", err.message);
      res.status(404).json({ error: "Template file not found" });
    }
  });
});

// ═══════════════════════════════════════
// All routes below require admin auth
// ═══════════════════════════════════════
router.use(requireAdmin);

// ─── List all quizzes ───
router.get("/quizzes", async (req, res) => {
  try {
    const quizzes = await Quiz.find()
      .sort({ year_level: 1, subject: 1, quiz_name: 1 })
      .lean();
    res.json(quizzes);
  } catch (err) {
    console.error("List quizzes error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get quiz with questions ───
router.get("/quizzes/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.find({ quiz_ids: quiz.quiz_id })
      .sort({ order: 1 })
      .lean();

    res.json({ ...quiz, questions });
  } catch (err) {
    console.error("Get quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload quiz from parsed Excel data ───
router.post("/quizzes/upload", async (req, res) => {
  try {
    const { quiz: quizData, questions: questionsData } = req.body;

    if (!quizData || !questionsData || !Array.isArray(questionsData)) {
      return res.status(400).json({ error: "Invalid payload. Expected { quiz, questions[] }" });
    }

    // Validate required quiz fields
    if (!quizData.quiz_name) return res.status(400).json({ error: "quiz_name is required" });
    if (![3, 5, 7, 9].includes(quizData.year_level)) return res.status(400).json({ error: "year_level must be 3, 5, 7, or 9" });
    if (!["Maths", "Reading", "Writing", "Conventions"].includes(quizData.subject)) {
      return res.status(400).json({ error: "subject must be Maths, Reading, Writing, or Conventions" });
    }
    if (questionsData.length === 0) return res.status(400).json({ error: "At least one question is required" });

    // Generate quiz ID
    const quizId = uuidv4();
    let totalPoints = 0;

    // Create Question documents
    const questionDocs = questionsData.map((q, idx) => {
      const questionId = uuidv4();
      const points = q.points || 1;
      totalPoints += points;

      // Build options with IDs
      const options = (q.options || []).map((opt) => ({
        option_id: uuidv4(),
        text: opt.text || "",
        image_url: opt.image_url || null,
        correct: Boolean(opt.correct),
      }));

      // Build categories
      const categories = q.category
        ? [{ category_id: uuidv4(), name: q.category }]
        : [];

      return {
        question_id: questionId,
        quiz_ids: [quizId],
        type: q.type,
        text: q.question_text,
        options,
        points,
        categories,
        order: q.order || idx + 1,
        year_level: quizData.year_level,
        subject: quizData.subject,
        image_url: q.image_url || null,
        explanation: q.explanation || "",
      };
    });

    // Save questions in bulk
    const savedQuestions = await Question.insertMany(questionDocs);
    const questionIds = savedQuestions.map((q) => q.question_id);

    // Create Quiz document
    const quiz = await Quiz.create({
      quiz_id: quizId,
      quiz_name: quizData.quiz_name,
      year_level: quizData.year_level,
      subject: quizData.subject,
      question_ids: questionIds,
      question_count: questionIds.length,
      time_limit_minutes: quizData.time_limit_minutes || null,
      total_points: totalPoints,
      tier: quizData.tier || "A",
      difficulty: quizData.difficulty || null,
      set_number: quizData.set_number || 1,
      is_trial: Boolean(quizData.is_trial),
      is_active: true,
    });

    console.log(`✅ Quiz uploaded: "${quiz.quiz_name}" (${questionIds.length} questions, ${totalPoints} points)`);

    res.status(201).json({
      quiz_id: quiz.quiz_id,
      quiz_name: quiz.quiz_name,
      question_count: quiz.question_count,
      total_points: quiz.total_points,
      message: "Quiz uploaded successfully",
    });
  } catch (err) {
    console.error("Upload quiz error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "A quiz with this ID already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── Update quiz settings ───
// PATCH /api/admin/quizzes/:quizId
// Body: any of { quiz_name, time_limit_minutes, difficulty, tier, is_active, is_trial, year_level, subject }
router.patch("/quizzes/:quizId", requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const allowedFields = [
      "quiz_name", "time_limit_minutes", "difficulty", "tier",
      "is_active", "is_trial", "year_level", "subject", "set_number"
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Allow setting time_limit_minutes to null (no limit)
    if (req.body.time_limit_minutes === null || req.body.time_limit_minutes === "") {
      updates.time_limit_minutes = null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await Quiz.findOneAndUpdate(
      { quiz_id: req.params.quizId },
      { $set: updates },
      { new: true }
    );

    console.log(`✏️ Quiz updated: "${updated.quiz_name}" →`, updates);
    res.json(updated);
  } catch (err) {
    console.error("Update quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update a single question ───
// PATCH /api/admin/questions/:questionId
router.patch("/questions/:questionId", requireAdmin, async (req, res) => {
  try {
    const question = await Question.findOne({ question_id: req.params.questionId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    const { text, type, options, points, category, image_url, explanation } = req.body;

    if (text !== undefined) question.text = text;
    if (type !== undefined) question.type = type;
    if (points !== undefined) question.points = points;
    if (image_url !== undefined) question.image_url = image_url;
    if (explanation !== undefined) question.explanation = explanation;
    if (category !== undefined) {
      question.categories = category
        ? [{ category_id: question.categories?.[0]?.category_id || require("uuid").v4(), name: category }]
        : [];
    }
    if (options !== undefined && Array.isArray(options)) {
      question.options = options.map((opt, i) => ({
        option_id: opt.option_id || require("uuid").v4(),
        text: opt.text || "",
        image_url: opt.image_url || null,
        correct: Boolean(opt.correct),
      }));
    }

    await question.save();

    // Recalculate quiz total_points
    for (const quizId of question.quiz_ids) {
      const questions = await Question.find({ quiz_ids: quizId }).lean();
      const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
      await Quiz.updateOne({ quiz_id: quizId }, { $set: { total_points: totalPoints } });
    }

    console.log(`✏️ Question updated: ${question.question_id}`);
    res.json(question);
  } catch (err) {
    console.error("Update question error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete a single question from a quiz ───
// DELETE /api/admin/questions/:questionId?quiz_id=xxx
router.delete("/questions/:questionId", requireAdmin, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { quiz_id } = req.query;

    const question = await Question.findOne({ question_id: questionId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    if (quiz_id) {
      // Remove from specific quiz
      question.quiz_ids = question.quiz_ids.filter((id) => id !== quiz_id);
      if (question.quiz_ids.length === 0) {
        await Question.deleteOne({ question_id: questionId });
      } else {
        await question.save();
      }
      // Update quiz question count
      const remaining = await Question.countDocuments({ quiz_ids: quiz_id });
      const totalPoints = (await Question.find({ quiz_ids: quiz_id }).lean()).reduce((s, q) => s + (q.points || 1), 0);
      await Quiz.updateOne({ quiz_id }, { $set: { question_count: remaining, total_points: totalPoints, question_ids: (await Question.find({ quiz_ids: quiz_id }).lean()).map(q => q.question_id) } });
    } else {
      await Question.deleteOne({ question_id: questionId });
    }

    console.log(`🗑️ Question deleted: ${questionId}`);
    res.json({ message: "Question deleted" });
  } catch (err) {
    console.error("Delete question error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete quiz and its questions ───
router.delete("/quizzes/:quizId", async (req, res) => {
  try {
    const quizId = req.params.quizId;
    const quiz = await Quiz.findOne({ quiz_id: quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Remove quiz_id from questions (a question might belong to multiple quizzes)
    await Question.updateMany(
      { quiz_ids: quizId },
      { $pull: { quiz_ids: quizId } }
    );

    // Delete orphaned questions (no quiz_ids left)
    await Question.deleteMany({ quiz_ids: { $size: 0 } });

    // Delete quiz
    await Quiz.deleteOne({ quiz_id: quizId });

    console.log(`🗑️ Deleted quiz: "${quiz.quiz_name}" (${quizId})`);
    res.json({ message: "Quiz deleted", quiz_name: quiz.quiz_name });
  } catch (err) {
    console.error("Delete quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BUNDLE ASSIGNMENT ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── List all bundles (for assignment dropdown) ───
router.get("/bundles", requireAdmin, async (req, res) => {
  try {
    const bundles = await QuizCatalog.find({ is_active: true })
      .sort({ year_level: 1, tier: 1 })
      .select("bundle_id bundle_name year_level tier subjects flexiquiz_quiz_ids quiz_count")
      .lean();
    res.json(bundles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Assign native quiz to a bundle ───
// POST /api/admin/quizzes/:quizId/assign-bundle
// Body: { bundle_id }
router.post("/quizzes/:quizId/assign-bundle", requireAdmin, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { bundle_id } = req.body;

    if (!bundle_id) return res.status(400).json({ error: "bundle_id is required" });

    // Verify quiz exists
    const quiz = await Quiz.findOne({ quiz_id: quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Verify bundle exists
    const bundle = await QuizCatalog.findOne({ bundle_id });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    // Add quiz_id to the bundle's flexiquiz_quiz_ids (reuse same field)
    // This way existing provisioning flow will include it in child's entitled_quiz_ids
    await QuizCatalog.updateOne(
      { bundle_id },
      {
        $addToSet: { flexiquiz_quiz_ids: quizId },
        $inc: { quiz_count: 1 },
      }
    );

    // Also add to ALL children who already have this bundle entitled
    // (so they don't need to re-purchase)
    const result = await Child.updateMany(
      { entitled_bundle_ids: bundle_id },
      { $addToSet: { entitled_quiz_ids: quizId } }
    );

    console.log(`✅ Quiz "${quiz.quiz_name}" assigned to bundle "${bundle.bundle_name}" → ${result.modifiedCount} children updated`);

    res.json({
      message: `Quiz assigned to ${bundle.bundle_name}`,
      quiz_name: quiz.quiz_name,
      bundle_name: bundle.bundle_name,
      children_updated: result.modifiedCount,
    });
  } catch (err) {
    console.error("Assign bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Remove quiz from a bundle ───
// POST /api/admin/quizzes/:quizId/unassign-bundle
// Body: { bundle_id }
router.post("/quizzes/:quizId/unassign-bundle", requireAdmin, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { bundle_id } = req.body;

    if (!bundle_id) return res.status(400).json({ error: "bundle_id is required" });

    await QuizCatalog.updateOne(
      { bundle_id },
      {
        $pull: { flexiquiz_quiz_ids: quizId },
        $inc: { quiz_count: -1 },
      }
    );

    // Also remove from children who have this quiz entitled via this bundle
    await Child.updateMany(
      { entitled_bundle_ids: bundle_id },
      { $pull: { entitled_quiz_ids: quizId } }
    );

    console.log(`🗑️ Quiz "${quizId}" removed from bundle "${bundle_id}"`);
    res.json({ message: "Quiz removed from bundle" });
  } catch (err) {
    console.error("Unassign bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;