/**
 * POST /api/admin/payments/verify
 * Body: { paymentId, decision: "APPROVE"|"REJECT", rejectionReason? }
 * Part 16 — the transaction that keeps payment + booking status +
 * financials + timeline + audit log all consistent (Part 44).
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { recalculateBookingFinancials } = require("../../../lib/calc");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { paymentId, decision, rejectionReason } = await readJsonBody(req);
  if (!paymentId || !["APPROVE", "REJECT"].includes(decision)) {
    return sendJson(res, 400, { error: "paymentId and a decision of APPROVE or REJECT are required." });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
  if (!payment) return sendJson(res, 404, { error: "Payment not found." });
  if (payment.status !== "UNDER_VERIFICATION") {
    return sendJson(res, 409, { error: `This payment is already ${payment.status}.` });
  }

  const booking = payment.booking;
  const isAdvance = payment.paymentStage === "ADVANCE";

  const result = await prisma.$transaction(async (tx) => {
    let updatedPayment;
    let newBookingStatus = booking.bookingStatus;
    let newPaymentStatus = booking.paymentStatus;

    if (decision === "APPROVE") {
      updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: "APPROVED", verifiedAt: new Date(), verifiedByAdminId: session.adminId },
      });
      if (payment.paymentRequestId) {
        await tx.paymentRequest.update({ where: { id: payment.paymentRequestId }, data: { status: "PAID", paidAt: new Date() } });
      }

      const recalced = await recalculateBookingFinancials(booking.id, tx);

      if (isAdvance) {
        newPaymentStatus = "ADVANCE_PAID";
        newBookingStatus = "CONFIRMED";
        await tx.booking.update({ where: { id: booking.id }, data: { bookingStatus: newBookingStatus, paymentStatus: newPaymentStatus, confirmedAt: new Date() } });
        await addTimelineEvent(booking.id, "ADVANCE_PAYMENT_APPROVED", { tx });
      } else {
        if (Number(recalced.outstandingBalance) <= 0) {
          newPaymentStatus = "FULLY_PAID";
          await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: newPaymentStatus } });
        } else {
          // Partial final payment approved but balance remains — stay in FINAL_PAYMENT_REQUIRED
          // so admin can issue a follow-up payment request for the remainder.
          await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: "FINAL_PAYMENT_REQUIRED" } });
        }
        await addTimelineEvent(booking.id, "FINAL_PAYMENT_APPROVED", { tx });
      }

      await addAuditLog(
        { adminId: session.adminId, actionType: "PAYMENT_APPROVED", entityType: "Payment", entityId: paymentId, oldValue: { status: "UNDER_VERIFICATION" }, newValue: { status: "APPROVED" } },
        tx
      );
    } else {
      updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: rejectionReason || null, verifiedByAdminId: session.adminId },
      });

      newPaymentStatus = isAdvance ? "ADVANCE_PAYMENT_REJECTED" : "FINAL_PAYMENT_REJECTED";
      await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: newPaymentStatus } });

      // Re-activate the payment request so the customer can resubmit, without
      // creating a brand new token (Part 16 — don't destroy history, allow resubmission).
      if (payment.paymentRequestId) {
        await tx.paymentRequest.update({ where: { id: payment.paymentRequestId }, data: { status: "ACTIVE" } });
      }

      await addTimelineEvent(booking.id, isAdvance ? "ADVANCE_PAYMENT_REJECTED" : "FINAL_PAYMENT_REJECTED", {
        tx,
        descriptionOverride: rejectionReason || undefined,
      });

      await addAuditLog(
        { adminId: session.adminId, actionType: "PAYMENT_REJECTED", entityType: "Payment", entityId: paymentId, oldValue: { status: "UNDER_VERIFICATION" }, newValue: { status: "REJECTED", rejectionReason } },
        tx
      );
    }

    const finalBooking = await tx.booking.findUnique({ where: { id: booking.id } });
    return { payment: updatedPayment, booking: finalBooking };
  });

  await sendAndLogEmail(
    decision === "APPROVE" ? "payment_approved" : "payment_rejected",
    booking.customerEmail,
    { booking: result.booking, reason: rejectionReason },
    booking.id
  );

  sendJson(res, 200, { success: true, payment: result.payment, booking: result.booking });
}));
