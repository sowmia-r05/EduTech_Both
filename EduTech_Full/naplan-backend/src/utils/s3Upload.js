/**
 * utils/s3Upload.js
 *
 * AWS S3 upload utility for the NAPLAN backend.
 * Replaces local disk storage — all uploaded files go directly to S3.
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION           (e.g. "ap-south-1")
 *   S3_BUCKET_NAME       (e.g. "naplan-uploads")
 *   S3_ENDPOINT_URL      (optional — for MinIO / custom S3-compatible storage)
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
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

if (process.env.S3_ENDPOINT_URL) {
  s3Config.endpoint        = process.env.S3_ENDPOINT_URL;
  s3Config.forcePathStyle  = true; // required for MinIO
}

const s3 = new S3Client(s3Config);
const BUCKET = process.env.S3_BUCKET_NAME;

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
  if (!process.env.AWS_ACCESS_KEY_ID) throw new Error("AWS_ACCESS_KEY_ID env var is not set");

  await verifyBucket();

  const ext      = path.extname(originalName).toLowerCase() || "";
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  const unique   = crypto.randomBytes(6).toString("hex");
  const sub      = folder || new Date().toISOString().slice(0, 7); // e.g. "2026-03"
  const key      = `uploads/${sub}/${baseName}_${unique}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
      // Public read — remove if you want private objects + signed URLs
    })
  );

  // Build public URL
  let url;
  if (process.env.S3_ENDPOINT_URL) {
    // MinIO / custom: endpoint + bucket + key
    const endpoint = process.env.S3_ENDPOINT_URL.replace(/\/$/, "");
    url = `${endpoint}/${BUCKET}/${key}`;
  } else {
    // Standard AWS S3 public URL
    url = `https://${BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
  }

  return { url, key, bucket: BUCKET, size: buffer.length };
}

module.exports = { uploadToS3, s3, BUCKET };