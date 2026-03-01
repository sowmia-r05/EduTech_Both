/**
 * routes/adminRoutes.js
 *
 * Admin API routes with Email + Password authentication + Registration.
 * No registration code required — simple name, email, password signup.
 *
 * ✅ UPDATED: Added POST /bundles (create), DELETE /bundles/:bundleId,
 *    and expanded PATCH /bundles/:bundleId with multi-currency + swap fields.
 * ✅ UPDATED: Quiz settings now support randomize_questions, randomize_options,
 *    voice_url, video_url.
 * ✅ FIXED: Bundle year_level is now optional free-text (not restricted to 3/5/7/9).
 * ✅ FIXED: Bundle tier is now optional free-text (not restricted to A/B/C).
 * ✅ FIXED: allowedFields indentation in PATCH /quizzes/:quizId.
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

// ─── Update quiz settings ───
router.patch("/quizzes/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const allowedFields = [
      "quiz_name",
      "time_limit_minutes",
      "difficulty",
      "tier",
      "year_level",
      "subject",
      "is_active",
      "is_trial",
      "randomize_questions",
      "randomize_options",
      "voice_url",
      "video_url",
      "max_attempts",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.year_level && ![3, 5, 7, 9].includes(Number(updates.year_level))) {
      return res.status(400).json({ error: "year_level must be 3, 5, 7, or 9" });
    }

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

    const { text, type, points, options, categories, category, image_url, explanation, shuffle_options, voice_url, video_url, image_size, image_width, image_height } = req.body;

    if (text !== undefined) question.text = text;
    if (type !== undefined) question.type = type;
    if (points !== undefined) question.points = Number(points) || 1;
    if (image_url !== undefined) question.image_url = image_url;
    if (explanation !== undefined) question.explanation = explanation;
    if (shuffle_options !== undefined) question.shuffle_options = !!shuffle_options;
    if (voice_url !== undefined) question.voice_url = voice_url || null;
    if (video_url !== undefined) question.video_url = video_url || null;
    if (image_size !== undefined) question.image_size = image_size || "medium";
    if (image_width !== undefined) question.image_width = image_width;
    if (image_height !== undefined) question.image_height = image_height;

    // Update categories (supports both "category" singular string and "categories" array)
    if (category !== undefined) {
      question.categories = category.trim()
        ? category.split(",").map((c) => c.trim()).filter(Boolean).map((name) => ({ name }))
        : [];
    } else if (categories !== undefined) {
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

// ─── POST /quizzes/:quizId/questions — Add a new question to an existing quiz ───
router.post("/quizzes/:quizId/questions", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const {
      text, type = "radio_button", points = 1, category,
      image_url, image_size = "medium", image_width, image_height,
      explanation, shuffle_options, voice_url, video_url,
      options = [],
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Question text is required" });
    }

    // Generate question_id
    const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Build categories array
    const categories = [];
    if (category && category.trim()) {
      categories.push({ name: category.trim() });
    }

    // Build options array
    const builtOptions = options.map((opt, i) => ({
      option_id: `opt_${i + 1}`,
      label: String.fromCharCode(65 + i),
      text: opt.text || "",
      image_url: opt.image_url || null,
      correct: !!opt.correct,
    }));

    const question = new Question({
      question_id: questionId,
      quiz_ids: [quiz.quiz_id],
      text: text.trim(),
      type,
      points: Number(points) || 1,
      categories,
      options: builtOptions,
      image_url: image_url || null,
      image_size: image_size || "medium",
      image_width: image_width || null,
      image_height: image_height || null,
      explanation: explanation || null,
      shuffle_options: !!shuffle_options,
      voice_url: voice_url || null,
      video_url: video_url || null,
    });

    await question.save();

    // Update quiz totals
    const allQuestions = await Question.find({ quiz_ids: quiz.quiz_id }).lean();
    const totalPoints = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    await Quiz.updateOne(
      { quiz_id: quiz.quiz_id },
      {
        question_count: allQuestions.length,
        total_points: totalPoints,
        question_ids: allQuestions.map((q) => q.question_id),
      }
    );

    res.status(201).json({ ok: true, question_id: questionId, question });
  } catch (err) {
    console.error("Add question error:", err);
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

// ════════════════════════════════════════════════════════
// BUNDLE ROUTES
// ════════════════════════════════════════════════════════

// ─── List all bundles ───
router.get("/bundles", async (req, res) => {
  try {
    const bundles = await QuizCatalog.find()
      .sort({ year_level: 1, tier: 1 })
      .lean();

    // Normalize: ensure quiz_ids field exists (merge with flexiquiz_quiz_ids)
    const enriched = bundles.map((b) => ({
      ...b,
      quiz_ids: b.quiz_ids || b.flexiquiz_quiz_ids || [],
      currency: b.currency || "aud",
    }));

    res.json(enriched);
  } catch (err) {
    console.error("List bundles error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Create a bundle manually ───
// POST /api/admin/bundles
// ✅ year_level is optional free-text, tier is optional free-text
router.post("/bundles", async (req, res) => {
  try {
    const {
      bundle_name,
      description,
      year_level,
      tier,
      price_cents,
      currency,
      max_quiz_count,
      questions_per_quiz,
      distribution_mode,
      swap_eligible_from,
      subjects,
    } = req.body;

    // Validation — only bundle_name and price_cents are required
    if (!bundle_name || !bundle_name.trim()) {
      return res.status(400).json({ error: "bundle_name is required" });
    }
    if (price_cents === undefined || price_cents === null || Number(price_cents) < 0) {
      return res.status(400).json({ error: "price_cents is required and must be >= 0" });
    }
    if (currency && !["aud", "inr", "usd"].includes(currency)) {
      return res.status(400).json({ error: "currency must be aud, inr, or usd" });
    }
    if (max_quiz_count !== undefined && (Number(max_quiz_count) < 1 || isNaN(Number(max_quiz_count)))) {
      return res.status(400).json({ error: "max_quiz_count must be a positive number" });
    }
    // ✅ year_level — optional free-text (e.g. "Year 3", "Grade 5", "Level 1", or empty)
    // ✅ tier — optional free-text (e.g. "A", "Premium", "Basic", or empty)

    // Validate swap sources exist (if provided)
    if (distribution_mode === "swap" && Array.isArray(swap_eligible_from) && swap_eligible_from.length > 0) {
      const existingSources = await QuizCatalog.find({
        bundle_id: { $in: swap_eligible_from },
      }).lean();
      if (existingSources.length !== swap_eligible_from.length) {
        const found = existingSources.map((b) => b.bundle_id);
        const missing = swap_eligible_from.filter((id) => !found.includes(id));
        return res.status(400).json({
          error: `Swap source bundle(s) not found: ${missing.join(", ")}`,
        });
      }
    }

    // Generate bundle_id from name (safe slugs for free-text values)
    const yearSlug = year_level
      ? String(year_level).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")
      : "general";
    const tierSlug = tier
      ? `_${String(tier).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")}`
      : "";
    const nameSlug = bundle_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
    const bundle_id = `${yearSlug}${tierSlug}_${nameSlug}_${Date.now().toString(36)}`;

    const bundle = await QuizCatalog.create({
      bundle_id,
      bundle_name: bundle_name.trim(),
      description: (description || "").trim(),
      year_level: year_level ? String(year_level).trim() : null,
      tier: tier ? String(tier).trim() : null,
      price_cents: Number(price_cents),
      currency: currency || "aud",
      max_quiz_count: max_quiz_count ? Number(max_quiz_count) : undefined,
      questions_per_quiz: questions_per_quiz ? Number(questions_per_quiz) : undefined,
      distribution_mode: distribution_mode || "standard",
      swap_eligible_from: distribution_mode === "swap" ? (swap_eligible_from || []) : [],
      subjects: Array.isArray(subjects) ? subjects : [],
      is_active: true,
      quiz_ids: [],
      flexiquiz_quiz_ids: [],
      quiz_count: 0,
    });

    res.status(201).json({ ok: true, bundle });
  } catch (err) {
    console.error("Create bundle error:", err);
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
      currency: bundle.currency || "aud",
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

// ─── Update bundle settings (supports all fields) ───
// PATCH /api/admin/bundles/:bundleId
// ✅ year_level and tier are free-text for bundles — no hardcoded validation
router.patch("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    // All allowed fields for bundle updates
    const allowed = [
      "bundle_name",
      "description",
      "price_cents",
      "is_active",
      "trial_quiz_ids",
      "currency",
      "max_quiz_count",
      "questions_per_quiz",
      "distribution_mode",
      "swap_eligible_from",
      "subjects",
      "year_level",
      "tier",
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        bundle[field] = req.body[field];
      }
    }

    // Validate currency if provided
    if (req.body.currency && !["aud", "inr", "usd"].includes(req.body.currency)) {
      return res.status(400).json({ error: "currency must be aud, inr, or usd" });
    }

    // ✅ year_level — free-text for bundles, no numeric validation
    // ✅ tier — free-text for bundles, no A/B/C validation

    // If switching to standard mode, clear swap sources
    if (req.body.distribution_mode === "standard") {
      bundle.swap_eligible_from = [];
    }

    // Validate swap sources exist (if swap mode)
    if (
      req.body.distribution_mode === "swap" &&
      Array.isArray(req.body.swap_eligible_from) &&
      req.body.swap_eligible_from.length > 0
    ) {
      // Filter out invalid source IDs (including self)
      const validSources = await QuizCatalog.find({
        bundle_id: {
          $in: req.body.swap_eligible_from.filter((id) => id !== bundle.bundle_id),
        },
      }).lean();
      bundle.swap_eligible_from = validSources.map((b) => b.bundle_id);
    }

    await bundle.save();
    res.json({ ok: true, bundle });
  } catch (err) {
    console.error("Update bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete a bundle ───
// DELETE /api/admin/bundles/:bundleId
router.delete("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const deletedId = bundle.bundle_id;

    // Remove this bundle from other bundles' swap_eligible_from arrays
    await QuizCatalog.updateMany(
      { swap_eligible_from: deletedId },
      { $pull: { swap_eligible_from: deletedId } }
    );

    await bundle.deleteOne();

    res.json({ ok: true, deleted: deletedId });
  } catch (err) {
    console.error("Delete bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;