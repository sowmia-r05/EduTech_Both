/**
 * routes/childRoutes.js
 * ✅ CLEANED: Removed all FlexiQuiz/Result model dependencies.
 *    Stats now use native QuizAttempt only.
 */

const router = require("express").Router();
const mongoose = require("mongoose");
const Child = require("../models/child");
const Writing = require("../models/writing");
const Parent = require("../models/parent");
const QuizAttempt = require("../models/quizAttempt");
const Quiz = require("../models/quiz");

const { verifyToken, requireParent, requireAuth } = require("../middleware/auth");

async function aggregateChildStats(child) {
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

  const nativeCount = nativeStats?.count || 0;
  const nativeAvg = nativeStats?.avgScore || 0;
  const nativeLast = nativeStats?.lastActivity || null;

  const childStatus = (child.status || "trial").toLowerCase();

  if (childStatus === "trial") {
    const trialQuizzes = await Quiz.find({
      is_active: true,
      is_trial: true,
      year_level: child.year_level,
    }).select("quiz_id").lean();

    const trialQuizIds = trialQuizzes.map((q) => q.quiz_id);

    if (trialQuizIds.length === 0) {
      return { quizCount: 0, averageScore: 0, lastActivity: null };
    }

    const [trialStats] = await QuizAttempt.aggregate([
      {
        $match: {
          child_id: child._id,
          status: { $in: ["scored", "ai_done", "submitted"] },
          quiz_id: { $in: trialQuizIds },
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

    return {
      quizCount: trialStats?.count || 0,
      averageScore: Math.round(trialStats?.avgScore || 0),
      lastActivity: trialStats?.lastActivity || null,
    };
  }

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

  const writingCount = writingStats?.count || 0;
  const quizCount = nativeCount + writingCount;
  const avgScore = Math.round(nativeAvg);

  const allDates = [nativeLast, writingStats?.lastWriting].filter(Boolean);
  const lastActivity = allDates.length
    ? new Date(Math.max(...allDates.map((d) => new Date(d))))
    : null;

  return { quizCount, averageScore: avgScore, lastActivity };
}

// ────────────────────────────────────────────
// GET /api/children/check-username/:username
// ────────────────────────────────────────────
router.get("/check-username/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.json({ available: false, reason: "Invalid format" });
    }
    const exists = await Child.exists({ username });
    return res.json({ available: !exists });
  } catch (err) {
    console.error("check-username error:", err);
    return res.status(500).json({ available: false, reason: "Server error" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/summaries
// ────────────────────────────────────────────
router.get("/summaries", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const children = await Child.find({ parent_id: parentId }).lean();

    const summaries = await Promise.all(
      children.map(async (child) => {
        const stats = await aggregateChildStats(child);
        return {
          _id: child._id,
          parent_id: child.parent_id,
          display_name: child.display_name,
          username: child.username,
          year_level: child.year_level,
          status: child.status,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
          quizCount: stats.quizCount,
          averageScore: stats.averageScore,
          lastActivity: stats.lastActivity,
          entitled_bundle_ids: child.entitled_bundle_ids || [],
          entitled_quiz_ids: child.entitled_quiz_ids || [],
        };
      }),
    );

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
    const parentId = req.user?.parentId || req.user?.parent_id;
    if (!parentId) return res.status(401).json({ error: "Invalid parent authentication" });

    const display_name = String(req.body.display_name || "").trim();
    const username = String(req.body.username || "").trim().toLowerCase();
    const year_level = Number(req.body.year_level);
    const pin = String(req.body.pin || "").trim();

    if (!display_name) return res.status(400).json({ error: "Display name is required" });
    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3–20 characters, lowercase letters, numbers, and underscores only" });
    }
    if (![3, 5, 7, 9].includes(year_level)) {
      return res.status(400).json({ error: "Year level must be 3, 5, 7, or 9" });
    }
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    const parental_consent = req.body.parental_consent === true;
    if (!parental_consent) {
      return res.status(400).json({ error: "Parental consent is required to create a child profile" });
    }

    const email_notifications = req.body.email_notifications === true;

    const existing = await Child.exists({ username });
    if (existing) return res.status(409).json({ error: "Username is already taken" });

    const child = new Child({
      parent_id: parentId,
      display_name,
      username,
      year_level,
      pin_hash: pin,
      parental_consent,
      parental_consent_at: new Date(),
      email_notifications,
    });

    try {
      await child.save();
    } catch (saveErr) {
      if (saveErr?.code === 11000) return res.status(409).json({ error: "Username is already taken" });
      return res.status(500).json({ error: "Failed to create child", detail: saveErr.message });
    }

    return res.status(201).json({
      _id: child._id,
      parent_id: child.parent_id,
      display_name: child.display_name,
      username: child.username,
      year_level: child.year_level,
      status: child.status,
      email_notifications: child.email_notifications,
      createdAt: child.createdAt,
    });
  } catch (err) {
    console.error("POST /children error:", err);
    return res.status(500).json({ error: "Failed to create child", detail: err.message });
  }
});

// ────────────────────────────────────────────
// PUT /api/children/:childId
// ────────────────────────────────────────────
router.put("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) return res.status(400).json({ error: "Invalid child ID" });

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
      updates.pin_hash = await Child.hashPin(pin);
    }
    if (req.body.email_notifications !== undefined) {
      updates.email_notifications = req.body.email_notifications === true;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

    const updated = await Child.findByIdAndUpdate(childId, { $set: updates }, { new: true })
      .select("-pin_hash").lean();

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
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findOne({ _id: childId, parent_id: parentId });
    if (!child) return res.status(404).json({ error: "Child not found" });

    await Child.findByIdAndDelete(childId);
    await QuizAttempt.deleteMany({ child_id: childId });

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
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    const parentId = req.user.parentId || req.user.parent_id;
    if (req.user.role === "parent" && String(child.parent_id) !== String(parentId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (req.user.role === "child" && String(child._id) !== String(req.user.childId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const nativeAttempts = await QuizAttempt.find({
      child_id: childId,
      status: { $in: ["scored", "ai_done", "submitted"] },
    }).sort({ submitted_at: -1 }).lean();

    const results = nativeAttempts.map((a) => {
      const tb = {};
      if (a.topic_breakdown) {
        const entries = a.topic_breakdown instanceof Map
          ? [...a.topic_breakdown.entries()]
          : Object.entries(a.topic_breakdown);
        entries.forEach(([k, v]) => { tb[k] = v; });
      }
      return {
        _id: a._id,
        response_id: a.attempt_id,
        quiz_id: a.quiz_id,
        quiz_name: a.quiz_name,
        subject: a.subject,
        score: a.score || { percentage: 0, points: 0, available: 0, grade: "" },
        topic_breakdown: tb,
        is_writing: a.is_writing || false,
        date_submitted: a.submitted_at,
        createdAt: a.createdAt,
        ai_status: a.ai_feedback_meta?.status || null,
        duration: a.duration_seconds || 0,
        source: "native",
      };
    });

    return res.json(results);
  } catch (err) {
    console.error("GET /:childId/results error:", err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/writing  ← ✅ ADDED
// ────────────────────────────────────────────
router.get("/:childId/writing", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    const parentId = req.user.parentId || req.user.parent_id;
    if (req.user.role === "parent" && String(child.parent_id) !== String(parentId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (req.user.role === "child" && String(child._id) !== String(req.user.childId)) {
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

// ────────────────────────────────────────────
// GET /api/children/:childId/me
// ────────────────────────────────────────────
router.get("/:childId/me", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(childId)) return res.status(400).json({ error: "Invalid child ID" });

    const child = await Child.findById(childId).select("-pin_hash").lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    return res.json(child);
  } catch (err) {
    console.error("GET /:childId/me error:", err);
    return res.status(500).json({ error: "Failed to fetch child profile" });
  }
});

module.exports = router;