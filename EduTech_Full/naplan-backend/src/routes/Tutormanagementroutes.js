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

    const { quiz_ids } = req.body;
    if (!Array.isArray(quiz_ids)) {
      return res.status(400).json({ error: "quiz_ids must be an array" });
    }

    const tutor = await Admin.findOneAndUpdate(
      { _id: req.params.tutorId, role: "tutor" },
      { $set: { assigned_quiz_ids: quiz_ids } },
      { new: true }
    ).lean();

    if (!tutor) return res.status(404).json({ error: "Tutor not found" });

    return res.json({
      ok: true,
      tutor: {
        _id:               tutor._id,
        name:              tutor.name,
        email:             tutor.email,
        role:              tutor.role,
        status:            tutor.status,
        assigned_quiz_ids: tutor.assigned_quiz_ids || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/tutors/:tutorId — suspend / reactivate tutor
router.patch("/tutors/:tutorId", async (req, res) => {
  try {
    await connectDB();
    if (req.admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const tutor = await Admin.findOne({ _id: req.params.tutorId, role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });

    const { action } = req.body;
    if (action === "suspend") {
      tutor.status = "suspended";
    } else if (action === "reactivate") {
      tutor.status = "active";
    } else {
      return res.status(400).json({ error: "action must be 'suspend' or 'reactivate'" });
    }
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