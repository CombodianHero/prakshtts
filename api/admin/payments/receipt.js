const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { getReceiptMetadata } = require("../../../lib/blob");

const {
  sendJson,
  methodGuard,
  withErrorHandling,
} = require("../../../lib/apiUtils");

module.exports = withErrorHandling(
  requireAdmin(async (req, res) => {
    if (!methodGuard(req, res, "GET")) return;

    const paymentId = String(
      req.query.paymentId || ""
    ).trim();

    if (!paymentId) {
      return sendJson(res, 400, {
        error: "paymentId is required.",
      });
    }

    const payment =
      await prisma.payment.findUnique({
        where: {
          id: paymentId,
        },
      });

    if (!payment) {
      return sendJson(res, 404, {
        error: "Payment not found.",
      });
    }

    if (!payment.receiptUrl) {
      return sendJson(res, 404, {
        error:
          "No receipt is attached to this payment.",
      });
    }

    const blob =
      await getReceiptMetadata(payment.receiptUrl);

    return sendJson(res, 200, {
      success: true,
      paymentId: payment.id,
      fileName:
        payment.receiptFileName ||
        "receipt",
      contentType:
        blob.contentType ||
        "application/octet-stream",

      // Depending on your installed @vercel/blob
      // version, Blob metadata can expose a URL.
      url: blob.url || null,

      pathname: payment.receiptUrl,
    });
  })
);
