/**
 * routes/aiImageRoutes.js  (v3 — MINIMAL PARAMS, OpenAI-future-proof)
 *
 * ═══════════════════════════════════════════════════════════════
 * AI image generation for quiz questions with cost tracking.
 *
 * CHANGES FROM v2:
 *   ✅ Removed response_format param (deprecated by OpenAI)
 *   ✅ Removed style param (deprecated by OpenAI 2026)
 *   ✅ Removed quality param (avoid future deprecation)
 *   ✅ Now handles BOTH b64 and URL responses from OpenAI
 *
 * Endpoints:
 *   POST /api/admin/generate-image           — generate (with budget check)
 *   GET  /api/admin/ai-image/usage           — current budget status
 *   GET  /api/admin/ai-image/usage/history   — recent generations
 *
 * Env vars:
 *   OPENAI_API_KEY                       — required
 *   OPENAI_IMAGE_MODEL                   — default "dall-e-3"
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";

const ALLOWED_SIZES = {
  "dall-e-3":    ["1024x1024", "1792x1024", "1024x1792"],
  "gpt-image-1": ["1024x1024", "1536x1024", "1024x1536", "auto"],
  "dall-e-2":    ["256x256", "512x512", "1024x1024"],
};

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
// OpenAI CALL — minimal, future-proof
// Only sends params that all OpenAI image models support today
// ═══════════════════════════════════════════════════════════════
async function callOpenAI({ prompt, size }) {
  console.log(`🔍 [DEBUG] OPENAI_IMAGE_MODEL = "${OPENAI_IMAGE_MODEL}"`);

  // Minimal body — only universally-supported params
  const body = {
    model:  OPENAI_IMAGE_MODEL,
    prompt: buildSafePrompt(prompt),
    n:      1,
    size,
  };

  console.log("🔍 [DEBUG] Sending to OpenAI:", JSON.stringify(body));

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("OpenAI raw error:", errText);
    let msg = `OpenAI returned ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      msg = parsed?.error?.message || msg;
    } catch (_) {}
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item) throw new Error("OpenAI did not return image data.");

  let b64 = item.b64_json;

  // If OpenAI returned a URL instead of base64, download and convert
  if (!b64 && item.url) {
    console.log("🔄 Downloading image from OpenAI URL...");
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Failed to download OpenAI image: ${imgRes.status}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    b64 = Buffer.from(arrayBuffer).toString("base64");
  }

  if (!b64) {
    throw new Error("OpenAI returned neither b64_json nor url.");
  }

  return { b64, revised: item.revised_prompt || null };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/generate-image
// ═══════════════════════════════════════════════════════════════
router.post("/generate-image", requireAdmin, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "AI image generation is not configured. Set OPENAI_API_KEY in .env.",
      });
    }

    await connectDB();

    const {
      prompt,
      size = "1024x1024",
      quality = "standard",  // kept only for cost calculation
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

    const allowedSizes = ALLOWED_SIZES[OPENAI_IMAGE_MODEL] || ALLOWED_SIZES["dall-e-3"];
    if (!allowedSizes.includes(size)) {
      return res.status(400).json({
        error: `Invalid size for ${OPENAI_IMAGE_MODEL}. Allowed: ${allowedSizes.join(", ")}`,
      });
    }

    // ── Calculate cost & check budget BEFORE calling OpenAI ──
    const estimatedCost = calculateCost({ model: OPENAI_IMAGE_MODEL, size, quality });
    const budgetCheck = await checkBudget(estimatedCost);

    if (!budgetCheck.ok) {
      await logUsage({
        admin: req.admin,
        prompt: trimmed, model: OPENAI_IMAGE_MODEL, size, quality,
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
      imageData = await callOpenAI({ prompt: trimmed, size });
    } catch (err) {
      await logUsage({
        admin: req.admin,
        prompt: trimmed, model: OPENAI_IMAGE_MODEL, size, quality,
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
      prompt: trimmed, model: OPENAI_IMAGE_MODEL, size, quality,
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
      model: OPENAI_IMAGE_MODEL,
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
        model:              OPENAI_IMAGE_MODEL,
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