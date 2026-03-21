


const express   = require("express");
const mongoose  = require("mongoose");
const router    = express.Router();

const { verifyToken, requireAuth, requireParent } = require("../middleware/auth");
const connectDB    = require("../config/db");
const Child        = require("../models/child");
const QuizAttempt  = require("../models/quizAttempt");
const Writing      = require("../models/writing");



async function aggregateChildStats(child) {
  // Count all QuizAttempts for this child (MCQ/Reading/Numeracy/Language)
  const [nativeStats] = await QuizAttempt.aggregate([
    {
      $match: {
        child_id: child._id,
        status: { $in: ["scored", "ai_done", "submitted"] },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avgScore: { $avg: "$score.percentage" },
        lastActivity: { $max: "$submitted_at" },
      },
    },
  ]);

  // Count Writing submissions separately (they live in a different collection)
  const [writingStats] = await Writing.aggregate([
    { $match: { child_id: child._id } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        lastWriting: { $max: "$submitted_at" },
      },
    },
  ]);

  const nativeCount = nativeStats?.count || 0;
  const nativeAvg = nativeStats?.avgScore || 0;
  const nativeLast = nativeStats?.lastActivity || null;
  const writingCount = writingStats?.count || 0;
  const writingLast = writingStats?.lastWriting || null;

  const quizCount = nativeCount + writingCount;
  const avgScore = Math.round(nativeAvg); // Writing scores aren't averaged here — keeps it consistent

  // Most recent activity across both types
  const allDates = [nativeLast, writingLast].filter(Boolean);
  const lastActivity = allDates.length
    ? new Date(Math.max(...allDates.map((d) => new Date(d))))
    : null;

  return { quizCount, averageScore: avgScore, lastActivity };
}

// ────────────────────────────────────────────
// GET /api/children/summaries
// ────────────────────────────────────────────
router.get("/summaries", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;

    const children = await Child.find({ parent_id: parentId })
      .select("-pin_hash")
      .lean();

    if (!children.length) return res.json([]);

    const childIds = children.map((c) => c._id);

    const [attempts, writings] = await Promise.all([
      QuizAttempt.find({
        child_id: { $in: childIds },
        status: { $in: ["scored", "ai_done", "submitted"] },
      })
        .sort({ submitted_at: -1 })
        .lean(),
      Writing.find({ child_id: { $in: childIds } })
        .sort({ submitted_at: -1 })
        .lean(),
    ]);

    const attemptsByChild = {};
    for (const a of attempts) {
      const key = String(a.child_id);
      if (!attemptsByChild[key]) attemptsByChild[key] = [];
      attemptsByChild[key].push(a);
    }

    const writingsByChild = {};
    for (const w of writings) {
      const key = String(w.child_id);
      if (!writingsByChild[key]) writingsByChild[key] = [];
      writingsByChild[key].push(w);
    }

    const summaries = children.map((child) => {
      const childKey    = String(child._id);
      const childAttempts = attemptsByChild[childKey] || [];
      const childWritings = writingsByChild[childKey] || [];

      const allDates = [
        ...childAttempts.map((a) => a.submitted_at || a.createdAt),
        ...childWritings.map((w) => w.submitted_at || w.createdAt),
      ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));

      const scores = childAttempts
        .map((a) => a.score?.percentage)
        .filter((s) => s != null);

      const avgScore = scores.length
        ? Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length)
        : null;

      // Streak calculation
      const uniqueDays = [
        ...new Set(
          allDates.map((d) => new Date(d).toISOString().slice(0, 10))
        ),
      ].sort((a, b) => b.localeCompare(a));

      let streak = 0;
      const today = new Date().toISOString().slice(0, 10);
      let cursor  = today;
      for (const day of uniqueDays) {
        if (day === cursor) {
          streak++;
          const d = new Date(cursor);
          d.setDate(d.getDate() - 1);
          cursor = d.toISOString().slice(0, 10);
        } else break;
      }

      return {
        _id:         child._id,
        display_name: child.display_name,
        username:    child.username,
        year_level:  child.year_level,
        status:      child.status || "trial",
        entitled_quiz_ids:    child.entitled_quiz_ids    || [],
        entitled_bundle_ids:  child.entitled_bundle_ids  || [],
        quiz_count:   childAttempts.length + childWritings.length,
        average_score: avgScore,
        last_active:  allDates[0] || null,
        streak_days:  streak,
        email_notifications: child.email_notifications ?? false,
      };
    });

    return res.json(summaries);
  } catch (err) {
    console.error("GET /children/summaries error:", err);
    return res.status(500).json({ error: "Failed to fetch children" });
  }
});

// ────────────────────────────────────────────
// GET /api/children
// ────────────────────────────────────────────
router.get("/", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const children = await Child.find({ parent_id: parentId })
      .select("-pin_hash")
      .lean();
    return res.json(children);
  } catch (err) {
    console.error("GET /children error:", err);
    return res.status(500).json({ error: "Failed to fetch children" });
  }
});

