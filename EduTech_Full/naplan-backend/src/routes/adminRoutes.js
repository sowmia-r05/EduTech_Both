/**
 * routes/adminRoutes.js
 *
 * Admin API routes with Email + Password authentication + Registration.
 * No registration code required — simple name, email, password signup.
 *
 * Mount in app.js:
 *   const adminRoutes = require("./routes/adminRoutes");
 *   app.use("/api/admin", adminRoutes);
 */

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { requireAdmin } = require("../middleware/adminAuth");
const Admin = require("../models/admin");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizCatalog = require("../models/quizCatalog");
const Child = require("../models/child");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

// Simple brute-force protection (in-memory)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

setInterval(() => {
  const now = Date.now();
  for (const [email, data] of loginAttempts.entries()) {
    if (now - data.firstAttempt > LOCKOUT_MS) {
      loginAttempts.delete(email);
    }
  }
}, 5 * 60 * 1000).unref?.();

function trackFailedAttempt(email) {
  const existing = loginAttempts.get(email);
  if (existing) {
    existing.count += 1;
  } else {
    loginAttempts.set(email, { count: 1, firstAttempt: Date.now() });
  }
}

// ─── Public: Admin Register ───
router.post("/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    // Validate fields
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Create admin
    const admin = await Admin.create({
      email,
      name,
      password_hash: password, // pre-save hook will bcrypt this
      role: "admin",
      status: "active",
      last_login_at: new Date(),
      login_count: 1,
    });

    // Generate JWT (auto-login after register)
    const token = jwt.sign(
      {
        adminId: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.status(201).json({
      ok: true,
      token,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Admin register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// ─── Public: Admin Login ───
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Check brute-force lockout
    const attempts = loginAttempts.get(email);
    if (attempts && attempts.count >= MAX_ATTEMPTS) {
      const elapsed = Date.now() - attempts.firstAttempt;
      if (elapsed < LOCKOUT_MS) {
        const minsLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${minsLeft} minutes.`,
        });
      }
      loginAttempts.delete(email);
    }

    // Find admin
    const admin = await Admin.findOne({ email, status: "active" });

    if (!admin) {
      trackFailedAttempt(email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      trackFailedAttempt(email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Clear failed attempts on success
    loginAttempts.delete(email);

    // Update login stats
    admin.last_login_at = new Date();
    admin.login_count = (admin.login_count || 0) + 1;
    await admin.save();

    // Generate JWT
    const token = jwt.sign(
      {
        adminId: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      ok: true,
      token,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ─── Protected: Check admin auth status ───
router.get("/me", requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.adminId)
      .select("email name role last_login_at")
      .lean();

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    return res.json({ ok: true, admin });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Public: Download Excel Template ───
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

    if (!quizData.quiz_name) return res.status(400).json({ error: "quiz_name is required" });
    if (![3, 5, 7, 9].includes(quizData.year_level)) return res.status(400).json({ error: "year_level must be 3, 5, 7, or 9" });

    const quizId = quizData.quiz_id || uuidv4();

    const quiz = await Quiz.findOneAndUpdate(
      { quiz_id: quizId },
      {
        ...quizData,
        quiz_id: quizId,
        question_count: questionsData.length,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const questionOps = questionsData.map((q, i) => ({
      updateOne: {
        filter: { question_id: q.question_id || uuidv4() },
        update: {
          $set: { ...q, order: i + 1 },
          $addToSet: { quiz_ids: quizId },
        },
        upsert: true,
      },
    }));

    if (questionOps.length > 0) {
      await Question.bulkWrite(questionOps);
    }

    const questionIds = questionsData.map((q) => q.question_id);
    quiz.question_ids = questionIds;
    quiz.question_count = questionIds.length;
    await quiz.save();

    res.json({
      ok: true,
      quiz_id: quizId,
      questions_upserted: questionsData.length,
    });
  } catch (err) {
    console.error("Upload quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete quiz ───
router.delete("/quizzes/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    await Question.updateMany(
      { quiz_ids: quiz.quiz_id },
      { $pull: { quiz_ids: quiz.quiz_id } }
    );

    await quiz.deleteOne();

    res.json({ ok: true, deleted: req.params.quizId });
  } catch (err) {
    console.error("Delete quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});
router.patch("/quizzes/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Allowed fields to update
    const allowedFields = [
      "quiz_name",
      "time_limit_minutes",
      "difficulty",
      "tier",
      "year_level",
      "subject",
      "is_active",
      "is_trial",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate year_level if provided
    if (updates.year_level && ![3, 5, 7, 9].includes(Number(updates.year_level))) {
      return res.status(400).json({ error: "year_level must be 3, 5, 7, or 9" });
    }

    // Validate subject if provided
    if (updates.subject && !["Maths", "Reading", "Writing", "Conventions"].includes(updates.subject)) {
      return res.status(400).json({ error: "Subject must be Maths, Reading, Writing, or Conventions" });
    }

    Object.assign(quiz, updates);
    await quiz.save();

    res.json({ ok: true, quiz });
  } catch (err) {
    console.error("Update quiz error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /questions/:questionId — Update a single question ───
router.patch("/questions/:questionId", async (req, res) => {
  try {
    const question = await Question.findOne({ question_id: req.params.questionId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Allowed fields to update
    const { text, type, points, options, categories, image_url, explanation } = req.body;

    if (text !== undefined) question.text = text;
    if (type !== undefined) question.type = type;
    if (points !== undefined) question.points = Number(points) || 1;
    if (image_url !== undefined) question.image_url = image_url;
    if (explanation !== undefined) question.explanation = explanation;

    // Update categories
    if (categories !== undefined) {
      if (typeof categories === "string") {
        question.categories = categories
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((name) => ({ name }));
      } else if (Array.isArray(categories)) {
        question.categories = categories;
      }
    }

    // Update options (for MCQ types)
    if (options !== undefined && Array.isArray(options)) {
      question.options = options.map((opt, i) => ({
        option_id: opt.option_id || `opt_${i + 1}`,
        label: opt.label || String.fromCharCode(65 + i),
        text: opt.text || "",
        image_url: opt.image_url || null,
        correct: !!opt.correct,
      }));
    }

    await question.save();

    // Recalculate quiz total_points if points changed
    if (points !== undefined) {
      for (const quizId of question.quiz_ids || []) {
        const quizQuestions = await Question.find({ quiz_ids: quizId }).lean();
        const totalPoints = quizQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
        await Quiz.updateOne({ quiz_id: quizId }, { total_points: totalPoints });
      }
    }

    res.json({ ok: true, question });
  } catch (err) {
    console.error("Update question error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /questions/:questionId — Delete a single question ───
router.delete("/questions/:questionId", async (req, res) => {
  try {
    const question = await Question.findOne({ question_id: req.params.questionId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    const quizId = req.query.quiz_id;

    if (quizId) {
      // Remove this quiz from the question's quiz_ids
      question.quiz_ids = (question.quiz_ids || []).filter((id) => id !== quizId);

      if (question.quiz_ids.length === 0) {
        // Question belongs to no quizzes — delete it entirely
        await question.deleteOne();
      } else {
        await question.save();
      }

      // Update the quiz's question count and total points
      const remainingQuestions = await Question.find({ quiz_ids: quizId }).lean();
      const totalPoints = remainingQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
      await Quiz.updateOne(
        { quiz_id: quizId },
        {
          question_count: remainingQuestions.length,
          total_points: totalPoints,
          question_ids: remainingQuestions.map((q) => q.question_id),
        }
      );
    } else {
      // No quiz_id specified — delete question entirely
      // Remove from all quizzes it belonged to
      for (const qid of question.quiz_ids || []) {
        const remaining = await Question.find({
          quiz_ids: qid,
          question_id: { $ne: question.question_id },
        }).lean();
        const totalPoints = remaining.reduce((sum, q) => sum + (q.points || 1), 0);
        await Quiz.updateOne(
          { quiz_id: qid },
          {
            question_count: remaining.length,
            total_points: totalPoints,
            question_ids: remaining.map((q) => q.question_id),
          }
        );
      }
      await question.deleteOne();
    }

    res.json({ ok: true, deleted: req.params.questionId });
  } catch (err) {
    console.error("Delete question error:", err);
    res.status(500).json({ error: err.message });
  }
});
router.get("/bundles", async (req, res) => {
  try {
    const bundles = await QuizCatalog.find()
      .sort({ year_level: 1, tier: 1 })
      .lean();

    // Normalize: ensure quiz_ids field exists (merge with flexiquiz_quiz_ids)
    const enriched = bundles.map((b) => ({
      ...b,
      quiz_ids: b.quiz_ids || b.flexiquiz_quiz_ids || [],
    }));

    res.json(enriched);
  } catch (err) {
    console.error("List bundles error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single bundle ───
router.get("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    res.json({
      ...bundle,
      quiz_ids: bundle.quiz_ids || bundle.flexiquiz_quiz_ids || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add a quiz to a bundle ───
// POST /api/admin/bundles/:bundleId/quizzes  { quiz_id: "..." }
router.post("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });

    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    // Verify quiz exists
    const quiz = await Quiz.findOne({ quiz_id });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Initialize quiz_ids array if it doesn't exist
    if (!bundle.quiz_ids) {
      bundle.quiz_ids = [...(bundle.flexiquiz_quiz_ids || [])];
    }

    // Add quiz_id if not already present
    if (!bundle.quiz_ids.includes(quiz_id)) {
      bundle.quiz_ids.push(quiz_id);
    }

    // Also keep flexiquiz_quiz_ids in sync for backward compatibility
    if (!bundle.flexiquiz_quiz_ids) bundle.flexiquiz_quiz_ids = [];
    if (!bundle.flexiquiz_quiz_ids.includes(quiz_id)) {
      bundle.flexiquiz_quiz_ids.push(quiz_id);
    }

    // Update quiz count
    bundle.quiz_count = bundle.quiz_ids.length;
    await bundle.save();

    res.json({
      ok: true,
      bundle_id: bundle.bundle_id,
      quiz_ids: bundle.quiz_ids,
      quiz_count: bundle.quiz_count,
    });
  } catch (err) {
    console.error("Add quiz to bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Remove a quiz from a bundle ───
// DELETE /api/admin/bundles/:bundleId/quizzes  { quiz_id: "..." }
router.delete("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });

    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    // Remove from both arrays
    if (bundle.quiz_ids) {
      bundle.quiz_ids = bundle.quiz_ids.filter((id) => id !== quiz_id);
    }
    if (bundle.flexiquiz_quiz_ids) {
      bundle.flexiquiz_quiz_ids = bundle.flexiquiz_quiz_ids.filter((id) => id !== quiz_id);
    }

    bundle.quiz_count = (bundle.quiz_ids || []).length;
    await bundle.save();

    res.json({
      ok: true,
      bundle_id: bundle.bundle_id,
      quiz_ids: bundle.quiz_ids || [],
      quiz_count: bundle.quiz_count,
    });
  } catch (err) {
    console.error("Remove quiz from bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update bundle settings (price, name, active, etc.) ───
// PATCH /api/admin/bundles/:bundleId
router.patch("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const allowed = ["bundle_name", "description", "price_cents", "is_active", "trial_quiz_ids"];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        bundle[field] = req.body[field];
      }
    }

    await bundle.save();
    res.json({ ok: true, bundle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;