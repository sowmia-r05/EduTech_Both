/**
 * imageOriginalityCheck.js
 *
 * Image-based plagiarism check using Google Cloud Vision's Web Detection API.
 * (This is the API equivalent of Google Lens — Lens itself has no public API.)
 *
 * For each image attached to a question, we ask Google to:
 *   - find FULL matches    (verbatim copies hosted elsewhere on the web)
 *   - find PARTIAL matches (cropped/edited variants)
 *   - find PAGES that display the image
 *   - return WEB ENTITIES  (topical signals)
 *
 * If any match is hosted on a high-risk domain (ACARA, NAPLAN, known textbook
 * publishers, well-known competitor tutoring sites), the question is flagged.
 *
 * Place at: src/utils/imageOriginalityCheck.js
 *
 * Configure via .env:
 *   GCP_VISION_API_KEY=...                          (required)
 *   IMAGE_CHECK_HIGH_RISK_DOMAINS=                  (optional, comma-separated;
 *                                                    falls back to DEFAULT_HIGH_RISK)
 *
 * Pricing (Cloud Vision, as of writing):
 *   Web Detection: first 1k/month free, then ~$1.50 per 1000 calls.
 *   For ~5000 questions where 30% have images, one-time cost is ~$2.25.
 *
 * Usage:
 *   const { checkImageOriginality } = require("./imageOriginalityCheck");
 *   const result = await checkImageOriginality("https://cdn.you.com/q123.png");
 *   // result = {
 *   //   status: "clean" | "review" | "blocked_full_match" | "blocked_high_risk_page",
 *   //   full_matches, partial_matches, pages, entities, best_guess,
 *   // }
 */

// ═══════════════════════════════════════════════════════════════
// HIGH-RISK DOMAINS — questions matching these are auto-flagged
// ═══════════════════════════════════════════════════════════════

const DEFAULT_HIGH_RISK = [
  // ACARA / NAPLAN official
  "nap.edu.au",
  "acara.edu.au",
  "australiancurriculum.edu.au",

  // Major Australian textbook / practice publishers
  "pascalpress.com.au",     // Excel
  "cambridge.org",
  "oup.com.au",             // Oxford University Press
  "macmillan.com.au",
  "hawkerbrownlow.com",
  "fivesenseseducation.com.au",

  // Well-known tutoring competitors who publish practice content
  "matrix.edu.au",
  "cluey.com.au",
  "studiosity.com",
  "mathletics.com",
  "edrolo.com.au",
  "thelearninglab.com.au",
];

