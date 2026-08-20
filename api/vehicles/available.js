/**
 * GET /api/vehicles/available?passengers=4&travelDate=2026-09-01&returnDate=2026-09-03
 * Public endpoint. Returns only vehicles that are bookingEnabled + AVAILABLE,
 * and (if trip dates are supplied) not already conflicting with another
 * active booking's date range — Part 5 & 8. Flags recommended matches
 * per Part 6.
 */
const { prisma } = require("../../lib/db");
const { tripRange, rangesOverlap } = require("../../lib/availability");
const { sendJson, methodGuard, withErrorHandling, toNumber } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const { passengers, travelDate, returnDate, vehicleType } = req.query || {};
  const passengerCount = toNumber(passengers, 0);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      bookingEnabled: true,
      status: "AVAILABLE",
      ...(vehicleType ? { vehicleType } : {}),
    },
    orderBy: [{ recommended: "desc" }, { seatingCapacity: "asc" }],
  });

  let requestedStart = null;
  let requestedEnd = null;
  if (travelDate && !isNaN(new Date(travelDate).getTime())) {
    [requestedStart, requestedEnd] = tripRange({ travelDate, returnDate });
  }

  let available = vehicles;

  if (requestedStart) {
    const conflictingBookings = await prisma.booking.findMany({
      where: {
        assignedVehicleId: { in: vehicles.map((v) => v.id) },
        bookingStatus: { in: ["APPROVED", "CONFIRMED", "COMPLETED"] },
        tripStatus: { in: ["VEHICLE_ASSIGNED", "UPCOMING", "ON_TRIP"] },
      },
      select: { assignedVehicleId: true, travelDate: true, returnDate: true },
    });

    const conflictedVehicleIds = new Set(
      conflictingBookings
        .filter((b) => {
          const [oStart, oEnd] = tripRange(b);
          return rangesOverlap(requestedStart, requestedEnd, oStart, oEnd);
        })
        .map((b) => b.assignedVehicleId)
    );

    available = vehicles.filter((v) => !conflictedVehicleIds.has(v.id));
  }

  const withRecommendation = available.map((v) => ({
    id: v.id,
    vehicleName: v.vehicleName,
    vehicleType: v.vehicleType,
    seatingCapacity: v.seatingCapacity,
    description: v.description,
    features: v.features,
    imageUrl: v.imageUrl,
    recommended:
      v.recommended && (!passengerCount || (v.seatingCapacity >= passengerCount && v.seatingCapacity <= passengerCount + 3)),
    isGoodFit: !passengerCount || v.seatingCapacity >= passengerCount,
  }));

  sendJson(res, 200, { success: true, vehicles: withRecommendation });
});
