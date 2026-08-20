const { put } = require("@vercel/blob");
const crypto = require("crypto");

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw createError(
      "Vercel Blob is not configured. Missing BLOB_READ_WRITE_TOKEN.",
      500
    );
  }

  return token;
}

function getExtension(mimeType, originalFilename = "") {
  const mimeExtensions = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  };

  if (mimeExtensions[mimeType]) {
    return mimeExtensions[mimeType];
  }

  const match = originalFilename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : "bin";
}

async function uploadReceipt(buffer, mimeType, bookingId, originalFilename = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError("Receipt file is empty.", 400);
  }

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf"
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw createError(
      "Invalid receipt file. Only JPG, PNG, WEBP, and PDF are allowed.",
      400
    );
  }

  // 8 MB limit
  const MAX_FILE_SIZE = 8 * 1024 * 1024;

  if (buffer.length > MAX_FILE_SIZE) {
    throw createError("File too large. Maximum size is 8 MB.", 400);
  }

  const token = getBlobToken();
  const extension = getExtension(mimeType, originalFilename);

  const uniqueId = crypto.randomUUID();
  const fileName = `receipts/${bookingId}/${Date.now()}-${uniqueId}.${extension}`;

  try {
    const blob = await put(fileName, buffer, {
      access: "private",
      token,
      contentType: mimeType,
      addRandomSuffix: false
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      fileName,
      contentType: mimeType
    };
  } catch (error) {
    console.error("[Vercel Blob upload error]", error);

    throw createError(
      "Unable to upload receipt. Please try again.",
      500
    );
  }
}

module.exports = {
  uploadReceipt
};