// ────────────────────────────────────────────
// POST /api/children
// ────────────────────────────────────────────
router.post("/", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user?.parentId || req.user?.parent_id;
    if (!parentId) return res.status(401).json({ error: "Invalid parent authentication" });

    const display_name = String(req.body.display_name || "").trim();
    const username     = String(req.body.username || "").trim().toLowerCase();
    const year_level   = Number(req.body.year_level);
    const pin          = String(req.body.pin || "").trim();

    if (!display_name) return res.status(400).json({ error: "Display name is required" });
    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3–20 lowercase alphanumeric characters" });
    }
    if (![3, 5, 7, 9].includes(year_level)) {
      return res.status(400).json({ error: "Year level must be 3, 5, 7, or 9" });
    }
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    const existing = await Child.findOne({ username });
    if (existing) return res.status(409).json({ error: "Username already taken" });

    const child = new Child({
      parent_id:    parentId,
      display_name,
      username,
      year_level,
      pin_hash: pin,
      status:       "trial",
    });
    await child.save();

    return res.status(201).json({
      _id:          child._id,
      display_name: child.display_name,
      username:     child.username,
      year_level:   child.year_level,
      status:       child.status,
    });
  } catch (err) {
    console.error("POST /children error:", err);
    return res.status(500).json({ error: "Failed to create child" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/check-username/:username
// ────────────────────────────────────────────
router.get("/check-username/:username", async (req, res) => {
  try {
    await connectDB();
    const username = String(req.params.username || "").trim().toLowerCase();
    if (!username) return res.json({ available: false });
    const existing = await Child.findOne({ username }).lean();
    return res.json({ available: !existing });
  } catch (err) {
    console.error("GET /children/check-username error:", err);
    return res.status(500).json({ error: "Failed to check username" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId              (parent only)
// ────────────────────────────────────────────
router.get("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findOne({ _id: childId, parent_id: parentId })
      .select("-pin_hash")
      .lean();

    if (!child) return res.status(404).json({ error: "Child not found" });
    return res.json(child);
  } catch (err) {
    console.error("GET /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to fetch child" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/me   ← ✅ OWNERSHIP CHECK ADDED
// ────────────────────────────────────────────
router.get("/:childId/me", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { childId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findById(childId).select("-pin_hash").lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // ✅ FIX: Ownership check — was completely missing before
    if (req.user.role === "parent") {
      const parentId = req.user.parentId || req.user.parent_id;
      if (String(child.parent_id) !== String(parentId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (req.user.role === "child") {
      if (String(child._id) !== String(req.user.childId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    return res.json(child);
  } catch (err) {
    console.error("GET /:childId/me error:", err);
    return res.status(500).json({ error: "Failed to fetch child profile" });
  }
});

// ────────────────────────────────────────────
// PUT /api/children/:childId
// ────────────────────────────────────────────
router.put("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findOne({ _id: childId, parent_id: parentId });
    if (!child) return res.status(404).json({ error: "Child not found" });

    const updates = {};
    if (req.body.display_name !== undefined) {
      const dn = String(req.body.display_name).trim();
      if (!dn) return res.status(400).json({ error: "Display name cannot be empty" });
      updates.display_name = dn;
    }
    if (req.body.year_level !== undefined) {
      const yl = Number(req.body.year_level);
      if (![3, 5, 7, 9].includes(yl)) return res.status(400).json({ error: "Year level must be 3, 5, 7, or 9" });
      updates.year_level = yl;
    }
    if (req.body.pin !== undefined) {
      const pin = String(req.body.pin).trim();
      if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "PIN must be exactly 6 digits" });
      child.pin_hash = pin;
      await child.save();
    }
    if (req.body.email_notifications !== undefined) {
      updates.email_notifications = req.body.email_notifications === true;
    }

    if (Object.keys(updates).length > 0) {
      await Child.findByIdAndUpdate(childId, { $set: updates });
    }

    const updated = await Child.findById(childId).select("-pin_hash").lean();
    return res.json(updated);
  } catch (err) {
    console.error("PUT /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to update child" });
  }
});

// ────────────────────────────────────────────
// DELETE /api/children/:childId
// ────────────────────────────────────────────
router.delete("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findOne({ _id: childId, parent_id: parentId });
    if (!child) return res.status(404).json({ error: "Child not found" });

    await Child.findByIdAndDelete(childId);
    await QuizAttempt.deleteMany({ child_id: childId });
    await Writing.deleteMany({ child_id: childId });

    return res.json({ ok: true, deleted: child._id });
  } catch (err) {
    console.error("DELETE /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to delete child" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/results
// ────────────────────────────────────────────
router.get("/:childId/results", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { childId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    if (req.user.role === "parent") {
      const parentId = req.user.parentId || req.user.parent_id;
      if (String(child.parent_id) !== String(parentId))
        return res.status(403).json({ error: "Access denied" });
    }
    if (req.user.role === "child") {
      if (String(child._id) !== String(req.user.childId))
        return res.status(403).json({ error: "Access denied" });
    }

    const attempts = await QuizAttempt.find({
      child_id: child._id,
      status: { $in: ["scored", "ai_done", "submitted"] },
    })
      .sort({ submitted_at: -1 })
      .lean();

    return res.json(attempts);
  } catch (err) {
    console.error("GET /children/:childId/results error:", err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/writing
// ────────────────────────────────────────────
router.get("/:childId/writing", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { childId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(childId))
      return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    if (req.user.role === "parent") {
      const parentId = req.user.parentId || req.user.parent_id;
      if (String(child.parent_id) !== String(parentId))
        return res.status(403).json({ error: "Access denied" });
    }
    if (req.user.role === "child") {
      if (String(child._id) !== String(req.user.childId))
        return res.status(403).json({ error: "Access denied" });
    }

    const docs = await Writing.find({ child_id: child._id })
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    return res.json(docs);
  } catch (err) {
    console.error("GET /children/:childId/writing error:", err);
    return res.status(500).json({ error: "Failed to fetch writing submissions" });
  }
});

module.exports = router;
