/**
 * lib/blob.js
 * Real file storage for payment receipts — Part 15/39.
 *
 * Koyeb has no built-in blob storage (unlike Vercel), so this uses the
 * standard S3 API instead, which every major object storage provider
 * speaks: AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, or a
 * self-hosted MinIO instance. Configure via S3_* env vars — see
 * .env.example. Nothing here is Koyeb- or AWS-specific.
 */
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw Object.assign(new Error("File storage is not configured (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY missing)."), { statusCode: 500 });
  }
  _client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined, // omit for real AWS S3; required for R2/B2/MinIO
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} bookingId - human-readable booking id, used in the storage key only
 * @returns {Promise<{url: string, fileName: string}>}
 */
async function uploadReceipt(buffer, mimeType, bookingId) {
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) {
    throw Object.assign(new Error("Unsupported file type. Please upload JPG, PNG, WEBP, or PDF."), { statusCode: 400 });
  }
  if (!buffer || buffer.length === 0) {
    throw Object.assign(new Error("Empty file upload."), { statusCode: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error("File too large. Maximum size is 8 MB."), { statusCode: 400 });
  }

  const client = getClient();
  const key = `receipts/${bookingId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Public-read keeps things simple for now (receipt URLs are long,
      // random, and never listed publicly). For stricter access control,
      // drop this ACL and generate presigned GET URLs per admin request
      // instead — see @aws-sdk/s3-request-presigner.
      ACL: process.env.S3_PUBLIC_READ === "false" ? undefined : "public-read",
    })
  );

  const url = process.env.S3_PUBLIC_URL_BASE
    ? `${process.env.S3_PUBLIC_URL_BASE.replace(/\/$/, "")}/${key}`
    : `${(process.env.S3_ENDPOINT || `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com`).replace(/\/$/, "")}/${process.env.S3_ENDPOINT ? process.env.S3_BUCKET + "/" : ""}${key}`;

  return { url, fileName: key.split("/").pop() };
}

module.exports = { uploadReceipt, ALLOWED_TYPES, MAX_BYTES };
