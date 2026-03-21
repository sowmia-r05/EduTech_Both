/**
 * routes/ocrRoute.js  (v3 — Uses GEMINI instead of OpenAI)
 *
 * ✅ Why Gemini?
 *   - You already have GEMINI_API_KEY in your .env for writing feedback
 *   - Gemini Flash is FREE (generous free tier, no billing needed)
 *   - Gemini Vision is excellent at handwriting OCR
 *   - No more 429 rate limit errors from OpenAI
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
                text: `You are a handwriting transcription assistant for an Australian primary school student (Year 3, approx. 8-9 years old).

Please transcribe ALL the handwritten text in this image exactly as written.
- Keep the original spelling and punctuation (even if there are mistakes)
- Preserve paragraph breaks
- Do NOT add corrections, comments, or explanations
- Return ONLY the transcribed text, nothing else`,
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
      }
    );

    // ── Extract text from Gemini response ──
    const extractedText =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!extractedText) {
      return res.status(500).json({
        error: "No text could be extracted. Please take a clearer photo with good lighting.",
      });
    }

    console.log(`✅ OCR success — extracted ${extractedText.split(/\s+/).length} words`);
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