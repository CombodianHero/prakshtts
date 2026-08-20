const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { checkDriverAvailability } = require("../../../lib/availability");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId, driverId } = await readJsonBody(req);
  if (!bookingId || !driverId) return sendJson(res, 400, { error: "bookingId and driverId are required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  const check = await checkDriverAvailability(driverId, booking);
  if (!check.ok) return sendJson(res, 409, { error: check.reason });

  const isChange = Boolean(booking.assignedDriverId) && booking.assignedDriverId !== driverId;

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: { assignedDriverId: driverId },
      include: { assignedVehicle: true, assignedDriver: true },
    });
    await addTimelineEvent(b.id, isChange ? "DRIVER_CHANGED" : "DRIVER_ASSIGNED", { tx });
    await addAuditLog(
      { adminId: session.adminId, actionType: isChange ? "DRIVER_CHANGED" : "DRIVER_ASSIGNED", entityType: "Booking", entityId: b.id, oldValue: { assignedDriverId: booking.assignedDriverId }, newValue: { assignedDriverId: driverId } },
      tx
    );
    return b;
  });

  await sendAndLogEmail(
    "vehicle_driver_assigned",
    updated.customerEmail,
    { booking: updated, vehicle: updated.assignedVehicle, driver: updated.assignedDriver, isUpdate: isChange },
    updated.id
  );

  sendJson(res, 200, { success: true, booking: updated });
}));
