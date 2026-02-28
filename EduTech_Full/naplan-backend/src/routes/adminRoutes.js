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

module.exports = router;