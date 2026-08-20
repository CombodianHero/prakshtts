/**
 * GET /api/admin/payments/receipt?id=PAYMENT_ID
 *
 * Securely streams a private Vercel Blob receipt to an authenticated admin.
 *
 * The browser never accesses the Vercel Blob URL directly.
 */

const { head } = require("@vercel/blob");
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const {
  sendJson,
  methodGuard,
  withErrorHandling,
} = require("../../../lib/apiUtils");

module.exports = withErrorHandling(
  requireAdmin(async (req, res) => {
    if (!methodGuard(req, res, "GET")) return;

    const paymentId = String(req.query?.id || "").trim();

    if (!paymentId) {
      return sendJson(res, 400, {
        error: "Payment ID is required.",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
      select: {
        id: true,
        receiptUrl: true,
        receiptFileName: true,
      },
    });

    if (!payment) {
      return sendJson(res, 404, {
        error: "Payment not found.",
      });
    }

    if (!payment.receiptUrl) {
      return sendJson(res, 404, {
        error: "No receipt was uploaded for this payment.",
      });
    }

    let blobInfo;

    try {
      blobInfo = await head(payment.receiptUrl, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (error) {
      console.error("[Receipt Blob lookup error]", error);

      return sendJson(res, 404, {
        error: "Receipt file was not found in storage.",
      });
    }

    let blobResponse;

    try {
      blobResponse = await fetch(blobInfo.downloadUrl || payment.receiptUrl, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        },
      });
    } catch (error) {
      console.error("[Receipt Blob fetch error]", error);

      throw Object.assign(
        new Error("Unable to retrieve the receipt file."),
        { statusCode: 500 }
      );
    }

    if (!blobResponse.ok) {
      console.error(
        "[Receipt Blob fetch failed]",
        blobResponse.status,
        blobResponse.statusText
      );

      return sendJson(res, 404, {
        error: "Receipt file could not be retrieved.",
      });
    }

    const contentType =
      blobResponse.headers.get("content-type") ||
      blobInfo.contentType ||
      "application/octet-stream";

    const fileName =
      payment.receiptFileName ||
      blobInfo.pathname?.split("/").pop() ||
      `receipt-${payment.id}`;

    const fileBuffer = Buffer.from(
      await blobResponse.arrayBuffer()
    );

    res.statusCode = 200;

    res.setHeader("Content-Type", contentType);

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(fileName).replace(/"/g, "")}"`
    );

    res.setHeader("Content-Length", fileBuffer.length);

    res.setHeader(
      "Cache-Control",
      "private, no-store, no-cache, must-revalidate"
    );

    return res.end(fileBuffer);
  })
);