function getHighRiskDomains() {
  const fromEnv = (process.env.IMAGE_CHECK_HIGH_RISK_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_HIGH_RISK;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isHighRisk(url, riskList) {
  const host = domainOf(url);
  if (!host) return false;
  return riskList.some((d) => host === d || host.endsWith(`.${d}`));
}

// ═══════════════════════════════════════════════════════════════
// CLOUD VISION REQUEST
// ═══════════════════════════════════════════════════════════════

async function callWebDetection(imageUrl) {
  const apiKey = process.env.GCP_VISION_API_KEY;
  if (!apiKey) throw new Error("GCP_VISION_API_KEY not set");

  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  // We accept both http(s) URLs and gs:// Cloud Storage URIs.
  // For private CDNs, fetch the bytes ourselves and send base64 instead.
  const isHttp = /^https?:\/\//i.test(imageUrl);
  const isGcs  = /^gs:\/\//i.test(imageUrl);

  let imagePart;
  if (isHttp || isGcs) {
    imagePart = { source: { imageUri: imageUrl } };
  } else {
    // Treat as a local path or already-base64 string — caller's responsibility
    throw new Error(`Image URL must be http(s) or gs://, got: ${imageUrl}`);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: imagePart,
        features: [{ type: "WEB_DETECTION", maxResults: 20 }],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloud Vision ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const ann = data?.responses?.[0]?.webDetection || {};
  return {
    full_matches:    ann.fullMatchingImages    || [],
    partial_matches: ann.partialMatchingImages || [],
    pages:           ann.pagesWithMatchingImages || [],
    entities:        ann.webEntities || [],
    best_guess:      (ann.bestGuessLabels || []).map((l) => l.label),
  };
}

// ═══════════════════════════════════════════════════════════════
// STATUS DECISION
// ═══════════════════════════════════════════════════════════════

function decideStatus(detection, riskList) {
  // Any FULL match → block. A full match means an identical (or
  // resized) copy of this image is hosted on the web. For an
  // AI-generated question this should never happen.
  if (detection.full_matches.length > 0) {
    const onHighRiskFull = detection.full_matches.find((m) => isHighRisk(m.url, riskList));
    return {
      status: onHighRiskFull ? "blocked_full_match_high_risk" : "blocked_full_match",
      reason: onHighRiskFull
        ? `Image is a verbatim copy of one hosted at ${domainOf(onHighRiskFull.url)}`
        : `Image has ${detection.full_matches.length} verbatim copies on the web`,
    };
  }

  // Any high-risk PAGE hosting the image → block. The image itself
  // might be slightly different, but it appears on a copyrighted source.
  const highRiskPage = (detection.pages || []).find((p) => isHighRisk(p.url, riskList));
  if (highRiskPage) {
    return {
      status: "blocked_high_risk_page",
      reason: `Image appears on ${domainOf(highRiskPage.url)} — known copyrighted source`,
    };
  }

  // Partial matches on ANY domain → review (not blocked, but tutor should check)
  if (detection.partial_matches.length > 0) {
    return {
      status: "review_partial_match",
      reason: `${detection.partial_matches.length} partial match(es) found on the web`,
    };
  }

  // Pages without high-risk → just informational, still clean
  return { status: "clean", reason: null };
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Check a single image for web-based plagiarism.
 *
 * @param {string} imageUrl - public http(s) URL or gs:// path to the image
 * @returns {Promise<object>} structured result with status + matches
 */
async function checkImageOriginality(imageUrl) {
  if (!imageUrl) {
    return { status: "skipped", reason: "no image" };
  }

  const riskList = getHighRiskDomains();

  let detection;
  try {
    detection = await callWebDetection(imageUrl);
  } catch (err) {
    console.error("imageOriginalityCheck failed:", err.message);
    return {
      status: "error",
      reason: err.message,
      full_matches: [],
      partial_matches: [],
      pages: [],
      entities: [],
      best_guess: [],
    };
  }

  const decision = decideStatus(detection, riskList);

  return {
    status: decision.status,
    reason: decision.reason,
    image_url: imageUrl,
    full_matches:    detection.full_matches.slice(0, 10).map((m) => ({
      url: m.url,
      domain: domainOf(m.url),
      score: m.score ?? null,
      high_risk: isHighRisk(m.url, riskList),
    })),
    partial_matches: detection.partial_matches.slice(0, 10).map((m) => ({
      url: m.url,
      domain: domainOf(m.url),
      score: m.score ?? null,
      high_risk: isHighRisk(m.url, riskList),
    })),
    pages: detection.pages.slice(0, 10).map((p) => ({
      url: p.url,
      domain: domainOf(p.url),
      title: p.pageTitle || null,
      high_risk: isHighRisk(p.url, riskList),
    })),
    entities: detection.entities.slice(0, 10).map((e) => ({
      description: e.description,
      score: e.score ?? null,
    })),
    best_guess: detection.best_guess,
    checked_at: new Date(),
  };
}

/**
 * Check multiple images (for questions that have several attachments).
 * Returns the WORST status across all images so a single bad image flags
 * the whole question.
 */
async function checkImagesForQuestion(imageUrls = []) {
  const valid = imageUrls.filter(Boolean);
  if (valid.length === 0) return { status: "skipped", per_image: [] };

  const perImage = [];
  for (const url of valid) {
    perImage.push(await checkImageOriginality(url));
  }

  // Severity ranking — lowest index = worst
  const severity = [
    "blocked_full_match_high_risk",
    "blocked_full_match",
    "blocked_high_risk_page",
    "review_partial_match",
    "error",
    "clean",
    "skipped",
  ];
  const worstStatus = perImage
    .map((r) => r.status)
    .sort((a, b) => severity.indexOf(a) - severity.indexOf(b))[0];

  return {
    status: worstStatus,
    per_image: perImage,
    checked_at: new Date(),
  };
}

module.exports = {
  checkImageOriginality,
  checkImagesForQuestion,
  DEFAULT_HIGH_RISK,
};