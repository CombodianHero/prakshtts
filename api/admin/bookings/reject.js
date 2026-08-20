const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId, reason } = await readJsonBody(req);
  if (!bookingId) return sendJson(res, 400, { error: "bookingId is required." });

  const existing = await prisma.booking.findUnique({ where: { bookingId } });
  if (!existing) return sendJson(res, 404, { error: "Booking not found." });
  if (["REJECTED", "CANCELLED", "COMPLETED"].includes(existing.bookingStatus)) {
    return sendJson(res, 409, { error: `Booking is already ${existing.bookingStatus}.` });
  }

  const booking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: existing.id },
      data: { bookingStatus: "REJECTED" },
    });
    await addTimelineEvent(updated.id, "BOOKING_REJECTED", { tx, descriptionOverride: reason || undefined });
    await addAuditLog(
      { adminId: session.adminId, actionType: "BOOKING_REJECTED", entityType: "Booking", entityId: updated.id, oldValue: { bookingStatus: existing.bookingStatus }, newValue: { bookingStatus: "REJECTED", reason: reason || null } },
      tx
    );
    return updated;
  });

  await sendAndLogEmail("booking_rejected", booking.customerEmail, { booking, reason }, booking.id);
  sendJson(res, 200, { success: true, booking });
}));
