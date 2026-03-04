/**
 * routes/childRoutes.js
 *
 * ✅ CLEANED: Removed all FlexiQuiz dependencies.
 *    - No more registerRespondent / fqDeleteUser / encryptPassword
 *    - No more legacy User model upsert
 *    - Child create & delete are now purely local (MongoDB only)
 *    - All other logic (aggregateChildStats, results merge, etc.) preserved as-is
 */

const router = require("express").Router();
const mongoose = require("mongoose");
const Child = require("../models/child");
const Result = require("../models/result");
const Writing = require("../models/writing");
const Parent = require("../models/parent");
const QuizAttempt = require("../models/quizAttempt");
const Quiz = require("../models/quiz");

const {
  verifyToken,
  requireParent,
  requireAuth,
} = require("../middleware/auth");


// All routes in this file are mounted at /api/children
// verifyToken is applied at the app.js level for /api/children

// ────────────────────────────────────────────
// Helper: aggregate stats for a child
// ✅ UPDATED: Now includes native QuizAttempt data
// ────────────────────────────────────────────
async function aggregateChildStats(child) {
  const matchQuery = child.flexiquiz_user_id
    ? { "user.user_id": child.flexiquiz_user_id }
    : child.username
      ? { "user.user_name": child.username }
      : null;

  // ── Legacy FlexiQuiz stats ──
  let legacyQuizCount = 0;
  let legacyScores = [];
  let legacyDates = [];
  let writingCount = 0;
  let writingDates = [];

  if (matchQuery) {
    const [resultStats] = await Result.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          quizCount: { $sum: 1 },
          avgScore: { $avg: "$score.percentage" },
          lastActivity: { $max: "$date_submitted" },
        },
      },
    ]);

    const [writingStats] = await Writing.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          lastWriting: { $max: "$submitted_at" },
        },
      },
    ]);

    legacyQuizCount = resultStats?.quizCount || 0;
    if (resultStats?.avgScore) legacyScores.push({ count: legacyQuizCount, avg: resultStats.avgScore });
    if (resultStats?.lastActivity) legacyDates.push(resultStats.lastActivity);
    writingCount = writingStats?.count || 0;
    if (writingStats?.lastWriting) writingDates.push(writingStats.lastWriting);
  }

  // ── Native QuizAttempt stats ──
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

  // ── KPI FIX: If child is on trial, only count results from trial quizzes ──
  const childStatus = (child.status || "trial").toLowerCase();
  if (childStatus === "trial") {
    // Get list of trial quizzes for this child's year level
    const trialQuizzes = await Quiz.find({
      is_active: true,
      is_trial: true,
      year_level: child.year_level,
    }).select("quiz_id quiz_name").lean();

    const trialQuizIds = trialQuizzes.map((q) => q.quiz_id);
    const trialQuizNames = trialQuizzes.map((q) => (q.quiz_name || "").toLowerCase().trim());

    // Re-count native attempts — only trial quizzes
    let filteredNativeCount = 0;
    let filteredNativeAvg = 0;
    let filteredNativeLast = null;

    if (trialQuizIds.length > 0) {
      const [trialNativeStats] = await QuizAttempt.aggregate([
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

      filteredNativeCount = trialNativeStats?.count || 0;
      filteredNativeAvg = trialNativeStats?.avgScore || 0;
      filteredNativeLast = trialNativeStats?.lastActivity || null;
    }

    // For legacy results, filter by quiz_name match to trial quizzes
    let filteredLegacyCount = 0;
    let filteredLegacyAvg = 0;
    let filteredLegacyLast = null;

    if (matchQuery && trialQuizNames.length > 0) {
      const legacyResults = await Result.find(matchQuery)
        .select("quiz_name score.percentage date_submitted")
        .lean();
      const filteredLegacy = legacyResults.filter((r) => {
        const name = (r.quiz_name || "").toLowerCase().trim();
        return trialQuizNames.some(
          (tn) => name === tn || name.includes(tn) || tn.includes(name)
        );
      });
      filteredLegacyCount = filteredLegacy.length;
      if (filteredLegacy.length > 0) {
        filteredLegacyAvg =
          filteredLegacy.reduce((sum, r) => sum + (r.score?.percentage || 0), 0) /
          filteredLegacy.length;
        const legacyDatesFiltered = filteredLegacy
          .map((r) => r.date_submitted)
          .filter(Boolean);
        if (legacyDatesFiltered.length > 0) {
          filteredLegacyLast = new Date(
            Math.max(...legacyDatesFiltered.map((d) => new Date(d)))
          );
        }
      }
    }

    const trialQuizCount = filteredLegacyCount + filteredNativeCount;
    const trialTotalScored = filteredLegacyCount + filteredNativeCount;
    let trialAvgScore = 0;
    if (trialTotalScored > 0) {
      trialAvgScore = Math.round(
        (filteredLegacyAvg * filteredLegacyCount +
          filteredNativeAvg * filteredNativeCount) /
          trialTotalScored
      );
    }

    const trialDates = [filteredNativeLast, filteredLegacyLast].filter(Boolean);
    const trialLastActivity = trialDates.length
      ? new Date(Math.max(...trialDates.map((d) => new Date(d))))
      : null;

    return {
      quizCount: trialQuizCount,
      averageScore: trialAvgScore,
      lastActivity: trialLastActivity,
    };
  }

  // ── Merge (active/paid children — count everything) ──
  const quizCount = legacyQuizCount + writingCount + nativeCount;

  // Weighted average across legacy + native
  let avgScore = 0;
  const totalScoredCount = legacyQuizCount + nativeCount;
  if (totalScoredCount > 0) {
    const legacyTotal = (legacyScores[0]?.avg || 0) * legacyQuizCount;
    const nativeTotal = nativeAvg * nativeCount;
    avgScore = Math.round((legacyTotal + nativeTotal) / totalScoredCount);
  }

  const allDates = [...legacyDates, ...writingDates];
  if (nativeLast) allDates.push(nativeLast);
  const lastActivity = allDates.length
    ? new Date(Math.max(...allDates.map((d) => new Date(d))))
    : null;

  return { quizCount, averageScore: avgScore, lastActivity };
}

// ────────────────────────────────────────────
// GET /api/children/check-username/:username
// Public — for live uniqueness check in AddChild modal
// ────────────────────────────────────────────
router.get("/check-username/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "")
      .trim()
      .toLowerCase();

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
// Returns ALL children for the parent WITH aggregated stats
// This is the single API call that powers ParentDashboard
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
          // Aggregated stats
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
// List all children for authenticated parent (no stats — lightweight)
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
// Create a new child profile
// Body: { display_name, username, year_level, pin }
// ✅ CLEANED: No FlexiQuiz — purely local creation
// ────────────────────────────────────────────
router.post("/", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user?.parentId || req.user?.parent_id;
    if (!parentId) {
      return res.status(401).json({ error: "Invalid parent authentication" });
    }

    const display_name = String(req.body.display_name || "").trim();
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const year_level = Number(req.body.year_level);
    const pin = String(req.body.pin || "").trim();

    if (!display_name) {
      return res.status(400).json({ error: "Display name is required" });
    }
    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        error:
          "Username must be 3–20 characters, lowercase letters, numbers, and underscores only",
      });
    }
    if (![3, 5, 7, 9].includes(year_level)) {
      return res
        .status(400)
        .json({ error: "Year level must be 3, 5, 7, or 9" });
    }
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }
    // ── Parental consent (required) ──
    const parental_consent = req.body.parental_consent === true;
    if (!parental_consent) {
      return res.status(400).json({ error: "Parental consent is required to create a child profile" });
    }

    // ── Email notifications (optional) ──
    const email_notifications = req.body.email_notifications === true;

    // Check username uniqueness
    const existing = await Child.exists({ username });
    if (existing) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    // ── Create child (local only) ──
    const child = new Child({
      parent_id: parentId,
      display_name,
      username,
      year_level,
      pin_hash: pin, // pre-save hook will hash this
       parental_consent,
      parental_consent_at: new Date(),
      email_notifications,
    });

    try {
      await child.save();
    } catch (saveErr) {
      if (saveErr?.code === 11000) {
        return res.status(409).json({ error: "Username is already taken" });
      }
      return res
        .status(500)
        .json({ error: "Failed to create child", detail: saveErr.message });
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
    return res
      .status(500)
      .json({ error: "Failed to create child", detail: err.message });
  }
});

