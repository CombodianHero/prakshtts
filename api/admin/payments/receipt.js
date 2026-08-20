const { head } = require("@vercel/blob");
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const {
  sendJson,
  methodGuard,
  withErrorHandling
} = require("../../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  // Only logged-in admin can view receipts
  await requireAdmin(req, res);

  const paymentId = req.query.id;

  if (!paymentId) {
    return sendJson(res, 400, {
      error: "Payment ID is required."
    });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      receiptUrl: true,
      receiptFileName: true
    }
  });

  if (!payment) {
    return sendJson(res, 404, {
      error: "Payment not found."
    });
  }

  if (!payment.receiptUrl) {
    return sendJson(res, 404, {
      error: "No receipt was uploaded for this payment."
    });
  }

  const blob = await head(payment.receiptUrl, {
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  return sendJson(res, 200, {
    success: true,
    receipt: {
      url: payment.receiptUrl,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: blob.size,
      uploadedAt: blob.uploadedAt
    }
  });
});
