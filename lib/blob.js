"use strict";

/**
 * Vercel Blob storage for payment receipts.
 *
 * Usage:
 * const { url, fileName } = await uploadReceipt(
 *   file.buffer,
 *   file.mimeType,
 *   bookingId
 * );
 */

const { put, del } = require("@vercel/blob");

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token || !token.trim()) {
    throw createError(
      "File storage is not configured. BLOB_READ_WRITE_TOKEN is missing.",
      500
    );
  }

  return token.trim();
}

function validateBookingId(bookingId) {
  const safeBookingId = String(bookingId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 100);

  if (!safeBookingId) {
    throw createError("Invalid booking ID.", 400);
  }

  return safeBookingId;
}

function validateFile(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError("No valid receipt file provided.", 400);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw createError(
      "File too large. Maximum allowed size is 8 MB.",
      400
    );
  }

  const extension = ALLOWED_TYPES[mimeType];

  if (!extension) {
    throw createError(
      "Invalid file type. Only JPG, PNG, WEBP, and PDF files are allowed.",
      400
    );
  }

  return extension;
}

/**
 * Upload receipt to Vercel Blob.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} bookingId
 *
 * @returns {Promise<{
 *   url: string,
 *   fileName: string,
 *   pathname: string
 * }>}
 */
async function uploadReceipt(buffer, mimeType, bookingId) {
  const token = getBlobToken();

  const extension = validateFile(buffer, mimeType);
  const safeBookingId = validateBookingId(bookingId);

  const timestamp = Date.now();
  const random = Math.random()
    .toString(36)
    .substring(2, 12);

  const fileName =
    `receipt-${timestamp}-${random}.${extension}`;

  const pathname =
    `payment-receipts/${safeBookingId}/${fileName}`;

  try {
    const result = await put(pathname, buffer, {
      access: "public",
      token,
      contentType: mimeType,
      addRandomSuffix: false,
    });

    if (!result || !result.url) {
      throw createError(
        "Receipt upload failed. No file URL was returned."
      );
    }

    return {
      url: result.url,
      fileName,
      pathname: result.pathname || pathname,
    };
  } catch (error) {
    console.error("[Vercel Blob upload error]", error);

    if (error.statusCode) {
      throw error;
    }

    throw createError(
      "Unable to upload receipt. Please try again.",
      500
    );
  }
}

/**
 * Delete a receipt from Vercel Blob.
 *
 * @param {string} url
 */
async function deleteReceipt(url) {
  if (!url) return;

  const token = getBlobToken();

  try {
    await del(url, {
      token,
    });
  } catch (error) {
    console.error("[Vercel Blob delete error]", error);

    if (error.statusCode) {
      throw error;
    }

    throw createError(
      "Unable to delete receipt file.",
      500
    );
  }
}

module.exports = {
  uploadReceipt,
  deleteReceipt,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
};