// ────────────────────────────────────────────
// PUT /api/children/:childId
// Update child (display_name, year_level, pin)
// ────────────────────────────────────────────
router.put("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findOne({ _id: childId, parent_id: parentId });
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    const updates = {};

    if (req.body.display_name !== undefined) {
      const dn = String(req.body.display_name).trim();
      if (!dn)
        return res.status(400).json({ error: "Display name cannot be empty" });
      updates.display_name = dn;
    }

    if (req.body.year_level !== undefined) {
      const yl = Number(req.body.year_level);
      if (![3, 5, 7, 9].includes(yl)) {
        return res
          .status(400)
          .json({ error: "Year level must be 3, 5, 7, or 9" });
      }
      updates.year_level = yl;
    }

    if (req.body.pin !== undefined) {
      const pin = String(req.body.pin).trim();
      if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 6 digits" });
      }
      updates.pin_hash = await Child.hashPin(pin);
    }
    if (req.body.email_notifications !== undefined) {
      updates.email_notifications = req.body.email_notifications === true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await Child.findByIdAndUpdate(
      childId,
      { $set: updates },
      { new: true },
    )
      .select("-pin_hash")
      .lean();

    return res.json(updated);
  } catch (err) {
    console.error("PUT /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to update child" });
  }
});

// ────────────────────────────────────────────
// DELETE /api/children/:childId
// ✅ CLEANED: No FlexiQuiz — local delete only
// ────────────────────────────────────────────
router.delete("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findOne({
      _id: childId,
      parent_id: parentId,
    });
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    // Delete from MongoDB
    await Child.findByIdAndDelete(childId);

    // Also clean up any quiz attempts for this child
    await QuizAttempt.deleteMany({ child_id: childId });

    return res.json({
      ok: true,
      deleted: child._id,
    });
  } catch (err) {
    console.error("DELETE /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to delete child" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/results
// ✅ UPDATED: Returns MERGED Result + QuizAttempt docs
// Accessible by parent (own child) or child (own data)
// ────────────────────────────────────────────
router.get("/:childId/results", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Scope check
    const parentId = req.user.parentId || req.user.parent_id;
    if (
      req.user.role === "parent" &&
      String(child.parent_id) !== String(parentId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (
      req.user.role === "child" &&
      String(child._id) !== String(req.user.childId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ── 1. Legacy results (Result collection — old FlexiQuiz data if any) ──
    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const legacyResults = await Result.find(matchQuery)
      .sort({ date_submitted: -1, createdAt: -1 })
      .lean();

    // ── 2. Native QuizAttempt results (completed ones) ──
    const nativeAttempts = await QuizAttempt.find({
      child_id: childId,
      status: { $in: ["scored", "ai_done", "submitted"] },
    })
      .sort({ submitted_at: -1 })
      .lean();

    // ── 3. Normalize native attempts to match legacy result format ──
    const normalizedNative = nativeAttempts.map((a) => {
              // Convert topic_breakdown Map to plain Object for JSON serialization
              const tb = {};
              if (a.topic_breakdown) {
                const entries =
                  a.topic_breakdown instanceof Map
                    ? a.topic_breakdown.entries()
                    : Object.entries(a.topic_breakdown);
                for (const [k, v] of entries) {
                  tb[k] = { scored: v.scored || 0, total: v.total || 0 };
                }
              }

              // Check if ai_feedback has REAL content (not just empty Mongoose defaults)
              const fb = a.ai_feedback;
              const hasFeedback =
                fb &&
                ((fb.overall_feedback &&
                  String(fb.overall_feedback).trim().length > 0) ||
                  (Array.isArray(fb.strengths) && fb.strengths.length > 0) ||
                  (Array.isArray(fb.weaknesses) && fb.weaknesses.length > 0) ||
                  (Array.isArray(fb.coach) && fb.coach.length > 0) ||
                  (Array.isArray(fb.study_tips) && fb.study_tips.length > 0) ||
                  (Array.isArray(fb.topic_wise_tips) &&
                    fb.topic_wise_tips.length > 0));

              // Map ai_feedback_meta.status → synthetic `ai` field for Dashboard compat
              const metaStatus = String(
                a.ai_feedback_meta?.status || "pending",
              ).toLowerCase();

              return {
                _id: a._id,
                response_id: a.attempt_id,
                quiz_name: a.quiz_name,
                score: {
                  points: a.score?.points || 0,
                  available: a.score?.available || 0,
                  percentage: a.score?.percentage || 0,
                  grade: a.score?.grade || "",
                  correct: a.score?.points || 0,
                  total: a.score?.available || 0,
                  pass: (a.score?.percentage || 0) >= 50,
                },
                date_submitted: a.submitted_at || a.createdAt,
                createdAt: a.createdAt,
                duration: a.duration_sec || 0,
                subject: a.subject,
                year_level: a.year_level,
                source: "native",
                topicBreakdown: tb,
                answers: a.answers || [],

                // Only include ai_feedback if it has real content
                ai_feedback: hasFeedback ? fb : null,
                ai_feedback_meta: a.ai_feedback_meta || null,
                performance_analysis: a.performance_analysis || null,

                // Synthetic `ai` field for Dashboard.jsx compatibility
                ai: {
                  status: metaStatus === "done" ? "done" : metaStatus,
                  message:
                    a.ai_feedback_meta?.status_message ||
                    (metaStatus === "done"
                      ? "Feedback ready"
                      : "Generating AI feedback..."),
                  error:
                    metaStatus === "error"
                      ? "AI feedback generation failed"
                      : null,
                  evaluated_at: a.ai_feedback_meta?.generated_at || null,
                },
              };
            });

    // ── 4. Tag legacy results ──
    const normalizedLegacy = legacyResults.map((r) => ({
      ...r,
      source: "flexiquiz",
    }));

    // ── 5. Merge and sort by date (newest first) ──
    const allResults = [...normalizedLegacy, ...normalizedNative].sort(
      (a, b) =>
        new Date(b.date_submitted || b.createdAt) -
        new Date(a.date_submitted || a.createdAt)
    );

    return res.json(allResults);
  } catch (err) {
    console.error("GET /children/:childId/results error:", err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/writing
// Returns all Writing docs linked to this child
// ────────────────────────────────────────────
router.get("/:childId/writing", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Scope check
    const parentId = req.user.parentId || req.user.parent_id;
    if (
      req.user.role === "parent" &&
      String(child.parent_id) !== String(parentId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (
      req.user.role === "child" &&
      String(child._id) !== String(req.user.childId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const docs = await Writing.find(matchQuery)
      .sort({ submitted_at: -1, date_created: -1, createdAt: -1 })
      .lean();

    return res.json(docs);
  } catch (err) {
    console.error("GET /children/:childId/writing error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch writing submissions" });
  }
});

module.exports = router;