/**
 * lib/blob.js
 *
 * Private Vercel Blob storage for payment receipts.
 *
 * IMPORTANT:
 * - Do NOT use access: "public"
 * - Store the blob pathname in the database
 * - Admin receipt viewing should happen through an authenticated API route
 */

const { put, head, del } = require("@vercel/blob");

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getBlobToken() {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();

  if (!token) {
    throw createError(
      "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN to environment variables.",
      500
    );
  }

  return token;
}

function sanitizeFileName(fileName) {
  const original = String(fileName || "receipt")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

  return original.slice(0, 120) || "receipt";
}

function getExtension(mimeType, fileName) {
  const byMime = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  };

  if (byMime[mimeType]) return byMime[mimeType];

  const match = String(fileName || "").match(/\.[a-zA-Z0-9]{1,10}$/);
  return match ? match[0].toLowerCase() : "";
}

function validateReceipt(mimeType, buffer) {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (!allowedMimeTypes.includes(mimeType)) {
    throw createError(
      "Invalid receipt file. Only JPG, PNG, WEBP, and PDF are allowed.",
      400
    );
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError("Receipt file is empty.", 400);
  }

  const maxBytes = 8 * 1024 * 1024;

  if (buffer.length > maxBytes) {
    throw createError("Receipt file is too large. Maximum size is 8 MB.", 400);
  }
}

async function uploadReceipt(
  buffer,
  mimeType,
  bookingId,
  originalFileName = "receipt"
) {
  try {
    const token = getBlobToken();

    validateReceipt(mimeType, buffer);

    const safeBookingId = String(bookingId || "unknown")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const safeOriginalName = sanitizeFileName(originalFileName);
    const extension = getExtension(mimeType, safeOriginalName);

    const uniqueName =
      `receipts/${safeBookingId}/` +
      `${Date.now()}-${crypto.randomUUID()}${extension}`;

    const blob = await put(uniqueName, buffer, {
      access: "private",
      token,
      contentType: mimeType,
      addRandomSuffix: false,
    });

    return {
      pathname: blob.pathname,
      url: blob.url,
      fileName: safeOriginalName,
      contentType: mimeType,
      size: buffer.length,
    };
  } catch (error) {
    console.error("[Vercel Blob upload error]", error);

    if (error.statusCode) throw error;

    throw createError("Unable to upload receipt. Please try again.", 500);
  }
}

async function getReceiptMetadata(pathname) {
  if (!pathname) {
    throw createError("Receipt pathname is missing.", 404);
  }

  try {
    const token = getBlobToken();

    return await head(pathname, {
      token,
    });
  } catch (error) {
    console.error("[Vercel Blob head error]", error);

    throw createError("Receipt file was not found.", 404);
  }
}

async function deleteReceipt(pathname) {
  if (!pathname) return;

  try {
    const token = getBlobToken();

    await del(pathname, {
      token,
    });
  } catch (error) {
    console.error("[Vercel Blob delete error]", error);
  }
}

module.exports = {
  uploadReceipt,
  getReceiptMetadata,
  deleteReceipt,
};
