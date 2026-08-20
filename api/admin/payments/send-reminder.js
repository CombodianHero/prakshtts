/**
 * POST /api/admin/payments/send-reminder   { bookingId, stage: "ADVANCE"|"FINAL" }
 * Manual admin-triggered reminder (Part 34). Blocked once the relevant
 * payment is already approved, and rate-limited to one reminder per
 * 24 hours per bookingId+stage to avoid spamming the customer.
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const MIN_GAP_HOURS = 24;

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId, stage } = await readJsonBody(req);
  if (!bookingId || !["ADVANCE", "FINAL"].includes(stage)) {
    return sendJson(res, 400, { error: "bookingId and a stage of ADVANCE or FINAL are required." });
  }

  const booking = await prisma.booking.findUnique({ where: { bookingId }, include: { paymentRequests: true } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  const paidStatuses = stage === "ADVANCE" ? ["ADVANCE_PAID", "FULLY_PAID"] : ["FULLY_PAID"];
  if (paidStatuses.includes(booking.paymentStatus)) {
    return sendJson(res, 409, { error: "This payment has already been approved — no reminder needed." });
  }

  const activeRequest = booking.paymentRequests.find((r) => r.paymentStage === stage && r.status === "ACTIVE");
  if (!activeRequest) return sendJson(res, 409, { error: "No active payment request found for this stage." });

  const lastReminder = await prisma.reminderLog.findFirst({
    where: { bookingId: booking.id, stage },
    orderBy: { sentAt: "desc" },
  });
  if (lastReminder && Date.now() - new Date(lastReminder.sentAt).getTime() < MIN_GAP_HOURS * 60 * 60 * 1000) {
    return sendJson(res, 429, { error: `A reminder was already sent within the last ${MIN_GAP_HOURS} hours.` });
  }

  const paymentUrl = `${process.env.APP_URL || ""}/payment/${activeRequest.secureToken}`;
  await sendAndLogEmail(
    stage === "ADVANCE" ? "booking_approved_payment_required" : "final_payment_required",
    booking.customerEmail,
    { booking, paymentUrl, finalAmountDue: Number(activeRequest.amount) },
    booking.id
  );
  await prisma.reminderLog.create({ data: { bookingId: booking.id, stage } });

  sendJson(res, 200, { success: true, message: "Reminder sent." });
}));
