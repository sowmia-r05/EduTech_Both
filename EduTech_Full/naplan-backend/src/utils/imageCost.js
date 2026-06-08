/**
 * utils/imageCost.js
 *
 * Pricing table for OpenAI image generation + helper to compute
 * cost-per-call. Prices are in USD per image.
 *
 * Update this file whenever OpenAI changes pricing.
 * Reference: https://openai.com/api/pricing/
 *
 * Place in: naplan-backend/src/utils/imageCost.js
 */

// ─── Pricing table (USD per image) ─────────────────────────────
const PRICING = {
  // DALL-E 3 — quality + size based
  "dall-e-3": {
    standard: {
      "1024x1024": 0.040,
      "1792x1024": 0.080,
      "1024x1792": 0.080,
    },
    hd: {
      "1024x1024": 0.080,
      "1792x1024": 0.120,
      "1024x1792": 0.120,
    },
  },

  // DALL-E 2 — size based only
  "dall-e-2": {
    standard: {
      "256x256":   0.016,
      "512x512":   0.018,
      "1024x1024": 0.020,
    },
  },

  // gpt-image-1 — newer model, quality-tier based
  "gpt-image-1": {
    low: {
      "1024x1024": 0.011,
      "1024x1536": 0.016,
      "1536x1024": 0.016,
    },
    medium: {
      "1024x1024": 0.042,
      "1024x1536": 0.063,
      "1536x1024": 0.063,
    },
    high: {
      "1024x1024": 0.167,
      "1024x1536": 0.250,
      "1536x1024": 0.250,
    },
  },
};

/**
 * Calculate the USD cost for a single image generation.
 *
 * @param {object} args
 * @param {string} args.model    — "dall-e-3" | "dall-e-2" | "gpt-image-1"
 * @param {string} args.size     — "1024x1024" | "1792x1024" | etc
 * @param {string} args.quality  — "standard" | "hd" | "low" | "medium" | "high"
 * @returns {number} cost in USD (0 if unknown combination)
 */
function calculateCost({ model, size, quality = "standard" }) {
  const modelPricing = PRICING[model];
  if (!modelPricing) {
    console.warn(`[imageCost] Unknown model "${model}" — returning 0`);
    return 0;
  }

  // Fallback chain: requested quality → standard → medium → first available
  const qualityTier =
    modelPricing[quality] ||
    modelPricing.standard ||
    modelPricing.medium ||
    modelPricing[Object.keys(modelPricing)[0]];

  if (!qualityTier) {
    console.warn(`[imageCost] No pricing tier for ${model}/${quality} — returning 0`);
    return 0;
  }

  const cost = qualityTier[size];
  if (cost == null) {
    console.warn(`[imageCost] Unknown size "${size}" for ${model}/${quality} — returning 0`);
    return 0;
  }

  return cost;
}

/**
 * Get budget configuration from env vars.
 * MONTHLY budget resets implicitly at the start of each calendar month.
 */
function getBudgetConfig() {
  return {
    monthly_budget_usd:
      parseFloat(process.env.AI_IMAGE_MONTHLY_BUDGET_USD) || 50,
    warn_threshold_pct:
      parseFloat(process.env.AI_IMAGE_WARN_THRESHOLD_PCT) || 80,
    enabled:
      process.env.AI_IMAGE_BUDGET_ENABLED !== "false", // default true
  };
}

/**
 * Compute the start-of-current-month Date in UTC.
 * Used for the monthly budget reset.
 */
function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

module.exports = {
  PRICING,
  calculateCost,
  getBudgetConfig,
  startOfMonth,
};