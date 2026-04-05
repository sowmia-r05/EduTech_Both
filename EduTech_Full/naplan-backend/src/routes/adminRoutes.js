/**
 * routes/adminRoutes.js
 */

const path             = require("path");
const { setAuthCookie, clearAuthCookie } = require("../utils/setCookies");
const ADMIN_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const multer     = require("multer");
const rateLimit  = require("express-rate-limit");

const { requireAdmin }  = require("../middleware/adminAuth");
const Admin             = require("../models/admin");
const AdminInvite       = require("../models/adminInvite");
const Quiz              = require("../models/quiz");
const Question          = require("../models/question");
const QuizCatalog       = require("../models/quizCatalog");
const Child             = require("../models/child");
const Purchase          = require("../models/purchase");
const connectDB         = require("../config/db");
const { uploadToS3 }    = require("../utils/s3Upload");
const ExcelJS           = require("exceljs");
const { generateQuizExplanations, explanation_progress } = require("../utils/generateQuizExplanations");
 // ✅ ADD


const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

// ═══════════════════════════════════════════════════════════
// Rate limiter for login
// ═══════════════════════════════════════════════════════════
const adminLoginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  message:         { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ═══════════════════════════════════════════════════════════
// PUBLIC: Seed / first-run check
// ═══════════════════════════════════════════════════════════
router.get("/check", async (req, res) => {
  try {
    await connectDB();
    const count = await Admin.countDocuments();
    return res.json({ has_admin: count > 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUBLIC: Admin Register
// ═══════════════════════════════════════════════════════════
router.post("/register", async (req, res) => {
  try {
    await connectDB();

    const invite_token = String(req.body?.invite_token || "").trim();
    const name         = String(req.body?.name         || "").trim();
    const email        = String(req.body?.email        || "").trim().toLowerCase();
    const password     = String(req.body?.password     || "");

    if (!invite_token) {
      return res.status(403).json({ error: "A valid invite link is required to register." });
    }

    const invite = await AdminInvite.findOne({
      token: invite_token, used: false, expiresAt: { $gt: new Date() },
    });

    if (!invite) {
      return res.status(403).json({ error: "This invite link is invalid or has expired." });
    }

    if (!name)  return res.status(400).json({ error: "Name is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!password || password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: "Password must contain at least one number" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    invite.used = true;
    await invite.save();

    const password_hash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ email, name, password_hash, role: "admin", status: "active" });

    return res.status(201).json({
      ok: true,
      message: "Account created. You can now log in.",
      admin: { name: admin.name, email: admin.email, role: admin.role, status: admin.status },
    });
  } catch (err) {
    console.error("Admin register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// ═══════════════════════════════════════════════════════════
// PUBLIC: Admin Login
// ═══════════════════════════════════════════════════════════
router.post("/login", adminLoginLimiter, async (req, res) => {
  try {
    await connectDB();

    const email    = String(req.body?.email    || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: "Invalid email or password" });

    const isValid = await admin.comparePassword(password);
    if (!isValid) return res.status(401).json({ error: "Invalid email or password" });

    if (admin.status === "pending") {
      return res.status(403).json({ error: "Your account is pending approval.", status: "pending" });
    }
    if (admin.status === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended.", status: "suspended" });
    }

    admin.last_login_at = new Date();
    admin.login_count   = (admin.login_count || 0) + 1;
    await admin.save();

    const token = jwt.sign(
      { adminId: admin._id, email: admin.email, name: admin.name, role: admin.role },
      JWT_SECRET,
      { expiresIn: "365d" },
    );

    setAuthCookie(res, "admin_token", token, ADMIN_COOKIE_MAX_AGE);

    return res.json({
      ok: true,
      token,
      admin: { name: admin.name, email: admin.email, role: admin.role, status: admin.status },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ═══════════════════════════════════════════════════════════
// PUBLIC: Logout
// ═══════════════════════════════════════════════════════════
router.post("/logout", (req, res) => {
  clearAuthCookie(res, "admin_token");
  return res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PUBLIC: Download Excel template
// ═══════════════════════════════════════════════════════════
router.get("/template", (req, res) => {
  const templatePath = path.join(__dirname, "..", "public", "Quiz_Upload_Template.xlsx");
  res.download(templatePath, "Quiz_Upload_Template.xlsx", (err) => {
    if (err) {
      console.error("Template download error:", err.message);
      if (!res.headersSent) res.status(404).json({ error: "Template file not found" });
    }
  });
});

// ═══════════════════════════════════════════════════════════
// ALL ROUTES BELOW REQUIRE ADMIN JWT
// ═══════════════════════════════════════════════════════════
router.use(requireAdmin);

// GET /api/admin/me
router.get("/me", async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// INVITE SYSTEM
// ═══════════════════════════════════════════════════════════
router.post("/invite", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const invite = await AdminInvite.create({ created_by: req.admin.email });
    const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    const invite_url = `${FRONTEND_URL}/#/kai-ops-9281/register?invite=${invite.token}`;
    return res.json({ ok: true, invite_url, expires_in: "24 hours", created_by: req.admin.email });
  } catch (err) {
    console.error("Create invite error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/invites", async (req, res) => {
  try {
    await connectDB();
    const invites = await AdminInvite.find({ used: false, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .select("token created_by createdAt expiresAt")
      .lean();
    const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    return res.json(invites.map((i) => ({
      ...i,
      invite_url: `${FRONTEND_URL}/#/kai-ops-9281/register?invite=${i.token}`,
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/invites/:token", async (req, res) => {
  try {
    await connectDB();
    await AdminInvite.deleteOne({ token: req.params.token });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ADMIN ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════
router.get("/admins", async (req, res) => {
  try {
    await connectDB();
    const admins = await Admin.find()
      .select("email name role status last_login_at login_count approved_by approved_at createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(admins);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admins/pending", async (req, res) => {
  try {
    await connectDB();
    const admins = await Admin.find({ status: "pending" })
      .select("email name role status createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(admins);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/admins/:adminId", async (req, res) => {
  try {
    await connectDB();
    const admin = await Admin.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (admin._id.toString() === req.admin.adminId) {
      return res.status(400).json({ error: "You cannot modify your own account" });
    }
    const { action } = req.body;
    switch (action) {
      case "approve":
        if (admin.status !== "pending") return res.status(400).json({ error: "Admin is not pending" });
        admin.status = "active";
        admin.approved_by = req.admin.email;
        admin.approved_at = new Date();
        break;
      case "suspend":
        if (admin.status === "suspended") return res.status(400).json({ error: "Already suspended" });
        admin.status = "suspended";
        break;
      case "reactivate":
        if (admin.status !== "suspended") return res.status(400).json({ error: "Admin is not suspended" });
        admin.status = "active";
        break;
      default:
        return res.status(400).json({ error: "Invalid action. Use: approve, suspend, reactivate" });
    }
    await admin.save();
    return res.json({
      ok: true,
      admin: { _id: admin._id, email: admin.email, name: admin.name, role: admin.role, status: admin.status },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/admins/:adminId", async (req, res) => {
  try {
    await connectDB();
    const admin = await Admin.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (admin._id.toString() === req.admin.adminId) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }
    const activeCount = await Admin.countDocuments({ status: "active" });
    if (activeCount <= 1 && admin.status === "active") {
      return res.status(400).json({ error: "Cannot delete the last active admin account" });
    }
    await admin.deleteOne();
    return res.json({ ok: true, deleted: admin.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// TUTOR MANAGEMENT
// ═══════════════════════════════════════════════════════════

router.get("/tutors", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const tutors = await Admin.find({ role: "tutor" })
      .select("email name role status assigned_quiz_ids last_login_at createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(tutors);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/tutors", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const name     = String(req.body?.name     || "").trim();
    const email    = String(req.body?.email    || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name)  return res.status(400).json({ error: "Name is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const tutor = await Admin.create({
      name, email, password_hash: password, role: "tutor", status: "active",
    });

    return res.status(201).json({
      ok: true,
      tutor: {
        _id: tutor._id, name: tutor.name, email: tutor.email,
        role: tutor.role, status: tutor.status, assigned_quiz_ids: [],
        createdAt: tutor.createdAt,
      },
    });
  } catch (err) {
    console.error("Create tutor error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/tutors/:tutorId/quizzes", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const { quiz_ids } = req.body;
    if (!Array.isArray(quiz_ids)) return res.status(400).json({ error: "quiz_ids must be an array" });

    const tutor = await Admin.findOneAndUpdate(
      { _id: req.params.tutorId, role: "tutor" },
      { $set: { assigned_quiz_ids: quiz_ids } },
      { new: true }
    ).lean();

    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    return res.json({ ok: true, tutor });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/tutors/:tutorId/edit", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const tutor = await Admin.findOne({ _id: req.params.tutorId, role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });

    const { name, password } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    tutor.name = String(name).trim();

    if (password) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      tutor.password_hash = String(password);
    }

    await tutor.save();

    return res.json({
      ok: true,
      tutor: {
        _id:               tutor._id,
        name:              tutor.name,
        email:             tutor.email,
        role:              tutor.role,
        status:            tutor.status,
        assigned_quiz_ids: tutor.assigned_quiz_ids || [],
        createdAt:         tutor.createdAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/tutors/:tutorId", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const tutor = await Admin.findOne({ _id: req.params.tutorId, role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });

    const { action } = req.body;
    if (action === "suspend")         tutor.status = "suspended";
    else if (action === "reactivate") tutor.status = "active";
    else return res.status(400).json({ error: "action must be 'suspend' or 'reactivate'" });

    await tutor.save();
    return res.json({
      ok: true,
      tutor: {
        _id: tutor._id, name: tutor.name, email: tutor.email,
        role: tutor.role, status: tutor.status,
        assigned_quiz_ids: tutor.assigned_quiz_ids || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/tutors/:tutorId", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const tutor = await Admin.findOneAndDelete({ _id: req.params.tutorId, role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    return res.json({ ok: true, deleted: tutor.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// FILE UPLOAD (AWS S3)
// ═══════════════════════════════════════════════════════════
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
      "application/pdf",
      "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Allowed: images, PDFs, audio, and video"), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post("/upload", (req, res) => {
  uploadMiddleware.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large. Max 50MB." });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const result = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
      return res.json({
        ok: true, url: result.url, key: result.key,
        filename: req.file.originalname, mimetype: req.file.mimetype, size: result.size,
      });
    } catch (uploadErr) {
      console.error("S3 upload error:", uploadErr.message);
      return res.status(500).json({ error: `S3 upload failed: ${uploadErr.message}` });
    }
  });
});

// ═══════════════════════════════════════════════════════════
// QUIZ ROUTES
// ═══════════════════════════════════════════════════════════

router.get("/quizzes", async (req, res) => {
  try {
    await connectDB();
    const quizzes = await Quiz.find()
      .sort({ year_level: 1, subject: 1, quiz_name: 1 })
      .select("-question_ids")
      .lean();
    return res.json(quizzes);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();
    let quiz = await Quiz.findOne({ quiz_id: req.params.quizId }).lean();
    if (!quiz) quiz = await Quiz.findById(req.params.quizId).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.aggregate([
      {
        $match: {
          $or: [{ quiz_ids: req.params.quizId }, { quiz_ids: quiz.quiz_id }],
        },
      },
      {
        $addFields: {
          _safeOrder: { $ifNull: ["$order", 999999] },
        },
      },
      {
        $sort: { _safeOrder: 1, createdAt: 1 },
      },
    ]);

    return res.json({
      ...quiz,
      questions,
      total_points:   questions.reduce((sum, q) => sum + (q.points || 1), 0),
      question_count: questions.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();
    const allowedFields = [
      "quiz_name", "year_level", "subject", "sub_topic", "tier", "difficulty",
      "time_limit_minutes", "set_number", "is_active", "is_trial",
      "randomize_questions", "randomize_options", "voice_url", "video_url",
      "max_attempts", "passing_score", "attempts_enabled","admin_verified",      // ✅ add
  "admin_verified_by",   // ✅ add
  "admin_verified_at",   // ✅ add
    ];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields to update" });

    const quiz = await Quiz.findOneAndUpdate(
      { quiz_id: req.params.quizId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    return res.json(quiz);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/quizzes/:quizId/export", async (req, res) => {
  try {
    await connectDB();
    let quiz = await Quiz.findOne({ quiz_id: req.params.quizId }).lean();
    if (!quiz) quiz = await Quiz.findById(req.params.quizId).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const questions = await Question.find({
      $or: [{ quiz_ids: req.params.quizId }, { quiz_ids: quiz.quiz_id }],
    }).sort({ createdAt: 1 }).lean();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Questions");
    ws.columns = [
      { header: "#",              key: "num",            width: 5  },
      { header: "question_text",  key: "question_text",  width: 60 },
      { header: "type",           key: "type",           width: 16 },
      { header: "option_a",       key: "option_a",       width: 30 },
      { header: "option_b",       key: "option_b",       width: 30 },
      { header: "option_c",       key: "option_c",       width: 30 },
      { header: "option_d",       key: "option_d",       width: 30 },
      { header: "correct_answer", key: "correct_answer", width: 16 },
      { header: "points",         key: "points",         width: 8  },
      { header: "category",       key: "category",       width: 20 },
      { header: "image_url",      key: "image_url",      width: 50 },
      { header: "explanation",    key: "explanation",    width: 40 },
    ];
    ws.getRow(1).font = { bold: true };

    questions.forEach((q, idx) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const correctAnswer = opts.filter(o => o.correct).map((o, i) => o.label || String.fromCharCode(65 + i)).join(", ") || q.correct_answer || "";
      const rawText = q.text || q.question_text || "";
      const extractedImageUrl = (() => { const m = rawText.match(/src=["'](https?:\/\/[^"']+)["']/i); return m ? m[1] : ""; })();
      const cleanText = rawText.replace(/<img[^>]*>/gi, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
      ws.addRow({
        num: idx + 1, question_text: cleanText, type: q.type || "radio_button",
        option_a: opts[0]?.text || "", option_b: opts[1]?.text || "",
        option_c: opts[2]?.text || "", option_d: opts[3]?.text || "",
        correct_answer: correctAnswer, points: q.points || 1,
        category: q.categories?.[0]?.name || q.category || "",
        image_url: q.image_url || extractedImageUrl || "", explanation: q.explanation || "",
      });
    });

    const filename = `${(quiz.quiz_name || "quiz").replace(/[^a-zA-Z0-9_]/g, "_")}_questions.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.delete("/quizzes/:quizId", async (req, res) => {
  try {
    await connectDB();
    const quiz = await Quiz.findOneAndDelete({ quiz_id: req.params.quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    await Question.deleteMany({ quiz_ids: req.params.quizId });

    const affectedBundles = await QuizCatalog.find({ quiz_ids: req.params.quizId }).lean();
    if (affectedBundles.length > 0) {
      await QuizCatalog.updateMany({ quiz_ids: req.params.quizId }, { $pull: { quiz_ids: req.params.quizId } });
      for (const bundle of affectedBundles) {
        const newCount = (bundle.quiz_ids || []).filter((id) => id !== req.params.quizId).length;
        await QuizCatalog.findOneAndUpdate({ bundle_id: bundle.bundle_id }, { $set: { quiz_count: newCount } });
      }
    }

    return res.json({ ok: true, deleted: req.params.quizId, bundles_updated: affectedBundles.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// QUESTION ROUTES
// ═══════════════════════════════════════════════════════════

router.patch("/questions/:questionId/move", requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const { questionId } = req.params;
    const { from_quiz_id, to_quiz_id } = req.body;

    if (!from_quiz_id || !to_quiz_id)
      return res.status(400).json({ error: "from_quiz_id and to_quiz_id required" });

    const isObjectId = (id) => /^[a-f\d]{24}$/i.test(id);

    const sourceQuiz = await Quiz.findOne(
      isObjectId(from_quiz_id)
        ? { $or: [{ quiz_id: from_quiz_id }, { _id: from_quiz_id }] }
        : { quiz_id: from_quiz_id }
    ).lean();
    if (!sourceQuiz) return res.status(404).json({ error: "Source quiz not found" });

    const destQuiz = await Quiz.findOne(
      isObjectId(to_quiz_id)
        ? { $or: [{ quiz_id: to_quiz_id }, { _id: to_quiz_id }] }
        : { quiz_id: to_quiz_id }
    ).lean();
    if (!destQuiz) return res.status(404).json({ error: "Destination quiz not found" });

    const actualFromId = sourceQuiz.quiz_id;
    const actualToId   = destQuiz.quiz_id;

    if (!actualFromId || !actualToId) {
      return res.status(400).json({
        error: `Quiz missing quiz_id. From: ${actualFromId}, To: ${actualToId}`,
      });
    }

    const question = await Question.findOne({ question_id: questionId }).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    console.log(`Moving ${questionId} | quiz_ids: ${question.quiz_ids} | from: ${actualFromId} → to: ${actualToId}`);

    await Question.updateOne(
      { question_id: questionId },
      { $pull: { quiz_ids: actualFromId } }
    );
    await Question.updateOne(
      { question_id: questionId },
      { $addToSet: { quiz_ids: actualToId }, $set: { order: null } }
    );

    await Quiz.updateOne({ quiz_id: actualFromId }, { $pull: { question_ids: questionId } });
    const updatedSource = await Quiz.findOne({ quiz_id: actualFromId }).lean();
    if (updatedSource) {
      await Quiz.updateOne(
        { quiz_id: actualFromId },
        { $set: { question_count: (updatedSource.question_ids || []).length } }
      );
    }

    await Quiz.updateOne({ quiz_id: actualToId }, { $addToSet: { question_ids: questionId } });
    const updatedDest = await Quiz.findOne({ quiz_id: actualToId }).lean();
    if (updatedDest) {
      await Quiz.updateOne(
        { quiz_id: actualToId },
        { $set: { question_count: (updatedDest.question_ids || []).length } }
      );
    }

    console.log(`✅ Moved ${questionId}: ${actualFromId} → ${actualToId}`);
    return res.json({ success: true });

  } catch (err) {
    console.error("Move error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ✅ Tutor verification (writes to tutor_verification only)
router.patch("/questions/:questionId/verify", async (req, res) => {
  try {
    await connectDB();
    const { status, rejection_reason } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved', 'rejected', or 'pending'" });
    }
    if (status === "rejected" && !rejection_reason?.trim()) {
      return res.status(400).json({ error: "rejection_reason is required when rejecting" });
    }
    const question = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      {
        $set: {
          "tutor_verification.status":           status,
          "tutor_verification.verified_by":      req.admin.email,
          "tutor_verification.verified_at":      new Date(),
          "tutor_verification.rejection_reason": status === "rejected" ? rejection_reason.trim() : null,
        },
      },
      { new: true }
    ).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });
    return res.json({ ok: true, question });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ✅ Admin verification (writes to admin_verification only — tutor_verification NEVER touched)
router.patch("/questions/:questionId/admin-verify", async (req, res) => {
  try {
    await connectDB();
    const { status, message } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved', 'rejected', or 'pending'" });
    }
    if (status === "rejected" && !message?.trim()) {
      return res.status(400).json({ error: "message is required when rejecting" });
    }

    const question = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      {
        $set: {
          "admin_verification.status":      status,
          "admin_verification.verified_by": req.admin.email,
          "admin_verification.verified_at": status === "pending" ? null : new Date(),
          "admin_verification.message":     status === "pending" ? null : (message?.trim() || null),
        },
      },
      { new: true }
    ).lean();

    if (!question) return res.status(404).json({ error: "Question not found" });
    return res.json({ ok: true, question });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/verification-summary", async (req, res) => {
  try {
    await connectDB();
    const stats = await Question.aggregate([
      { $group: { _id: { quiz_id: { $arrayElemAt: ["$quiz_ids", 0] }, status: "$tutor_verification.status" }, count: { $sum: 1 } } },
      { $group: { _id: "$_id.quiz_id", statuses: { $push: { status: "$_id.status", count: "$count" } }, total: { $sum: "$count" } } },
    ]);
    const summary = {};
    for (const row of stats) {
      if (!row._id) continue;
      const entry = { quiz_id: row._id, total: row.total, approved: 0, rejected: 0, pending: 0 };
      for (const s of row.statuses) { entry[s.status || "pending"] = s.count; }
      summary[row._id] = entry;
    }
    return res.json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/quizzes/:quizId/questions", async (req, res) => {
  try {
    await connectDB();
    const { quizId } = req.params;
    const quiz = await Quiz.findOne({ quiz_id: quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const question_id = uuidv4();

    const correctLabels = (req.body.correct_answer || "")
      .toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);

    const rawOptions = req.body.options || [];
    const mappedOptions = rawOptions.map((opt, idx) => {
      const label = opt.label || String.fromCharCode(65 + idx);
      return {
        option_id: opt.option_id || uuidv4(),
        text:      opt.text      || "",
        image_url: opt.image_url || null,
        correct:   opt.correct === true || correctLabels.includes(label.toUpperCase()),
      };
    });

    const question = await Question.create({
      question_id,
      quiz_ids:        [quizId],
      text:            req.body.text || req.body.question_text || "",
      type:            req.body.type || "radio_button",
      options:         mappedOptions,
      correct_answer:  req.body.correct_answer || null,
      case_sensitive:  req.body.case_sensitive || false,
      sub_topic:       req.body.sub_topic || null,
      points:          req.body.points || 1,
      categories:      req.body.category ? [{ name: req.body.category }] : (req.body.categories || []),
      image_url:       req.body.image_url  || null,
      image_size:      req.body.image_size || "medium",
      image_width:     req.body.image_width  != null ? Number(req.body.image_width)  || null : null,
      image_height:    req.body.image_height != null ? Number(req.body.image_height) || null : null,
      explanation:     req.body.explanation  || null,
      shuffle_options: req.body.shuffle_options ?? false,
      voice_url:       req.body.voice_url || null,
      video_url:       req.body.video_url || null,
      order:           req.body.order ?? null,
    });

    await Quiz.findOneAndUpdate(
      { quiz_id: quizId },
      { $addToSet: { question_ids: question_id }, $inc: { question_count: 1 } }
    );

    return res.status(201).json({ ok: true, question });
  } catch (err) {
    console.error("Add question error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/questions/:questionId", async (req, res) => {
  try {
    await connectDB();

    const updates = {};
    const allowed = [
      "text", "type", "options", "correct_answer", "case_sensitive",
      "points", "categories", "image_url", "image_size", "image_width",
      "image_height", "explanation", "shuffle_options", "voice_url",
      "video_url", "order", "sub_topic",
      "text_font_size", "text_font_family", "text_font_weight",
      "text_align", "text_line_height", "text_letter_spacing",
      "text_color", "max_length", "text_style_scope",
    ];

    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    if (req.body.question_text && !updates.text) {
      updates.text = req.body.question_text;
    }

    if (req.body.category && !updates.categories) {
      updates.categories = [{ name: req.body.category }];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const question = await Question.findOneAndUpdate(
      { question_id: req.params.questionId },
      { $set: updates },
      { new: true }
    ).lean();

    if (!question) return res.status(404).json({ error: "Question not found" });
    return res.json({ ok: true, question });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/questions/:questionId", async (req, res) => {
  try {
    await connectDB();
    const { quiz_id } = req.query;
    const question = await Question.findOneAndDelete({ question_id: req.params.questionId });
    if (!question) return res.status(404).json({ error: "Question not found" });

    if (quiz_id) {
      await Quiz.findOneAndUpdate({ quiz_id }, { $pull: { question_ids: req.params.questionId } });
      const updatedQuiz = await Quiz.findOne({ quiz_id }).lean();
      if (updatedQuiz) {
        await Quiz.findOneAndUpdate(
          { quiz_id },
          { $set: { question_count: Math.max(0, (updatedQuiz.question_ids || []).length) } }
        );
      }
    }
    return res.json({ ok: true, deleted: req.params.questionId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// QUIZ UPLOAD
// ═══════════════════════════════════════════════════════════
router.post("/quizzes/upload", async (req, res) => {
  try {
    await connectDB();
    const { quiz: quizData, questions: questionsData } = req.body;

    if (!quizData?.quiz_name?.trim())
      return res.status(400).json({ error: "quiz_name is required" });
    if (!Array.isArray(questionsData) || questionsData.length === 0)
      return res.status(400).json({ error: "At least one question is required" });

    const quiz_id = uuidv4();

    const questions = await Question.insertMany(
      questionsData.map((q, idx) => {
        const correctLabels = (q.correct_answer || "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
        const mappedOptions = (q.options || []).map((opt, idx) => {
          const label = opt.label || String.fromCharCode(65 + idx);
          return { ...opt, option_id: opt.option_id || uuidv4(), correct: opt.correct === true || correctLabels.includes(label.toUpperCase()) };
        });
        return {
          question_id: uuidv4(),
          quiz_ids: [quiz_id],
          text: q.question_text || q.text || "",
          type: q.type || "radio_button",
          options: mappedOptions,
          correct_answer: q.correct_answer || null,
          points: q.points || 1,
          categories: q.category ? [{ name: q.category }] : (q.categories || []),
          image_url: q.image_url || null,
          explanation: q.explanation || "",
          sub_topic: q.sub_topic || null,
          voice_url: q.voice_url || null,
          video_url: q.video_url || null,
          image_width:  q.image_width  != null ? Number(q.image_width)  || null : null,
          image_height: q.image_height != null ? Number(q.image_height) || null : null,
          order: idx * 1000,
        };
      })
    );

    const quiz = await Quiz.create({
      quiz_id,
      quiz_name:          quizData.quiz_name.trim(),
      year_level:         quizData.year_level         || null,
      subject:            quizData.subject            || null,
      sub_topic:          quizData.sub_topic          || null,
      tier:               quizData.tier               || "A",
      time_limit_minutes: quizData.time_limit_minutes || null,
      difficulty:         quizData.difficulty         || null,
      set_number:         quizData.set_number         || 1,
      is_trial:           quizData.is_trial           || false,
      is_active:          true,
      voice_url:          quizData.voice_url          || null,
      video_url:          quizData.video_url          || null,
      question_ids:       questions.map((q) => q.question_id),
      question_count:     questions.length,
    });
   


    return res.status(201).json({ ok: true, quiz_id: quiz.quiz_id, quiz_name: quiz.quiz_name, question_count: questions.length });
  } catch (err) {
    console.error("Quiz upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// BUNDLE ROUTES
// ═══════════════════════════════════════════════════════════
router.get("/bundles", async (req, res) => {
  try {
    await connectDB();
    const bundles = await QuizCatalog.find().sort({ year_level: 1, tier: 1 }).lean();
    return res.json(bundles.map((b) => ({ ...b, quiz_ids: b.quiz_ids || b.flexiquiz_quiz_ids || [], currency: b.currency || "aud" })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/bundles/:bundleId", async (req, res) => {
  try {
    await connectDB();
    const bundle = await QuizCatalog.findOne({ bundle_id: req.params.bundleId }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    return res.json({ ...bundle, quiz_ids: bundle.quiz_ids || bundle.flexiquiz_quiz_ids || [], currency: bundle.currency || "aud" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/bundles", async (req, res) => {
  try {
    await connectDB();
    const { bundle_name, description, year_level, tier, price_cents, currency, max_quiz_count, questions_per_quiz, distribution_mode, swap_eligible_from, subjects } = req.body;
    if (!bundle_name?.trim()) return res.status(400).json({ error: "bundle_name is required" });
    if (price_cents === undefined || Number(price_cents) < 0) return res.status(400).json({ error: "price_cents is required and must be >= 0" });

    const yearSlug  = year_level ? String(year_level).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") : "general";
    const tierSlug  = tier       ? String(tier).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")       : "standard";
    const nameSlug  = bundle_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30);
    const bundle_id = `bundle_${yearSlug}_${tierSlug}_${nameSlug}_${Date.now()}`;

    const bundle = await QuizCatalog.create({
      bundle_id, bundle_name: bundle_name.trim(), description: description || "",
      year_level: year_level || null, tier: tier || "A", price_cents: Number(price_cents),
      currency: currency || "aud", max_quiz_count: max_quiz_count || null,
      questions_per_quiz: questions_per_quiz || null, distribution_mode: distribution_mode || "fixed",
      swap_eligible_from: swap_eligible_from || null, subjects: subjects || [], quiz_ids: [], is_active: true,
    });
    return res.status(201).json(bundle);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/bundles/:bundleId", async (req, res) => {
  try {
    await connectDB();
    const allowedFields = ["bundle_name", "description", "year_level", "tier", "price_cents", "currency", "is_active", "max_quiz_count", "questions_per_quiz", "distribution_mode", "swap_eligible_from", "subjects"];
    const updates = {};
    for (const f of allowedFields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
    const bundle = await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $set: updates }, { new: true }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    return res.json(bundle);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/bundles/:bundleId", async (req, res) => {
  try {
    await connectDB();
    const bundle = await QuizCatalog.findOneAndDelete({ bundle_id: req.params.bundleId });
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    return res.json({ ok: true, deleted: req.params.bundleId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    await connectDB();
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });
    const bundle = await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $addToSet: { quiz_ids: quiz_id } }, { new: true }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $set: { quiz_count: bundle.quiz_ids.length } });
    return res.json({ ok: true, bundle });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    await connectDB();
    const { quiz_id } = req.body;
    if (!quiz_id) return res.status(400).json({ error: "quiz_id is required" });
    const bundle = await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $pull: { quiz_ids: quiz_id } }, { new: true }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $set: { quiz_count: bundle.quiz_ids.length } });
    return res.json({ ok: true, bundle });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/bundles/:bundleId/quizzes", async (req, res) => {
  try {
    await connectDB();
    const { quiz_ids } = req.body;
    if (!Array.isArray(quiz_ids)) return res.status(400).json({ error: "quiz_ids must be an array" });
    const bundle = await QuizCatalog.findOneAndUpdate({ bundle_id: req.params.bundleId }, { $set: { quiz_ids, quiz_count: quiz_ids.length } }, { new: true }).lean();
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    return res.json(bundle);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CHILDREN / PURCHASE MANAGEMENT
// ═══════════════════════════════════════════════════════════
router.get("/children", async (req, res) => {
  try {
    await connectDB();
    const children = await Child.find()
      .select("name username year_level entitled_bundle_ids parent_id createdAt")
      .sort({ createdAt: -1 }).lean();
    return res.json(children);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/children/:childId/bundles", async (req, res) => {
  try {
    await connectDB();
    const { bundle_ids } = req.body;
    if (!Array.isArray(bundle_ids)) return res.status(400).json({ error: "bundle_ids must be an array" });
    const child = await Child.findByIdAndUpdate(req.params.childId, { $set: { entitled_bundle_ids: bundle_ids } }, { new: true }).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });
    return res.json({ ok: true, child });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
// ✅ NEW: Manually regenerate AI explanations for a quiz
// ✅ Manually regenerate AI explanations for a quiz (admin button only)
router.post("/quizzes/:quizId/generate-explanations", async (req, res) => {
  try {
    await connectDB();
    const { quizId } = req.params;

    const quiz = await Quiz.findOne({ quiz_id: quizId }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Fire in background
    generateQuizExplanations(quizId).catch(console.error);

    return res.json({ success: true, message: "Generation started in background" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ✅ Poll generation progress
router.get("/quizzes/:quizId/generate-explanations/status", async (req, res) => {
  const progress = explanation_progress[req.params.quizId];
  if (!progress) return res.json({ status: "idle" });
  return res.json(progress);
});

module.exports = router;