/**
 * routes/uploadRoutes.js  (v2 — AWS S3 Storage)
 *
 * File upload API for admin — images, PDFs, audio, and video.
 * All files are stored in AWS S3 (or S3-compatible, e.g. MinIO).
 * Returns a public S3 URL instead of a local path.
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
 *   S3_BUCKET_NAME, S3_ENDPOINT_URL (optional, for MinIO)
 *
 * Supported files: images (.jpg/.png/.gif/.webp/.svg), PDF,
 *                  audio (.mp3/.wav/.ogg), video (.mp4/.webm/.mov)
 * Max size: 50MB
 *
 * Mount in app.js:
 *   const uploadRoutes = require("./routes/uploadRoutes");
 *   app.use("/api/admin", uploadRoutes);
 */

const express  = require("express");
const multer   = require("multer");
const { requireAdmin } = require("../middleware/adminAuth");
const { uploadToS3 }   = require("../utils/s3Upload");

const router = express.Router();

// ── Multer: keep files in memory (we stream to S3 directly) ──────────────────
const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg", "image/png", "image/gif",
    "image/webp", "image/svg+xml", "application/pdf",
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Allowed: images, PDFs, audio (mp3/wav/ogg), and video (mp4/webm/mov)"), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(), // buffer in RAM → stream to S3
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ─── POST /api/admin/upload ────────────────────────────────────────────────────
router.post("/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Max 50MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const result = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      return res.json({
        ok:           true,
        url:          result.url,       // ← full public S3 URL
        key:          result.key,       // ← S3 object key
        bucket:       result.bucket,
        filename:     req.file.originalname,
        originalName: req.file.originalname,
        mimetype:     req.file.mimetype,
        size:         result.size,
      });
    } catch (uploadErr) {
      console.error("S3 upload error:", uploadErr.message);
      return res.status(500).json({ error: `S3 upload failed: ${uploadErr.message}` });
    }
  });
});

module.exports = router;