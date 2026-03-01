/**
 * routes/uploadRoutes.js
 *
 * File upload API for admin — images and PDFs.
 * Stores files in /public/uploads/ and returns accessible URLs.
 *
 * Supports: .jpg, .jpeg, .png, .gif, .webp, .svg, .pdf
 * Max size: 10MB
 *
 * Mount in app.js:
 *   const uploadRoutes = require("./routes/uploadRoutes");
 *   app.use("/api/admin", uploadRoutes);
 *
 * Also add static serving in app.js:
 *   app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { requireAdmin } = require("../middleware/adminAuth");

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = new Date().toISOString().slice(0, 7); // e.g. "2026-03"
    const dir = path.join(uploadDir, subfolder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50);
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    cb(null, `${baseName}_${unique}${ext}`);
  },
});

// File filter — images + PDFs
const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg", "image/png", "image/gif",
    "image/webp", "image/svg+xml", "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images (jpg, png, gif, webp, svg) and PDFs are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ─── POST /upload — Single file upload ───
router.post("/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Max 10MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const subfolder = new Date().toISOString().slice(0, 7);
    const fileUrl = `/uploads/${subfolder}/${req.file.filename}`;

    res.json({
      ok: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  });
});

module.exports = router;