/**
 * routes/aiImageRoutes.js  (v4 — GEMINI / Nano Banana)
 *
 * ═══════════════════════════════════════════════════════════════
 * AI image generation for quiz questions with cost tracking.
 *
 * CHANGES FROM v3:
 *   ✅ Swapped OpenAI (DALL-E / gpt-image-1) for Google Gemini image
 *      generation (Nano Banana — gemini-3.1-flash-image).
 *   ✅ Single generateContent call; image returned as inline base64.
 *   ✅ Skips interim "thought" images from the 3.x thinking step.
 *
 * Endpoints:
 *   POST /api/admin/generate-image           — generate (with budget check)
 *   GET  /api/admin/ai-image/usage           — current budget status
 *   GET  /api/admin/ai-image/usage/history   — recent generations
 *
 * Env vars:
 *   GEMINI_API_KEY                       — required
 *   GEMINI_IMAGE_MODEL                   — default "gemini-3.1-flash-image"
 *                                          (cheaper: "gemini-2.5-flash-image")
 *   AI_IMAGE_MONTHLY_BUDGET_USD          — default 50
 *   AI_IMAGE_WARN_THRESHOLD_PCT          — default 80
 *   AI_IMAGE_BUDGET_ENABLED              — default true
 * ═══════════════════════════════════════════════════════════════
 */

const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const connectDB = require("../config/db");
const { uploadToS3 } = require("../utils/s3Upload");
const {
  calculateCost,
  getBudgetConfig,
  startOfMonth,
} = require("../utils/imageCost");
const AIImageUsage = require("../models/aiImageUsage");

const router = express.Router();

const GEMINI_API_KEY     = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

// ═══════════════════════════════════════════════════════════════
// USAGE HELPERS
// ═══════════════════════════════════════════════════════════════

async function getCurrentMonthUsage() {
  const since = startOfMonth();
  const agg = await AIImageUsage.aggregate([
    { $match: { created_at: { $gte: since }, status: "success" } },
    {
      $group: {
        _id: null,
        spent_usd: { $sum: "$cost_usd" },
        count:     { $sum: 1 },
      },
    },
  ]);
  return {
    spent_usd: agg[0]?.spent_usd || 0,
    count:     agg[0]?.count     || 0,
    since,
  };
}

async function checkBudget(estimatedCost) {
  const config = getBudgetConfig();
  if (!config.enabled) return { ok: true, config };

  const { spent_usd } = await getCurrentMonthUsage();
  const remaining = config.monthly_budget_usd - spent_usd;

  if (estimatedCost > remaining) {
    return {
      ok: false,
      reason: "monthly_budget_exceeded",
      spent_usd,
      remaining,
      monthly_budget_usd: config.monthly_budget_usd,
      estimated_cost: estimatedCost,
    };
  }

  return { ok: true, spent_usd, remaining, config };
}

