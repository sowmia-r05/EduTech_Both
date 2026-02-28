/**
 * routes/availableQuizzesRoute.js
 *
 * ═══════════════════════════════════════════════════════════════
 * NEW ENDPOINT: Returns admin-uploaded quizzes for the child dashboard.
 * Replaces the hardcoded QUIZ_CATALOG in ChildDashboard.jsx.
 * ═══════════════════════════════════════════════════════════════
 *
 * Mount in app.js:
 *   const availableQuizzesRoute = require("./routes/availableQuizzesRoute");
 *   app.use("/api", availableQuizzesRoute);
 */

const express = require("express");
const { verifyToken, requireAuth } = require("../middleware/auth");
const connectDB = require("../config/db");
const Quiz = require("../models/quiz");
const Child = require("../models/child");

const router = express.Router();

// ═══════════════════════════════════════
// GET /api/children/:childId/available-quizzes
// Returns all active quizzes the child can take
// Replaces the hardcoded QUIZ_CATALOG in ChildDashboard
// ═══════════════════════════════════════
router.get("/children/:childId/available-quizzes", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { childId: tokenChildId, parentId, role } = req.user;
    const childId = req.params.childId;

    // Auth check: child can see own quizzes, parent can see any of their children's
    const isChild = String(tokenChildId) === childId;
    const isParent = role === "parent";
    if (!isChild && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Fetch child to get year_level and entitlements
    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // If parent, verify this child belongs to them
    if (isParent && String(child.parent_id) !== String(parentId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Fetch all active quizzes for child's year level from MongoDB
    // These are the quizzes uploaded by admin via QuizUploader
    const quizzes = await Quiz.find({
      is_active: true,
      year_level: child.year_level,
    })
      .sort({ subject: 1, quiz_name: 1 })
      .select(
        "quiz_id quiz_name subject year_level tier difficulty time_limit_minutes is_trial question_count total_points set_number"
      )
      .lean();

    // Determine entitlements
    const childEntitledQuizIds = child.entitled_quiz_ids || [];
    const childStatus = child.status || "trial";

    const enrichedQuizzes = quizzes.map((q) => {
      // A child is entitled to a quiz if:
      //   1. It's a trial quiz (always accessible), OR
      //   2. The quiz_id is in their entitled_quiz_ids list, OR
      //   3. The child status is "active" and quiz matches their year level
      const isEntitled =
        q.is_trial === true ||
        childEntitledQuizIds.includes(q.quiz_id) ||
        (childStatus === "active" && q.year_level === child.year_level);

      return {
        quiz_id: q.quiz_id,
        quiz_name: q.quiz_name,
        subject: q.subject,
        year_level: q.year_level,
        tier: q.tier || "A",
        difficulty: q.difficulty || "Standard",
        time_limit_minutes: q.time_limit_minutes || null,
        is_trial: q.is_trial || false,
        question_count: q.question_count || 0,
        total_points: q.total_points || 0,
        set_number: q.set_number || 1,
        is_entitled: isEntitled,
      };
    });

    res.json({ quizzes: enrichedQuizzes });
  } catch (err) {
    console.error("Available quizzes error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
