const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const ORDER = ["NOT_ASSIGNED", "VEHICLE_ASSIGNED", "UPCOMING", "ON_TRIP", "TRAVEL_COMPLETED"];
const EVENT_FOR = { ON_TRIP: "TRIP_STARTED", TRAVEL_COMPLETED: "TRIP_COMPLETED" };

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId, tripStatus } = await readJsonBody(req);
  if (!bookingId || !ORDER.includes(tripStatus)) return sendJson(res, 400, { error: "Valid bookingId and tripStatus are required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId }, include: { assignedVehicle: true } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  if (tripStatus !== "NOT_ASSIGNED" && ORDER.indexOf(tripStatus) < ORDER.indexOf(booking.tripStatus)) {
    return sendJson(res, 409, { error: `Cannot move trip status backward from ${booking.tripStatus} to ${tripStatus}.` });
  }
  if (["UPCOMING", "ON_TRIP", "TRAVEL_COMPLETED"].includes(tripStatus) && !booking.assignedVehicleId) {
    return sendJson(res, 409, { error: "Assign a vehicle before advancing trip status." });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({ where: { id: booking.id }, data: { tripStatus } });
    if (EVENT_FOR[tripStatus]) await addTimelineEvent(b.id, EVENT_FOR[tripStatus], { tx });
    await addAuditLog(
      { adminId: session.adminId, actionType: "TRIP_STATUS_UPDATED", entityType: "Booking", entityId: b.id, oldValue: { tripStatus: booking.tripStatus }, newValue: { tripStatus } },
      tx
    );
    return b;
  });

  sendJson(res, 200, { success: true, booking: updated });
}));
