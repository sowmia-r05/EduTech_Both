/**
 * src/routes/catalogRoutes.js
 *
 * GET  /api/catalog/bundles           → List all active bundles (public)
 * GET  /api/catalog/bundles/:yearLevel → Bundles for a specific year level
 * POST /api/catalog/sync              → Trigger FlexiQuiz sync (admin only)
 *
 * These endpoints return REAL quiz counts from the database,
 * not hardcoded values from the frontend catalog.
 */

const router = require("express").Router();
const QuizCatalog = require("../models/quizCatalog");

// ────────────────────────────────────────────
// GET /api/catalog/bundles
// Public — returns all active bundles with real quiz counts
// ────────────────────────────────────────────
router.get("/bundles", async (req, res) => {
  try {
    const bundles = await QuizCatalog.find({ is_active: true })
      .sort({ year_level: 1, tier: 1 })
      .select("-flexiquiz_quiz_ids -flexiquiz_quiz_ids_with_lower -flexiquiz_group_id")
      .lean();

    // Add a user-friendly included_tests count
    const enriched = bundles.map((b) => ({
      ...b,
      // Show the "with_lower" count since that's what the user actually GETS
      included_tests: b.quiz_count_with_lower || b.quiz_count || 0,
    }));

    return res.json(enriched);
  } catch (err) {
    console.error("GET /catalog/bundles error:", err);
    return res.status(500).json({ error: "Failed to fetch bundles" });
  }
});

// ────────────────────────────────────────────
// GET /api/catalog/bundles/:yearLevel
// Public — returns bundles for a specific year
// ────────────────────────────────────────────
router.get("/bundles/:yearLevel", async (req, res) => {
  try {
    const yearLevel = parseInt(req.params.yearLevel, 10);
    if (![3, 5, 7, 9].includes(yearLevel)) {
      return res.status(400).json({ error: "Invalid year level. Must be 3, 5, 7, or 9" });
    }

    const bundles = await QuizCatalog.find({
      year_level: yearLevel,
      is_active: true,
    })
      .sort({ tier: 1 })
      .select("-flexiquiz_quiz_ids -flexiquiz_quiz_ids_with_lower -flexiquiz_group_id")
      .lean();

    const enriched = bundles.map((b) => ({
      ...b,
      included_tests: b.quiz_count_with_lower || b.quiz_count || 0,
    }));

    return res.json(enriched);
  } catch (err) {
    console.error("GET /catalog/bundles/:yearLevel error:", err);
    return res.status(500).json({ error: "Failed to fetch bundles" });
  }
});

module.exports = router;
