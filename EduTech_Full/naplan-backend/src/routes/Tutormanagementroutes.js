// ═══════════════════════════════════════════════════════════
// TUTOR MANAGEMENT ROUTES
// Add these routes to adminRoutes.js — they go AFTER the
// existing verification routes and BEFORE module.exports.
//
// Also update the middleware import at the top of adminRoutes.js:
//   const { requireAdmin, requireAdminOnly } = require("../middleware/adminAuth");
//
// Then add requireAdminOnly to admin-only routes:
//   router.use(requireAdmin);  ← keep this for read routes
// But wrap specific write routes with requireAdminOnly middleware
// to block tutors from managing quizzes/bundles.
// ═══════════════════════════════════════════════════════════

// GET /api/admin/tutors — list all tutors
router.get("/tutors", async (req, res) => {
  try {
    await connectDB();
    // Only admins can list tutors
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    const tutors = await Admin.find({ role: "tutor" })
      .select("email name role status assigned_quiz_ids last_login_at createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(tutors);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tutors — create a new tutor account
router.post("/tutors", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

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
      name,
      email,
      password_hash: password, // pre-save hook hashes it
      role:   "tutor",
      status: "active",
    });

    return res.status(201).json({
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
    console.error("Create tutor error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/tutors/:tutorId/quizzes — assign quizzes to a tutor
router.patch("/tutors/:tutorId/quizzes", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { add = [], remove = [] } = req.body;
    if (!Array.isArray(add) || !Array.isArray(remove)) {
      return res.status(400).json({ error: "add and remove must be arrays" });
    }

    // Validate that every quiz_id in `add` actually exists
    if (add.length > 0) {
      const existing = await Quiz.find({ quiz_id: { $in: add } })
        .select("quiz_id").lean();
      const existingIds = new Set(existing.map(q => q.quiz_id));
      const missing = add.filter(id => !existingIds.has(id));
      if (missing.length > 0) {
        return res.status(400).json({
          error: "Some quiz_ids do not exist",
          missing,
        });
      }
    }

    const tutor = await Admin.findOneAndUpdate(
      { _id: req.params.tutorId, role: "tutor" },
      {
        $addToSet: { assigned_quiz_ids: { $each: add } },
        $pull:     { assigned_quiz_ids: { $in: remove } },
      },
      { new: true }
    ).lean();

    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    return res.json({ ok: true, tutor: { /* ... */ } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/tutors/:tutorId — delete a tutor account
router.delete("/tutors/:tutorId", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    const tutor = await Admin.findOneAndDelete({ _id: req.params.tutorId, role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    return res.json({ ok: true, deleted: tutor.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});