/**
 * routes/chatUsageRoutes.js
 *
 * Admin-only endpoints for AI tutor (chat) usage + cost.
 *
 *   GET /api/admin/chat-usage          — today / this month / all-time totals
 *   GET /api/admin/chat-usage/history  — recent calls
 *
 * Mount in server.js:
 *   app.use("/api/admin", require("./routes/chatUsageRoutes"));
 *
 * Place in: naplan-backend/src/routes/chatUsageRoutes.js
 */

const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const connectDB = require("../config/db");
const ChatUsage = require("../models/chatUsage");

const router = express.Router();

// gemini-2.5-flash-lite pricing (USD per token)
const PRICE_IN_PER_M  = parseFloat(process.env.CHAT_PRICE_IN_PER_M)  || 0.10;
const PRICE_OUT_PER_M = parseFloat(process.env.CHAT_PRICE_OUT_PER_M) || 0.40;

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function totals(since) {
  const match = since ? [{ $match: { created_at: { $gte: since } } }] : [];
  const r = await ChatUsage.aggregate([
    ...match,
    {
      $group: {
        _id: null,
        cost:   { $sum: "$cost_usd" },
        inTok:  { $sum: "$input_tokens" },
        outTok: { $sum: "$output_tokens" },
        count:  { $sum: 1 },
      },
    },
  ]);
  const x = r[0] || {};
  return {
    cost_usd:      x.cost   || 0,
    input_tokens:  x.inTok  || 0,
    output_tokens: x.outTok || 0,
    count:         x.count  || 0,
  };
}

// ── GET /api/admin/chat-usage ────────────────────────────────
router.get("/chat-usage", requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const [today, this_month, all_time] = await Promise.all([
      totals(startOfDay()),
      totals(startOfMonth()),
      totals(null),
    ]);
    return res.json({
      ok: true,
      today,
      this_month,
      all_time,
      model_pricing: { input_per_m: PRICE_IN_PER_M, output_per_m: PRICE_OUT_PER_M },
    });
  } catch (err) {
    console.error("chat-usage error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/chat-usage/history ────────────────────────
router.get("/chat-usage/history", requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const history = await ChatUsage.find({})
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
    return res.json({ ok: true, history, count: history.length });
  } catch (err) {
    console.error("chat-usage/history error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;