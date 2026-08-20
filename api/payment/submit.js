/**
 * POST /api/payment/submit  (multipart/form-data)
 * Fields: token (secure payment token), transactionReference (optional), receipt (file)
 *
 * Real production receipt-upload flow — Part 15:
 *   file -> Vercel Blob -> Payment row (UNDER_VERIFICATION) -> timeline -> admin can now verify
 */
const Busboy = require("busboy");
const { prisma } = require("../../lib/db");
const { uploadReceipt } = require("../../lib/blob");
const { addTimelineEvent } = require("../../lib/timeline");
const { sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 8 * 1024 * 1024 } });
    const fields = {};
    let file = null;

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });
    busboy.on("file", (name, stream, info) => {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => reject(Object.assign(new Error("File too large. Maximum size is 8 MB."), { statusCode: 400 })));
      stream.on("end", () => {
        file = { buffer: Buffer.concat(chunks), mimeType: info.mimeType, filename: info.filename };
      });
    });
    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, file }));
    req.pipe(busboy);
  });
}

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return sendJson(res, 400, { error: "Expected multipart/form-data with a receipt file." });
  }

  const { fields, file } = await parseMultipart(req);
  const { token, transactionReference } = fields;

  if (!token) return sendJson(res, 400, { error: "Missing payment token." });
  if (!file) return sendJson(res, 400, { error: "Please attach a receipt file (JPG, PNG, WEBP, or PDF)." });

  const paymentRequest = await prisma.paymentRequest.findUnique({ where: { secureToken: token }, include: { booking: true } });
  if (!paymentRequest) return sendJson(res, 404, { error: "This payment link is invalid." });
  if (paymentRequest.status !== "ACTIVE") return sendJson(res, 410, { error: "This payment link is no longer active." });
  if (paymentRequest.expiresAt && new Date(paymentRequest.expiresAt) < new Date()) {
    await prisma.paymentRequest.update({ where: { id: paymentRequest.id }, data: { status: "EXPIRED" } });
    return sendJson(res, 410, { error: "This payment link has expired. Please contact us for a new one." });
  }

  // Idempotency guard (Part 45): if a payment for this exact request is
  // already under verification, don't create a duplicate on double-submit.
  const existingPending = await prisma.payment.findFirst({
    where: { paymentRequestId: paymentRequest.id, status: "UNDER_VERIFICATION" },
  });
  if (existingPending) {
    return sendJson(res, 200, {
      success: true,
      alreadySubmitted: true,
      message: "Your payment proof was already submitted and is under verification.",
    });
  }

  const { url, fileName } = await uploadReceipt(file.buffer, file.mimeType, paymentRequest.booking.bookingId);

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        bookingId: paymentRequest.bookingId,
        paymentStage: paymentRequest.paymentStage,
        paymentType: "MANUAL_UPI",
        amount: paymentRequest.amount,
        status: "UNDER_VERIFICATION",
        paymentRequestId: paymentRequest.id,
        transactionReference: transactionReference || null,
        receiptUrl: url,
        receiptFileName: fileName,
        submittedAt: new Date(),
      },
    });

    const overallStatus = paymentRequest.paymentStage === "ADVANCE" ? "ADVANCE_PAYMENT_UNDER_VERIFICATION" : "FINAL_PAYMENT_UNDER_VERIFICATION";
    await tx.booking.update({ where: { id: paymentRequest.bookingId }, data: { paymentStatus: overallStatus } });

    await addTimelineEvent(paymentRequest.bookingId, paymentRequest.paymentStage === "ADVANCE" ? "ADVANCE_PAYMENT_SUBMITTED" : "FINAL_PAYMENT_SUBMITTED", { tx });

    return created;
  });

  sendJson(res, 201, {
    success: true,
    message: "Your payment proof has been submitted and is now under verification.",
    paymentId: payment.id,
  });
});
