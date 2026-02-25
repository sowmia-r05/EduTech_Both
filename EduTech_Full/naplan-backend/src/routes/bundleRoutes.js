const router = require("express").Router();
const QuizCatalog = require("../models/quizCatalog");

/**
 * GET /api/catalog/bundles
 * Public: list all active bundles with pricing.
 * Optionally filter by year_level: ?year_level=3
 */
router.get("/bundles", async (req, res) => {
  try {
    const query = { is_active: true };
    const yearLevel = Number(req.query.year_level);
    if ([3, 5, 7, 9].includes(yearLevel)) {
      query.year_level = yearLevel;
    }

    const bundles = await QuizCatalog.find(query)
      .select("-flexiquiz_quiz_ids -trial_quiz_ids") // don't expose quiz IDs publicly
      .sort({ year_level: 1, price_cents: 1 });

    return res.json({ bundles });
  } catch (err) {
    console.error("List bundles error:", err);
    return res.status(500).json({ error: "Failed to load bundles" });
  }
});

/**
 * GET /api/catalog/bundles/:bundleId
 * Public: get a single bundle by bundle_id.
 */
router.get("/bundles/:bundleId", async (req, res) => {
  try {
    const bundle = await QuizCatalog.findOne({
      bundle_id: req.params.bundleId,
      is_active: true,
    }).select("-flexiquiz_quiz_ids -trial_quiz_ids");

    if (!bundle) {
      return res.status(404).json({ error: "Bundle not found" });
    }

    return res.json({ bundle });
  } catch (err) {
    console.error("Get bundle error:", err);
    return res.status(500).json({ error: "Failed to load bundle" });
  }
});

module.exports = router;
