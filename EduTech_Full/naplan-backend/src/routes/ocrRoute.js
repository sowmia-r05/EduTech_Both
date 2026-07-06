/**
 * routes/ocrRoute.js  (v4 — fixes false "no handwriting" rejection)
 *
 * ✅ Why Gemini?
 *   - You already have GEMINI_API_KEY in your .env for writing feedback
 *   - Gemini Flash is FREE (generous free tier, no billing needed)
 *   - Gemini Vision is excellent at handwriting OCR
 *   - No more 429 rate limit errors from OpenAI
 *
 * 👉 FIX (v4): neat, careful handwriting was being rejected as "printed text".
 *    The old prompt listed "printed text" as a NO_HANDWRITING trigger and told
 *    the model to expect messy Year-3 scrawl, so tidy writing (e.g. a formal-
 *    letter page) was misclassified and bounced with
 *    "This image doesn't appear to contain handwriting."
 *    Now: transcribe whenever there is readable text; only reject genuine
 *    non-text images (a selfie, an object, a blank page). Sentinel checks are
 *    also tolerant of trailing punctuation/quotes.
 *
 * POST /api/ocr/handwriting
 * Body: { base64: "...", mediaType: "image/jpeg" }
 * Returns: { text: "extracted handwriting text" }
 *
 * ENV needed (already exists): GEMINI_API_KEY in naplan-backend/.env
 */

const express = require("express");
const axios = require("axios");
const { verifyToken, requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(verifyToken, requireAuth);

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// Normalise a model reply down to letters/underscores so a sentinel like
// `NO_HANDWRITING.` or `"NON_ENGLISH"` is still detected.
function sentinel(text) {
  return String(text || "").replace(/[^A-Za-z_]/g, "").toUpperCase();
}

// ══════════════════════════════════════════════
// POST /api/ocr/handwriting
// ══════════════════════════════════════════════
router.post("/handwriting", async (req, res) => {
  try {
    const { base64, mediaType } = req.body;

    // ── Validate ──
    if (!base64) {
      return res.status(400).json({ error: "Missing base64 image data" });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mediaType)) {
      return res.status(400).json({
        error: "Invalid image type. Please use JPEG, PNG, or WebP.",
      });
    }

    // Size check (~20MB)
    if ((base64.length * 3) / 4 > 20 * 1024 * 1024) {
      return res.status(413).json({ error: "Image too large. Maximum size is 20MB." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY is not set in .env");
      return res.status(500).json({ error: "OCR service is not configured on the server." });
    }

    console.log(`🔍 OCR request using ${GEMINI_MODEL}...`);

    // ── Call Gemini Vision ──
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mediaType,
                  data: base64,
                },
              },
              {
                text: `You are a handwriting transcription assistant for a school student's written work.

STEP 1 — Decide whether there is readable text to transcribe:
- Respond with exactly NO_HANDWRITING only if the image contains NO readable text at all — for example a photo of a person, an animal, scenery, or an object, or a blank/unreadable page.
- IMPORTANT: neat, tidy, evenly-spaced handwriting is STILL handwriting. Do NOT reject careful or well-formed handwriting as "printed" — transcribe it.
- If the image contains readable text but it is clearly NOT English (e.g. Arabic, Chinese, Hindi, Tamil), respond with exactly NON_ENGLISH.
- If you are unsure, prefer to transcribe rather than reject.

STEP 2 — Transcribe the English text:
- Keep the original spelling and punctuation exactly as written (even if there are mistakes).
- Preserve line and paragraph breaks.
- Do NOT add corrections, comments, translations, headings, or explanations.
- Return ONLY the transcribed text, nothing else.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 45000,
      },
    );

    // ── Extract text from Gemini response ──
    const extractedText =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!extractedText) {
      return res.status(422).json({
        error:
          "No text could be extracted. Please take a clearer photo with good lighting.",
      });
    }

    const verdict = sentinel(extractedText);

    // ✅ Reject genuine non-text images (selfies, objects, scenery, blank page)
    if (verdict === "NO_HANDWRITING") {
      console.log("⚠️ OCR rejected — image does not contain readable text");
      return res.status(422).json({
        error:
          "This image doesn't appear to contain handwriting. Please upload a photo of your written work only.",
      });
    }

    // ✅ Reject clearly non-English handwriting
    if (verdict === "NON_ENGLISH") {
      console.log("⚠️ OCR rejected — non-English handwriting detected");
      return res.status(422).json({
        error:
          "Only English handwriting is accepted. Please upload a photo of your English writing.",
      });
    }

    console.log(
      `✅ OCR success — extracted ${extractedText.split(/\s+/).length} words`,
    );
    return res.json({ text: extractedText });
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const message =
        err.response.data?.error?.message || "Gemini API error";

      console.error(`❌ Gemini OCR error ${status}:`, message);

      if (status === 400) {
        return res.status(400).json({
          error: "Could not read the image. Please take a clearer photo with good lighting.",
        });
      }
      if (status === 429) {
        return res.status(429).json({
          error: "OCR service is busy. Please try again in a moment.",
        });
      }
      return res.status(500).json({ error: "OCR failed. Please try again." });
    }

    if (err.code === "ECONNABORTED") {
      return res.status(504).json({
        error: "OCR timed out. Please try with a smaller or clearer image.",
      });
    }

    console.error("❌ OCR route error:", err.message);
    return res.status(500).json({ error: "Failed to process image. Please try again." });
  }
});

module.exports = router;