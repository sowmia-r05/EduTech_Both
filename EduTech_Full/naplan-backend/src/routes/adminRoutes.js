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

module.exports = router;
