/**
 * routes/availableQuizzesRoute.js
 *
 * ═══════════════════════════════════════════════════════════════
 * Returns admin-uploaded quizzes for the child dashboard.
 * Replaces the hardcoded QUIZ_CATALOG in ChildDashboard.jsx.
 *
 * ✅ REWRITTEN: Now uses BUNDLE-BASED LOOKUP instead of entitled_quiz_ids.
 *    - Looks up child's entitled_bundle_ids → fetches bundles → gets quiz_ids
 *    - No more sync issues: when admin adds a quiz to a bundle, all children
 *      who own that bundle see it immediately.
 *    - entitled_quiz_ids on the child document is NO LONGER used.
 *
 * ✅ PATCHED: Added normalizeSubject() to map admin subjects
 *    ("Maths", "Conventions") to dashboard subjects ("Numeracy", "Language")
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
const QuizCatalog = require("../models/quizCatalog");

const router = express.Router();

// ═══════════════════════════════════════
// Subject normalization — maps admin/legacy subject names
// to the standard 4 NAPLAN subjects used by the child dashboard:
//   "Reading", "Writing", "Numeracy", "Language"
// ═══════════════════════════════════════
function normalizeSubject(subject) {
  if (!subject) return "Other";
  const s = subject.toLowerCase().trim();

  // Numeracy variants
  if (
    s === "maths" ||
    s === "math" ||
    s === "mathematics" ||
    s === "numeracy" ||
    s.includes("numeracy") ||
    s.includes("number and algebra") ||
    s.includes("number") ||
    s.includes("statistics") ||
    s.includes("probability") ||
    s.includes("algebra") ||
    s.includes("measurement") ||
    s.includes("geometry")
  ) {
    return "Numeracy";
  }

  // Language Conventions variants
  if (
    s === "conventions" ||
    s === "language conventions" ||
    s === "language_convention" ||
    s.includes("convention") ||
    s.includes("grammar") ||
    s.includes("punctuation") ||
    s.includes("spelling")
  ) {
    return "Language";
  }


  // Language (exact match — must come AFTER conventions check)
  if (s === "language") return "Language";

  // Reading
  if (s === "reading" || s.includes("reading")) return "Reading";

  // Writing
  if (s === "writing" || s.includes("writing")) return "Writing";

  return "Other";
}

// ═══════════════════════════════════════
// GET /api/children/:childId/available-quizzes
// Returns quizzes the child can take based on their bundles
// ═══════════════════════════════════════
router.get("/children/:childId/available-quizzes", verifyToken, requireAuth, async (req, res) => {
  try {
    await connectDB();
    const { childId: tokenChildId, parentId, role } = req.user;
    const childId = req.params.childId;

    // Auth check: child can see own quizzes, parent can see any of their children's
    const isChild = role === "child" && String(tokenChildId) === childId;
    const isParent = role === "parent";
    if (!isChild && !isParent) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Fetch child to get year_level and bundle entitlements
    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // If parent, verify this child belongs to them
    if (isParent && String(child.parent_id) !== String(parentId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const childStatus = child.status || "trial";
    const childBundleIds = child.entitled_bundle_ids || [];

    // ✅ FIX — guard against missing year level
    if (!child.year_level) {
      console.warn(
        `Child ${childId} has no year_level set — returning empty catalog`,
      );
      return res.json({ quizzes: [], child_status: childStatus });
    }

    const yearNum = Number(child.year_level);
    const yearStr = String(child.year_level);

    // ═══════════════════════════════════════════════════════
    // ✅ NEW: BUNDLE-BASED QUIZ LOOKUP
    // Instead of relying on entitled_quiz_ids (which goes out of sync),
    // we look up the child's bundles and get quiz_ids directly from them.
    // This means when admin adds a quiz to a bundle, it's INSTANTLY
    // visible to all children who own that bundle.
    // ═══════════════════════════════════════════════════════

    // Step 1: Get all quiz IDs from the child's purchased bundles
    let bundleQuizIds = [];
    if (childBundleIds.length > 0) {
      const bundles = await QuizCatalog.find({
        bundle_id: { $in: childBundleIds },
      }).lean();

      for (const bundle of bundles) {
        const ids =
          bundle.quiz_ids && bundle.quiz_ids.length > 0
            ? bundle.quiz_ids
            : bundle.flexiquiz_quiz_ids || [];
        bundleQuizIds.push(...ids);
      }
      // Deduplicate
      bundleQuizIds = [...new Set(bundleQuizIds)];
    }

    // Step 2: Build the quiz query
    let quizzes = [];

    if (childStatus === "trial") {
      // Trial children → only see trial quizzes for their year level

      quizzes = await Quiz.find({
        is_active: true,
        year_level: { $in: [yearNum, yearStr] },
        is_trial: true,
      })
        .sort({ subject: 1, quiz_name: 1 })
        .select(
          "quiz_id quiz_name subject year_level tier difficulty time_limit_minutes is_trial question_count total_points set_number attempts_enabled max_attempts",
        )
        .lean();
    } else {
      // Active children → see quizzes from their bundles + trial quizzes
      // Use $or to get: (quizzes in their bundles) OR (trial quizzes for their year level)
      const orConditions = [
        {
          is_active: true,
          year_level: { $in: [yearNum, yearStr] },
          is_trial: true,
        },
      ];

      if (bundleQuizIds.length > 0) {
        orConditions.push({ is_active: true, quiz_id: { $in: bundleQuizIds } });
      }

      quizzes = await Quiz.find({ $or: orConditions })
        .sort({ subject: 1, quiz_name: 1 })
        .select(
          "quiz_id quiz_name subject year_level tier difficulty time_limit_minutes is_trial question_count total_points set_number attempts_enabled max_attempts",
        )
        .lean();
    }

    // Step 3: Deduplicate (a quiz could match both trial AND bundle conditions)
    const seen = new Set();
    const uniqueQuizzes = quizzes.filter((q) => {
      if (seen.has(q.quiz_id)) return false;
      seen.add(q.quiz_id);
      return true;
    });

    // Step 4: Enrich with entitlement info
    const bundleQuizIdSet = new Set(bundleQuizIds);

    const enrichedQuizzes = uniqueQuizzes.map((q) => {
      // A child is entitled to a quiz if:
      //   1. It's a trial quiz (always accessible), OR
      //   2. The quiz_id is in one of their purchased bundles
      const isEntitled = q.is_trial === true || bundleQuizIdSet.has(q.quiz_id);

      return {
        quiz_id: q.quiz_id,
        quiz_name: q.quiz_name,
        subject: normalizeSubject(q.subject),
        year_level: q.year_level,
        tier: q.tier || "A",
        difficulty: q.difficulty || "Standard",
        time_limit_minutes: q.time_limit_minutes || null,
        is_trial: q.is_trial || false,
        question_count: q.question_count || 0,
        total_points: q.total_points || 0,
        set_number: q.set_number || 1,
        is_entitled: isEntitled,
        attempts_enabled: q.attempts_enabled || false, // ✅ now actually true
        max_attempts: q.max_attempts ?? null,
      };
    });

    // ✅ Also return child_status so frontend knows without extra API call
    res.json({
      quizzes: enrichedQuizzes,
      child_status: childStatus,
    });
  } catch (err) {
    console.error("Available quizzes error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;