const { put, del } = require("@vercel/blob");

function getToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    const error = new Error(
      "File storage is not configured (BLOB_READ_WRITE_TOKEN missing)."
    );
    error.statusCode = 500;
    throw error;
  }

  return token;
}

async function uploadReceipt(file, bookingId) {
  if (!file || !file.buffer) {
    const error = new Error("No valid receipt file provided.");
    error.statusCode = 400;
    throw error;
  }

  const safeName = (file.originalname || "receipt")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

  const pathname = `receipts/${bookingId}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file.buffer, {
    access: "public",
    token: getToken(),
    contentType: file.mimetype || "application/octet-stream",
    addRandomSuffix: false,
  });

  return blob.url;
}

async function deleteReceipt(url) {
  if (!url) return;

  await del(url, {
    token: getToken(),
  });
}

module.exports = {
  uploadReceipt,
  deleteReceipt,
};
