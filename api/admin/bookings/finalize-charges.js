/**
 * POST /api/admin/bookings/finalize-charges   { bookingId }
 * Locks in the current itemized charges, recalculates the final amount
 * server-side, creates the secure final-payment request, and emails the
 * customer the itemized breakdown — Part 21-23.
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { recalculateBookingFinancials } = require("../../../lib/calc");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { generateSecureToken } = require("../../../lib/ids");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const PAYMENT_LINK_TTL_DAYS = 7;

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId } = await readJsonBody(req);
  if (!bookingId) return sendJson(res, 400, { error: "bookingId is required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId }, include: { charges: true } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });
  if (booking.tripStatus !== "TRAVEL_COMPLETED") {
    return sendJson(res, 409, { error: "Trip must be marked Travel Completed before finalizing charges." });
  }

  const existingActiveFinal = await prisma.paymentRequest.findFirst({
    where: { bookingId: booking.id, paymentStage: "FINAL", status: "ACTIVE" },
  });
  if (existingActiveFinal) {
    return sendJson(res, 409, { error: "A final payment request is already active for this booking." });
  }

  const { updatedBooking, paymentRequest } = await prisma.$transaction(async (tx) => {
    const recalced = await recalculateBookingFinancials(booking.id, tx);

    if (Number(recalced.outstandingBalance) <= 0) {
      throw Object.assign(new Error("Outstanding balance is already ₹0 — no final payment is needed."), { statusCode: 409 });
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "FINAL_PAYMENT_REQUIRED" },
    });

    const secureToken = generateSecureToken();
    const request = await tx.paymentRequest.create({
      data: {
        bookingId: booking.id,
        paymentStage: "FINAL",
        amount: recalced.finalAmountDue,
        secureToken,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.payment.create({
      data: { bookingId: booking.id, paymentStage: "FINAL", amount: recalced.finalAmountDue, status: "REQUIRED", paymentRequestId: request.id },
    });

    await addTimelineEvent(booking.id, "FINAL_CHARGES_ADDED", { tx });
    await addTimelineEvent(booking.id, "FINAL_PAYMENT_REQUIRED", { tx });
    await addAuditLog(
      { adminId: session.adminId, actionType: "FINAL_PAYMENT_REQUEST_CREATED", entityType: "Booking", entityId: booking.id, oldValue: null, newValue: { finalAmountDue: Number(recalced.finalAmountDue) } },
      tx
    );

    return { updatedBooking: updated, paymentRequest: request };
  });

  const paymentUrl = `${process.env.APP_URL || ""}/payment/${paymentRequest.secureToken}`;
  await sendAndLogEmail(
    "final_payment_required",
    booking.customerEmail,
    { booking: { ...booking, finalAmountDue: Number(paymentRequest.amount) }, charges: booking.charges, finalAmountDue: Number(paymentRequest.amount), paymentUrl },
    booking.id
  );

  sendJson(res, 200, { success: true, booking: updatedBooking, paymentUrl });
}));
