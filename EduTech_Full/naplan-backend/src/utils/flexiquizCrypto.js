/**
 * src/utils/flexiquizCrypto.js
 *
 * AES-256-GCM encrypt / decrypt for FlexiQuiz auto-generated passwords.
 * Reads FLEXIQUIZ_PASSWORD_ENCRYPTION_KEY from env (hex-encoded 32-byte key).
 *
 * Stored format: iv:authTag:ciphertext (all hex)
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

function getKey() {
  const hex = process.env.FLEXIQUIZ_PASSWORD_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("FLEXIQUIZ_PASSWORD_ENCRYPTION_KEY env var is not set");
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `FLEXIQUIZ_PASSWORD_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${buf.length} bytes`
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} "iv:authTag:ciphertext" (hex encoded)
 */
function encryptPassword(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a previously encrypted string.
 * @param {string} stored - "iv:authTag:ciphertext" format
 * @returns {string} plaintext
 */
function decryptPassword(stored) {
  const key = getKey();
  const [ivHex, tagHex, cipherHex] = String(stored).split(":");

  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error("Invalid encrypted password format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

module.exports = { encryptPassword, decryptPassword };