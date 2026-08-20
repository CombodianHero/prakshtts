/**
 * POST /api/admin/bookings/approve
 * Body: { bookingId, baseAmount, advanceMode: "DEFAULT_PERCENT"|"CUSTOM_PERCENT"|"MANUAL_AMOUNT",
 *         advancePercentage?, manualAdvanceAmount? }
 *
 * Part 10-13: admin sets/confirms pricing and approves the booking.
 * Creates the secure advance payment request and sends the email, all in
 * one transaction plus a post-commit email send (Part 13 flow).
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { computeAdvanceRequired, recalculateBookingFinancials, round2 } = require("../../../lib/calc");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { generateSecureToken } = require("../../../lib/ids");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, toNumber, withErrorHandling } = require("../../../lib/apiUtils");

const DEFAULT_ADVANCE_PERCENT = 30;
const PAYMENT_LINK_TTL_DAYS = 7;

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;

  const body = await readJsonBody(req);
  const { bookingId, advanceMode = "DEFAULT_PERCENT", advancePercentage, manualAdvanceAmount } = body;
  const baseAmount = round2(toNumber(body.baseAmount, -1));

  if (!bookingId) return sendJson(res, 400, { error: "bookingId is required." });
  if (baseAmount < 0) return sendJson(res, 400, { error: "A valid, non-negative base amount is required." });
  if (advanceMode === "CUSTOM_PERCENT" && (toNumber(advancePercentage) <= 0 || toNumber(advancePercentage) > 100)) {
    return sendJson(res, 400, { error: "Advance percentage must be between 0 and 100." });
  }
  if (advanceMode === "MANUAL_AMOUNT" && (toNumber(manualAdvanceAmount) < 0 || toNumber(manualAdvanceAmount) > baseAmount)) {
    return sendJson(res, 400, { error: "Manual advance amount must be between 0 and the base amount." });
  }

  const existing = await prisma.booking.findUnique({ where: { bookingId } });
  if (!existing) return sendJson(res, 404, { error: "Booking not found." });
  if (existing.bookingStatus !== "PENDING_APPROVAL") {
    return sendJson(res, 409, { error: `Booking is already ${existing.bookingStatus}, cannot approve again.` });
  }

  const effectivePercentage = advanceMode === "DEFAULT_PERCENT" ? DEFAULT_ADVANCE_PERCENT : toNumber(advancePercentage, DEFAULT_ADVANCE_PERCENT);
  const advanceRequiredAmount = computeAdvanceRequired({
    baseAmount,
    advanceMode,
    advancePercentage: effectivePercentage,
    manualAdvanceAmount,
  });

  const { booking, paymentRequest } = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: existing.id },
      data: {
        baseAmount,
        advanceMode,
        advancePercentage: advanceMode === "MANUAL_AMOUNT" ? existing.advancePercentage : effectivePercentage,
        advanceRequiredAmount,
        bookingStatus: "APPROVED",
        paymentStatus: "ADVANCE_PAYMENT_REQUIRED",
        approvedAt: new Date(),
      },
    });

    await recalculateBookingFinancials(updated.id, tx);

    const secureToken = generateSecureToken();
    const request = await tx.paymentRequest.create({
      data: {
        bookingId: updated.id,
        paymentStage: "ADVANCE",
        amount: advanceRequiredAmount,
        secureToken,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.payment.create({
      data: {
        bookingId: updated.id,
        paymentStage: "ADVANCE",
        amount: advanceRequiredAmount,
        status: "REQUIRED",
        paymentRequestId: request.id,
      },
    });

    await addTimelineEvent(updated.id, "BOOKING_APPROVED", { tx });
    await addTimelineEvent(updated.id, "ADVANCE_PAYMENT_REQUIRED", { tx });

    await addAuditLog(
      {
        adminId: session.adminId,
        actionType: "BOOKING_APPROVED",
        entityType: "Booking",
        entityId: updated.id,
        oldValue: { bookingStatus: existing.bookingStatus, baseAmount: Number(existing.baseAmount) },
        newValue: { bookingStatus: "APPROVED", baseAmount, advanceMode, advanceRequiredAmount },
      },
      tx
    );

    return { booking: updated, paymentRequest: request };
  });

  const paymentUrl = `${process.env.APP_URL || ""}/payment/${paymentRequest.secureToken}`;
  await sendAndLogEmail(
    "booking_approved_payment_required",
    booking.customerEmail,
    {
      booking: { ...booking, baseAmount, advanceRequiredAmount, remainingBaseAmount: round2(baseAmount - advanceRequiredAmount) },
      paymentUrl,
    },
    booking.id
  );

  sendJson(res, 200, { success: true, booking, paymentUrl });
}));
