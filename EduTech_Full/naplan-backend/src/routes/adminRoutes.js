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
 * ✅ FIXED: Upload now supports images, PDFs, audio, and video (50MB limit).
 * ✅ FIXED: Removed duplicate POST /upload route.
 * ✅ FIXED: POST /bundles/:bundleId/quizzes was missing res.json() and closing brackets.
 * ✅ NEW: Bundle quiz add/remove now auto-syncs entitlements to children who purchased the bundle.
 * ✅ NEW: POST /bundles/:bundleId/re-provision endpoint to fix failed past purchases.
 *
 * Mount in app.js:
 *   const adminRoutes = require("./routes/adminRoutes");
 *   app.use("/api/admin", adminRoutes);
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const { requireAdmin } = require("../middleware/adminAuth");
const Admin = require("../models/admin");
const Quiz = require("../models/quiz");
const Question = require("../models/question");
const QuizCatalog = require("../models/quizCatalog");
const Child = require("../models/child");
const Purchase = require("../models/purchase"); // ✅ NEW: needed for re-provision

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

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const adminCount = await Admin.countDocuments();
    const isFirstAdmin = adminCount === 0;

    const admin = await Admin.create({
      email,
      name,
      password_hash: password,
      role: isFirstAdmin ? "super_admin" : "admin",
      status: isFirstAdmin ? "active" : "pending",
      last_login_at: isFirstAdmin ? new Date() : null,
      login_count: isFirstAdmin ? 1 : 0,
    });

    if (isFirstAdmin) {
      const token = jwt.sign(
        { adminId: admin._id, email: admin.email, name: admin.name, role: admin.role },
        JWT_SECRET,
        { expiresIn: "12h" }
      );
      return res.status(201).json({
        ok: true, token,
        admin: { name: admin.name, email: admin.email, role: admin.role, status: admin.status },
      });
    }

    return res.status(201).json({
      ok: true, pending: true,
      message: "Registration successful! Your account is pending approval from a super admin.",
      admin: { name: admin.name, email: admin.email, role: admin.role, status: admin.status },
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

    const attempts = loginAttempts.get(email);
    if (attempts && attempts.count >= MAX_ATTEMPTS) {
      const elapsed = Date.now() - attempts.firstAttempt;
      if (elapsed < LOCKOUT_MS) {
        const minsLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${minsLeft} minutes.` });
      }
      loginAttempts.delete(email);
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      trackFailedAttempt(email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      trackFailedAttempt(email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (admin.status === "pending") {
      return res.status(403).json({ error: "Your account is pending approval from a super admin. Please wait for approval.", status: "pending" });
    }
    if (admin.status === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended. Contact a super admin for help.", status: "suspended" });
    }

    loginAttempts.delete(email);

    admin.last_login_at = new Date();
    admin.login_count = (admin.login_count || 0) + 1;
    await admin.save();

    const token = jwt.sign(
      { adminId: admin._id, email: admin.email, name: admin.name, role: admin.role },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      ok: true, token,
      admin: { name: admin.name, email: admin.email, role: admin.role, status: admin.status },
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
      .select("email name role status last_login_at")
      .lean();
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    return res.json({ ok: true, admin });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
// ADMIN MANAGEMENT ROUTES (super_admin only)
// ════════════════════════════════════════════════════════

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== "super_admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

router.get("/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await Admin.find()
      .select("email name role status last_login_at login_count approved_by approved_at createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json(admins);
  } catch (err) {
    console.error("List admins error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/admins/:adminId", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    if (admin._id.toString() === req.admin.adminId) {
      return res.status(400).json({ error: "You cannot modify your own account" });
    }

    const { action } = req.body;

    switch (action) {
      case "approve":
        if (admin.status !== "pending") return res.status(400).json({ error: "Admin is not in pending status" });
        admin.status = "active";
        admin.approved_by = req.admin.email;
        admin.approved_at = new Date();
        break;
      case "suspend":
        if (admin.status === "suspended") return res.status(400).json({ error: "Admin is already suspended" });
        admin.status = "suspended";
        break;
      case "reactivate":
        if (admin.status !== "suspended") return res.status(400).json({ error: "Admin is not suspended" });
        admin.status = "active";
        break;
      case "promote":
        if (admin.role === "super_admin") return res.status(400).json({ error: "Admin is already a super admin" });
        if (admin.status !== "active") return res.status(400).json({ error: "Only active admins can be promoted" });
        admin.role = "super_admin";
        break;
      case "demote":
        if (admin.role !== "super_admin") return res.status(400).json({ error: "Admin is not a super admin" });
        const superAdminCount = await Admin.countDocuments({ role: "super_admin", status: "active" });
        if (superAdminCount <= 1) return res.status(400).json({ error: "Cannot demote — at least one super admin must remain" });
        admin.role = "admin";
        break;
      default:
        return res.status(400).json({ error: "Invalid action. Use: approve, suspend, reactivate, promote, demote" });
    }

    await admin.save();
    res.json({
      ok: true,
      admin: { _id: admin._id, email: admin.email, name: admin.name, role: admin.role, status: admin.status },
    });
  } catch (err) {
    console.error("Update admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/admins/:adminId", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    if (admin._id.toString() === req.admin.adminId) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    if (admin.role === "super_admin") {
      const superAdminCount = await Admin.countDocuments({ role: "super_admin" });
      if (superAdminCount <= 1) return res.status(400).json({ error: "Cannot delete the last super admin" });
    }

    await admin.deleteOne();
    res.json({ ok: true, deleted: admin.email });
  } catch (err) {
    console.error("Delete admin error:", err);
    res.status(500).json({ error: err.message });
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

// ════════════════════════════════════════════════════════
// FILE UPLOAD (images, PDFs, audio, video)
// ════════════════════════════════════════════════════════
// IMPORTANT: Add this to app.js for serving uploaded files:
//   app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = new Date().toISOString().slice(0, 7);
    const dir = path.join(uploadDir, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
    cb(null, `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
  },
});

const uploadMiddleware = multer({
  storage: multerStorage,
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
      "application/pdf",
      "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Allowed: images, PDFs, audio (mp3/wav/ogg — max 20MB), and video (mp4/webm/mov — max 50MB)"), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ✅ FIXED: Only ONE upload route (duplicate removed)
router.post("/upload", (req, res) => {
  uploadMiddleware.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Limits: Images/PDFs — 10MB, Audio — 20MB, Video — 50MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Post-upload size check per file type
    const size = req.file.size;
    const mime = req.file.mimetype;
    const isAudio = mime.startsWith("audio/");
    const isVideo = mime.startsWith("video/");

    if (!isAudio && !isVideo && size > 10 * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Images and PDFs must be under 10MB." });
    }
    if (isAudio && size > 20 * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Audio files must be under 20MB. Supported: mp3, wav, ogg." });
    }
    if (isVideo && size > 50 * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Video files must be under 50MB. Supported: mp4, webm, mov." });
    }

    const sub = new Date().toISOString().slice(0, 7);
    res.json({ ok: true, url: `/uploads/${sub}/${req.file.filename}`, filename: req.file.filename, mimetype: req.file.mimetype, size: req.file.size });
  });
});

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

    const quizId = quizData.quiz_id || uuidv4();

    const quiz = await Quiz.findOneAndUpdate(
      { quiz_id: quizId },
      { ...quizData, quiz_id: quizId, question_count: questionsData.length },
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

    res.json({ ok: true, quiz_id: quizId, questions_upserted: questionsData.length });
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
      "quiz_name", "time_limit_minutes", "difficulty", "tier",
      "year_level", "subject", "is_active", "is_trial",
      "randomize_questions", "randomize_options",
      "voice_url", "video_url", "max_attempts",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
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

    if (category !== undefined) {
      question.categories = category.trim()
        ? category.split(",").map((c) => c.trim()).filter(Boolean).map((name) => ({ name }))
        : [];
    } else if (categories !== undefined) {
      if (typeof categories === "string") {
        question.categories = categories.split(",").map((c) => c.trim()).filter(Boolean).map((name) => ({ name }));
      } else if (Array.isArray(categories)) {
        question.categories = categories;
      }
    }

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

    const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const categories = [];
    if (category && category.trim()) {
      categories.push({ name: category.trim() });
    }

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
      question.quiz_ids = (question.quiz_ids || []).filter((id) => id !== quizId);

      if (question.quiz_ids.length === 0) {
        await question.deleteOne();
      } else {
        await question.save();
      }

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

router.get("/bundles", async (req, res) => {
  try {
    const bundles = await QuizCatalog.find()
      .sort({ year_level: 1, tier: 1 })
      .lean();

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

router.post("/bundles", async (req, res) => {
  try {
    const {
      bundle_name, description, year_level, tier,
      price_cents, currency, max_quiz_count, questions_per_quiz,
      distribution_mode, swap_eligible_from, subjects,
    } = req.body;

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

    if (distribution_mode === "swap" && Array.isArray(swap_eligible_from) && swap_eligible_from.length > 0) {
      const existingSources = await QuizCatalog.find({ bundle_id: { $in: swap_eligible_from } }).lean();
      if (existingSources.length !== swap_eligible_from.length) {
        const found = existingSources.map((b) => b.bundle_id);
        const missing = swap_eligible_from.filter((id) => !found.includes(id));
        return res.status(400).json({ error: `Swap source bundle(s) not found: ${missing.join(", ")}` });
      }
    }

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

// ═══════════════════════════════════════════════════════
// ✅ FIXED: POST /bundles/:bundleId/quizzes
// Was missing res.json() and closing brackets.
// ✅ NEW: Auto-syncs quiz to children who own this bundle
// ✅ NEW: Auto-re-provisions failed purchases (bundle had 0 quizzes at purchase time)
// ═══════════════════════════════════════════════════════
router.post("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });

    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const quiz = await Quiz.findOne({ quiz_id });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    if (!bundle.quiz_ids) {
      bundle.quiz_ids = [...(bundle.flexiquiz_quiz_ids || [])];
    }

    if (!bundle.quiz_ids.includes(quiz_id)) {
      bundle.quiz_ids.push(quiz_id);
    }

    if (!bundle.flexiquiz_quiz_ids) bundle.flexiquiz_quiz_ids = [];
    if (!bundle.flexiquiz_quiz_ids.includes(quiz_id)) {
      bundle.flexiquiz_quiz_ids.push(quiz_id);
    }

    bundle.quiz_count = bundle.quiz_ids.length;
    await bundle.save();

    // ═══════════════════════════════════════════════════════
    // ✅ NEW: Sync new quiz to all children who own this bundle
    // This fixes the issue where quizzes added AFTER purchase
    // don't appear on the child's dashboard
    // ═══════════════════════════════════════════════════════
    const syncResult = await Child.updateMany(
      { entitled_bundle_ids: bundle.bundle_id },
      { $addToSet: { entitled_quiz_ids: quiz_id } }
    );
    console.log(`📦 Synced quiz "${quiz_id}" to ${syncResult.modifiedCount} children who own bundle "${bundle.bundle_id}"`);

    // ═══════════════════════════════════════════════════════
    // ✅ NEW: Auto re-provision any failed purchases for this bundle
    // (purchases that failed because bundle had 0 quizzes at the time)
    // ═══════════════════════════════════════════════════════
    const failedPurchases = await Purchase.find({
      bundle_id: bundle.bundle_id,
      status: "paid",
      provisioned: false,
    });

    let reprovisionedCount = 0;
    for (const purchase of failedPurchases) {
      for (const childId of (purchase.child_ids || [])) {
        await Child.findByIdAndUpdate(childId, {
          $set: { status: "active" },
          $addToSet: {
            entitled_bundle_ids: bundle.bundle_id,
            entitled_quiz_ids: { $each: bundle.quiz_ids },
          },
        });
      }
      await Purchase.findByIdAndUpdate(purchase._id, {
        $set: {
          provisioned: true,
          provisioned_at: new Date(),
          provision_error: null,
        },
      });
      reprovisionedCount++;
    }

    if (reprovisionedCount > 0) {
      console.log(`🔄 Auto-reprovisioned ${reprovisionedCount} previously failed purchase(s) for bundle "${bundle.bundle_id}"`);
    }

    res.json({
      ok: true,
      bundle_id: bundle.bundle_id,
      quiz_ids: bundle.quiz_ids,
      quiz_count: bundle.quiz_count,
      children_synced: syncResult.modifiedCount,
      purchases_reprovisioned: reprovisionedCount,
    });
  } catch (err) {
    console.error("Add quiz to bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// ✅ FIXED: DELETE /bundles/:bundleId/quizzes
// ✅ NEW: Removes quiz entitlement from children (safely checks other bundles)
// ═══════════════════════════════════════════════════════
router.delete("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });

    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    if (bundle.quiz_ids) {
      bundle.quiz_ids = bundle.quiz_ids.filter((id) => id !== quiz_id);
    }
    if (bundle.flexiquiz_quiz_ids) {
      bundle.flexiquiz_quiz_ids = bundle.flexiquiz_quiz_ids.filter((id) => id !== quiz_id);
    }

    bundle.quiz_count = (bundle.quiz_ids || []).length;
    await bundle.save();

    // ═══════════════════════════════════════════════════════
    // ✅ NEW: Remove quiz entitlement from children who own this bundle
    // But ONLY if the quiz isn't part of another bundle they also own
    // ═══════════════════════════════════════════════════════
    const childrenWithBundle = await Child.find({ entitled_bundle_ids: bundle.bundle_id }).lean();
    let removedCount = 0;

    for (const child of childrenWithBundle) {
      // Check if this quiz_id exists in any OTHER bundle the child owns
      const otherBundles = (child.entitled_bundle_ids || []).filter(bid => bid !== bundle.bundle_id);
      let quizInOtherBundle = false;

      if (otherBundles.length > 0) {
        const otherBundleDocs = await QuizCatalog.find({
          bundle_id: { $in: otherBundles },
          quiz_ids: quiz_id,
        }).lean();
        quizInOtherBundle = otherBundleDocs.length > 0;
      }

      if (!quizInOtherBundle) {
        await Child.findByIdAndUpdate(child._id, {
          $pull: { entitled_quiz_ids: quiz_id }
        });
        removedCount++;
      }
    }

    console.log(`📦 Removed quiz "${quiz_id}" entitlement from ${removedCount} children`);

    res.json({
      ok: true,
      bundle_id: bundle.bundle_id,
      quiz_ids: bundle.quiz_ids || [],
      quiz_count: bundle.quiz_count,
      children_updated: removedCount,
    });
  } catch (err) {
    console.error("Remove quiz from bundle error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// ✅ NEW: POST /bundles/:bundleId/re-provision
// Re-syncs all quiz IDs from this bundle to all children
// who purchased it. Use to fix children who bought a bundle
// before quizzes were assigned to it.
// ═══════════════════════════════════════════════════════
router.post("/bundles/:bundleId/re-provision", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const quizIds = (bundle.quiz_ids && bundle.quiz_ids.length > 0)
      ? bundle.quiz_ids
      : bundle.flexiquiz_quiz_ids || [];

    if (quizIds.length === 0) {
      return res.status(400).json({
        error: "Bundle still has 0 quizzes. Assign quizzes first before re-provisioning.",
      });
    }

    // Find all paid purchases for this bundle
    const purchases = await Purchase.find({
      bundle_id: bundle.bundle_id,
      status: "paid",
    }).lean();

    let childrenUpdated = 0;
    let purchasesFixed = 0;

    for (const purchase of purchases) {
      for (const childId of (purchase.child_ids || [])) {
        const result = await Child.findByIdAndUpdate(childId, {
          $set: { status: "active" },
          $addToSet: {
            entitled_bundle_ids: bundle.bundle_id,
            entitled_quiz_ids: { $each: quizIds },
          },
        });
        if (result) childrenUpdated++;
      }

      // Fix provisioning status if it was marked as failed
      if (!purchase.provisioned) {
        await Purchase.findByIdAndUpdate(purchase._id, {
          $set: {
            provisioned: true,
            provisioned_at: new Date(),
            provision_error: null,
          },
        });
        purchasesFixed++;
      }
    }

    console.log(`🔄 Re-provisioned bundle "${bundle.bundle_id}": ${childrenUpdated} children updated, ${purchasesFixed} purchases fixed`);

    res.json({
      ok: true,
      bundle_id: bundle.bundle_id,
      quiz_ids_synced: quizIds.length,
      children_updated: childrenUpdated,
      purchases_fixed: purchasesFixed,
      total_purchases_found: purchases.length,
    });
  } catch (err) {
    console.error("Re-provision error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const allowed = [
      "bundle_name", "description", "price_cents", "is_active",
      "trial_quiz_ids", "currency", "max_quiz_count", "questions_per_quiz",
      "distribution_mode", "swap_eligible_from", "subjects", "year_level", "tier",
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        bundle[field] = req.body[field];
      }
    }

    if (req.body.currency && !["aud", "inr", "usd"].includes(req.body.currency)) {
      return res.status(400).json({ error: "currency must be aud, inr, or usd" });
    }

    if (req.body.distribution_mode === "standard") {
      bundle.swap_eligible_from = [];
    }

    if (
      req.body.distribution_mode === "swap" &&
      Array.isArray(req.body.swap_eligible_from) &&
      req.body.swap_eligible_from.length > 0
    ) {
      const validSources = await QuizCatalog.find({
        bundle_id: { $in: req.body.swap_eligible_from.filter((id) => id !== bundle.bundle_id) },
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

router.delete("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const deletedId = bundle.bundle_id;

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