/**
 * POST /api/payment/verify-gateway
 * Body: { token, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Verifies the HMAC signature server-side (never trusts "payment
 * successful" from the browser alone — Part 46), then records the
 * payment as APPROVED immediately since a valid signature IS
 * cryptographic proof of payment (unlike a manual UPI screenshot,
 * which still needs human verification).
 */
const crypto = require("crypto");
const { prisma } = require("../../lib/db");
const { recalculateBookingFinancials } = require("../../lib/calc");
const { addTimelineEvent } = require("../../lib/timeline");
const { sendAndLogEmail } = require("../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return sendJson(res, 501, { error: "Online gateway payment is not configured." });
  }

  const { token, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await readJsonBody(req);
  if (!token || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return sendJson(res, 400, { error: "Missing payment verification fields." });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return sendJson(res, 400, { error: "Payment verification failed. If money was deducted, please contact us with your payment ID." });
  }

  const paymentRequest = await prisma.paymentRequest.findUnique({ where: { secureToken: token }, include: { booking: true } });
  if (!paymentRequest) return sendJson(res, 404, { error: "This payment link is invalid." });
  if (paymentRequest.status === "PAID") return sendJson(res, 200, { success: true, alreadyPaid: true });

  const booking = paymentRequest.booking;
  const isAdvance = paymentRequest.paymentStage === "ADVANCE";

  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        bookingId: booking.id,
        paymentStage: paymentRequest.paymentStage,
        paymentType: "GATEWAY",
        amount: paymentRequest.amount,
        status: "APPROVED",
        paymentRequestId: paymentRequest.id,
        transactionReference: razorpay_payment_id,
        submittedAt: new Date(),
        verifiedAt: new Date(),
      },
    });
    await tx.paymentRequest.update({ where: { id: paymentRequest.id }, data: { status: "PAID", paidAt: new Date() } });

    const recalced = await recalculateBookingFinancials(booking.id, tx);

    let newBookingStatus = booking.bookingStatus;
    let newPaymentStatus;
    if (isAdvance) {
      newPaymentStatus = "ADVANCE_PAID";
      newBookingStatus = "CONFIRMED";
      await addTimelineEvent(booking.id, "ADVANCE_PAYMENT_APPROVED", { tx });
    } else {
      newPaymentStatus = Number(recalced.outstandingBalance) <= 0 ? "FULLY_PAID" : "FINAL_PAYMENT_REQUIRED";
      await addTimelineEvent(booking.id, "FINAL_PAYMENT_APPROVED", { tx });
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { bookingStatus: newBookingStatus, paymentStatus: newPaymentStatus, confirmedAt: isAdvance ? new Date() : booking.confirmedAt },
    });
    return updated;
  });

  await sendAndLogEmail("payment_approved", booking.customerEmail, { booking: result }, booking.id);

  sendJson(res, 200, { success: true, booking: result });
});