async function logUsage(opts) {
  try {
    await AIImageUsage.create({
      admin_id:    opts.admin?._id || null,
      admin_email: opts.admin?.email || "unknown",
      prompt:      String(opts.prompt || "").slice(0, 1500),
      model:       opts.model,
      size:        opts.size,
      quality:     opts.quality,
      cost_usd:    opts.cost_usd,
      s3_url:      opts.s3_url,
      s3_key:      opts.s3_key,
      question_id: opts.question_id,
      quiz_id:     opts.quiz_id,
      status:      opts.status,
      error:       opts.error ? String(opts.error).slice(0, 500) : undefined,
    });
  } catch (err) {
    console.error("⚠️  Failed to log AI image usage:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROMPT HELPER
// ═══════════════════════════════════════════════════════════════

function buildSafePrompt(rawPrompt) {
  return (
    `Educational illustration for an Australian primary school student (Year 3-7). ` +
    `Child-friendly, clear, simple flat style with bright colours. ` +
    `No violence, no real people's faces, no copyrighted characters. ` +
    `Subject: ${rawPrompt.trim()}`
  );
}

// ═══════════════════════════════════════════════════════════════
// GEMINI CALL — Nano Banana image generation
// One generateContent call; image comes back as inline base64.
// ═══════════════════════════════════════════════════════════════
async function callGemini({ prompt }) {
  const url =
    `https://generativelanguage.googleapis.com/v1/models/` +
    `${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: buildSafePrompt(prompt) }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };

  console.log(`🔍 [DEBUG] GEMINI_IMAGE_MODEL = "${GEMINI_IMAGE_MODEL}"`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini raw error:", errText);
    let msg = `Gemini returned ${res.status}`;
    try {
      msg = JSON.parse(errText)?.error?.message || msg;
    } catch (_) {}
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];

  // Pick the real image part — skip interim "thought" images (3.x thinking step)
  const imgPart =
    parts.find((p) => p?.inlineData?.data && !p.thought) ||
    parts.find((p) => p?.inlineData?.data);

  if (!imgPart) {
    throw new Error("Gemini did not return image data.");
  }

  return { b64: imgPart.inlineData.data, revised: null };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/generate-image
// ═══════════════════════════════════════════════════════════════
router.post("/generate-image", requireAdmin, async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "AI image generation is not configured. Set GEMINI_API_KEY in .env.",
      });
    }

    await connectDB();

    const {
      prompt,
      size = "1024x1024",
      quality = "standard",  // kept only for logging compatibility
      question_id,
      quiz_id,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required." });
    }
    const trimmed = prompt.trim();
    if (trimmed.length < 4) {
      return res.status(400).json({ error: "Prompt is too short (min 4 characters)." });
    }
    if (trimmed.length > 1000) {
      return res.status(400).json({ error: "Prompt is too long (max 1000 characters)." });
    }

    // Gemini ignores OpenAI-style pixel sizes, so we accept whatever the UI sends.
    // `size` is kept only for logging/display.

    // ── Calculate cost & check budget BEFORE calling Gemini ──
    const estimatedCost = calculateCost({ model: GEMINI_IMAGE_MODEL, size, quality });
    const budgetCheck = await checkBudget(estimatedCost);

    if (!budgetCheck.ok) {
      await logUsage({
        admin: req.admin,
        prompt: trimmed, model: GEMINI_IMAGE_MODEL, size, quality,
        cost_usd: 0,
        status: "failed",
        error: `Budget exceeded: $${budgetCheck.spent_usd.toFixed(2)} of $${budgetCheck.monthly_budget_usd}`,
        question_id, quiz_id,
      });

      return res.status(402).json({
        error: "Monthly AI image budget exceeded.",
        budget: {
          spent_usd: budgetCheck.spent_usd,
          monthly_budget_usd: budgetCheck.monthly_budget_usd,
          remaining: budgetCheck.remaining,
          estimated_cost: budgetCheck.estimated_cost,
        },
      });
    }

    console.log(
      `🎨 [${req.admin?.email}] AI image: "${trimmed.slice(0, 50)}..." ` +
      `[${size}, $${estimatedCost.toFixed(3)}] ` +
      `(spent $${budgetCheck.spent_usd.toFixed(2)} this month)`
    );

    // ── Generate ──
    let imageData;
    try {
      imageData = await callGemini({ prompt: trimmed });
    } catch (err) {
      await logUsage({
        admin: req.admin,
        prompt: trimmed, model: GEMINI_IMAGE_MODEL, size, quality,
        cost_usd: 0, status: "failed", error: err.message,
        question_id, quiz_id,
      });
      throw err;
    }

    // ── Upload to S3 ──
    const buffer = Buffer.from(imageData.b64, "base64");
    const filename = `ai_${Date.now()}.png`;
    const uploaded = await uploadToS3(buffer, filename, "image/png", "ai-generated");

    // ── Log success ──
    await logUsage({
      admin: req.admin,
      prompt: trimmed, model: GEMINI_IMAGE_MODEL, size, quality,
      cost_usd: estimatedCost,
      s3_url: uploaded.url, s3_key: uploaded.key,
      status: "success",
      question_id, quiz_id,
    });

    // ── Refresh budget info for response ──
    const updatedUsage = await getCurrentMonthUsage();
    const config = getBudgetConfig();
    const warn = updatedUsage.spent_usd >= (config.monthly_budget_usd * config.warn_threshold_pct / 100);

    return res.json({
      ok: true,
      url: uploaded.url,
      key: uploaded.key,
      revised_prompt: imageData.revised,
      model: GEMINI_IMAGE_MODEL,
      cost_usd: estimatedCost,
      budget: {
        spent_usd:          updatedUsage.spent_usd,
        monthly_budget_usd: config.monthly_budget_usd,
        remaining:          config.monthly_budget_usd - updatedUsage.spent_usd,
        count:              updatedUsage.count,
        warn,
      },
    });
  } catch (err) {
    console.error("generate-image error:", err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Image generation failed.",
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/ai-image/usage
// ═══════════════════════════════════════════════════════════════
router.get("/ai-image/usage", requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const config = getBudgetConfig();
    const usage = await getCurrentMonthUsage();

    const remaining = Math.max(0, config.monthly_budget_usd - usage.spent_usd);
    const pct_used = config.monthly_budget_usd > 0
      ? Math.min(100, (usage.spent_usd / config.monthly_budget_usd) * 100)
      : 0;

    const allTimeAgg = await AIImageUsage.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total_spent: { $sum: "$cost_usd" }, total_count: { $sum: 1 } } },
    ]);

    const perAdminAgg = await AIImageUsage.aggregate([
      { $match: { created_at: { $gte: usage.since }, status: "success" } },
      { $group: { _id: "$admin_email", spent: { $sum: "$cost_usd" }, count: { $sum: 1 } } },
      { $sort: { spent: -1 } },
      { $limit: 10 },
    ]);

    return res.json({
      ok: true,
      this_month: {
        spent_usd:          usage.spent_usd,
        count:              usage.count,
        monthly_budget_usd: config.monthly_budget_usd,
        remaining_usd:      remaining,
        pct_used,
        warn:               pct_used >= config.warn_threshold_pct,
        blocked:            usage.spent_usd >= config.monthly_budget_usd,
        since:              usage.since,
      },
      all_time: {
        total_spent_usd: allTimeAgg[0]?.total_spent || 0,
        total_count:     allTimeAgg[0]?.total_count || 0,
      },
      by_admin: perAdminAgg.map((r) => ({
        admin_email: r._id,
        spent_usd:   r.spent,
        count:       r.count,
      })),
      config: {
        warn_threshold_pct: config.warn_threshold_pct,
        budget_enabled:     config.enabled,
        model:              GEMINI_IMAGE_MODEL,
      },
    });
  } catch (err) {
    console.error("ai-image/usage error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/ai-image/usage/history
// ═══════════════════════════════════════════════════════════════
router.get("/ai-image/usage/history", requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const filter = {};
    if (req.query.admin_email) filter.admin_email = req.query.admin_email;
    if (req.query.status) filter.status = req.query.status;

    const history = await AIImageUsage.find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .select("admin_email prompt model size quality cost_usd s3_url status error created_at")
      .lean();

    return res.json({ ok: true, history, count: history.length });
  } catch (err) {
    console.error("ai-image/usage/history error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;