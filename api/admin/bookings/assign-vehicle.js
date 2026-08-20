const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { checkVehicleAvailability } = require("../../../lib/availability");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId, vehicleId } = await readJsonBody(req);
  if (!bookingId || !vehicleId) return sendJson(res, 400, { error: "bookingId and vehicleId are required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  const check = await checkVehicleAvailability(vehicleId, booking);
  if (!check.ok) return sendJson(res, 409, { error: check.reason });

  const isChange = Boolean(booking.assignedVehicleId) && booking.assignedVehicleId !== vehicleId;

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: {
        assignedVehicleId: vehicleId,
        tripStatus: booking.tripStatus === "NOT_ASSIGNED" ? "VEHICLE_ASSIGNED" : booking.tripStatus,
      },
      include: { assignedVehicle: true, assignedDriver: true },
    });
    await addTimelineEvent(b.id, isChange ? "VEHICLE_CHANGED" : "VEHICLE_ASSIGNED", { tx });
    await addAuditLog(
      { adminId: session.adminId, actionType: isChange ? "VEHICLE_CHANGED" : "VEHICLE_ASSIGNED", entityType: "Booking", entityId: b.id, oldValue: { assignedVehicleId: booking.assignedVehicleId }, newValue: { assignedVehicleId: vehicleId } },
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
