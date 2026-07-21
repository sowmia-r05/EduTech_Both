/**
 * utils/s3Upload.js
 *
 * AWS S3 upload utility for the NAPLAN backend.
 * All uploaded files go directly to S3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 👉 FIX (UPL-PROXY-BYPASS)
 *
 *   PREVIOUSLY this returned an ABSOLUTE S3 URL:
 *       https://<bucket>.s3.<region>.amazonaws.com/uploads/2026-03/foo.png
 *
 *   The admin UI stored that string verbatim in question.image_url, so every
 *   image was served straight from S3 and NEVER passed through the hardened
 *   /uploads proxy in app.js. That meant the proxy's rate limiting, extension
 *   allow-list, X-Content-Type-Options: nosniff, and the locked-down CSP for
 *   SVG were all inert for real traffic. It also forced the bucket to be
 *   public-read at the policy level for anything to render.
 *
 *   NOW it returns a PROXY-RELATIVE path:
 *       /uploads/2026-03/foo.png
 *
 *   Both admin upload components already handle this — they do
 *   `data.url.startsWith("http") ? data.url : `${API}${data.url}``
 *   so a relative path is prefixed with the API base automatically.
 *
 *   Once every stored image_url is relative (see MIGRATION below), you can
 *   turn on S3 Block Public Access. The proxy reads with IAM credentials, so
 *   it keeps working; direct-to-bucket hotlinks stop working.
 *
 *   MIGRATION — existing rows still hold absolute URLs. Do NOT enable Block
 *   Public Access until you have rewritten them:
 *
 *     db.questions.updateMany(
 *       { image_url: /^https:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/uploads\// },
 *       [{ $set: { image_url: {
 *           $concat: ["/uploads/", { $arrayElemAt: [{ $split: ["$image_url", "/uploads/"] }, 1] }]
 *       } } }]
 *     );
 *
 *   Run it against a mongodump'd copy first, count the matches with find()
 *   before you run updateMany(), and check voice_url / video_url too.
 *
 *   Set S3_PUBLIC_URL_MODE=absolute to revert to the old behaviour without a
 *   code change if something breaks mid-migration.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION           (e.g. "ap-southeast-2")
 *   S3_BUCKET_NAME       (e.g. "naplan-uploads")
 *   S3_ENDPOINT_URL      (optional — for MinIO / custom S3-compatible storage)
 *   S3_PUBLIC_URL_MODE   (optional — "proxy" (default) | "absolute")
 *
 * Usage:
 *   const { uploadToS3 } = require("./utils/s3Upload");
 *   const result = await uploadToS3(fileBuffer, originalName, mimeType);
 *   // result = { url, key, bucket, size }
 */

const {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");
const path = require("path");
const crypto = require("crypto");

// ── Build S3 client from env ──────────────────────────────────────────────────
const s3Config = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// ✅ FIX — trim whitespace + validate before using
const S3_ENDPOINT = (process.env.S3_ENDPOINT_URL || "").trim();
if (S3_ENDPOINT) {
  s3Config.endpoint = S3_ENDPOINT;
  s3Config.forcePathStyle = true;
}

const s3 = new S3Client(s3Config);
const BUCKET = process.env.S3_BUCKET_NAME;

// "proxy" (default) routes reads through app.js's hardened /uploads handler.
// "absolute" restores the legacy direct-to-S3 URL — escape hatch only.
const URL_MODE = (process.env.S3_PUBLIC_URL_MODE || "proxy").trim().toLowerCase();

// ── Verify bucket access on first use ────────────────────────────────────────
let bucketVerified = false;
async function verifyBucket() {
  if (bucketVerified) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    bucketVerified = true;
  } catch (err) {
    throw new Error(
      `S3 bucket "${BUCKET}" not accessible. Check AWS credentials and bucket name. (${err.message})`
    );
  }
}

/**
 * Build the URL the frontend should store for a given S3 key.
 *
 * @param {string} key - Full S3 key, always prefixed "uploads/"
 * @returns {string}
 */
function publicUrlFor(key) {
  if (URL_MODE === "absolute") {
    const region = (process.env.AWS_REGION || "us-east-1").trim();
    if (S3_ENDPOINT) {
      const endpoint = S3_ENDPOINT.replace(/\/$/, "");
      return `${endpoint}/${BUCKET}/${key}`;
    }
    return `https://${BUCKET}.s3.${region}.amazonaws.com/${key}`;
  }

  // Proxy mode. The /uploads handler in app.js rebuilds the key as
  // "uploads/" + req.path, so strip the prefix here to avoid "uploads/uploads/".
  const rel = key.replace(/^uploads\//, "");
  return `/uploads/${rel}`;
}

/**
 * Upload a file buffer to S3.
 *
 * @param {Buffer} buffer        - File contents
 * @param {string} originalName  - Original filename (used to preserve extension)
 * @param {string} mimeType      - MIME type (e.g. "image/jpeg")
 * @param {string} [folder]      - Optional subfolder prefix (e.g. "2026-03")
 * @returns {{ url: string, key: string, bucket: string, size: number }}
 */
async function uploadToS3(buffer, originalName, mimeType, folder) {
  if (!BUCKET) throw new Error("S3_BUCKET_NAME env var is not set");
  if (!process.env.AWS_ACCESS_KEY_ID) {
    throw new Error("AWS_ACCESS_KEY_ID env var is not set");
  }

  await verifyBucket();

  const ext = path.extname(originalName).toLowerCase() || "";
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  const unique = crypto.randomBytes(6).toString("hex");
  const sub = folder || new Date().toISOString().slice(0, 7); // e.g. "2026-03"
  const key = `uploads/${sub}/${baseName}_${unique}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // No ACL is set deliberately. Reads go through the /uploads proxy, which
      // authenticates to S3 with IAM credentials. Do not add ACL: "public-read"
      // — that reintroduces the bypass this file exists to close.
    })
  );

  return {
    url: publicUrlFor(key),
    key,
    bucket: BUCKET,
    size: buffer.length,
  };
}

module.exports = { uploadToS3, publicUrlFor, s3, BUCKET };