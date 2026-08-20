/**
 * lib/availability.js
 * Server-side conflict checking for vehicle and driver assignment.
 * Must be the ONLY source of truth for "can this be assigned?" —
 * never trust a frontend-only check.
 */
const { prisma } = require("./db");

const ACTIVE_BOOKING_STATUSES = ["APPROVED", "CONFIRMED"]; // bookings that actually occupy a vehicle/driver
const BLOCKING_TRIP_STATUSES = ["VEHICLE_ASSIGNED", "UPCOMING", "ON_TRIP"];

/** Returns the [start, end] Date range a booking occupies, defaulting a single-day trip to +1 day. */
function tripRange(booking) {
  const start = new Date(booking.travelDate);
  const end = booking.returnDate ? new Date(booking.returnDate) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Checks whether `vehicleId` can be assigned to `booking` (excluding the booking itself).
 * Returns { ok: true } or { ok: false, reason }.
 */
async function checkVehicleAvailability(vehicleId, booking) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, reason: "Vehicle not found." };
  if (["MAINTENANCE", "UNAVAILABLE", "INACTIVE"].includes(vehicle.status)) {
    return { ok: false, reason: `This vehicle is currently marked ${vehicle.status.toLowerCase()} and cannot be assigned.` };
  }

  const [start, end] = tripRange(booking);
  const others = await prisma.booking.findMany({
    where: {
      assignedVehicleId: vehicleId,
      id: { not: booking.id },
      bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES, "COMPLETED"] },
      tripStatus: { in: BLOCKING_TRIP_STATUSES },
    },
  });
  for (const other of others) {
    const [oStart, oEnd] = tripRange(other);
    if (rangesOverlap(start, end, oStart, oEnd)) {
      return {
        ok: false,
        reason: "This vehicle is already assigned to another trip during the selected travel period.",
      };
    }
  }
  return { ok: true, vehicle };
}

/**
 * Checks whether `driverId` can be assigned to `booking` (excluding the booking itself).
 */
async function checkDriverAvailability(driverId, booking) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) return { ok: false, reason: "Driver not found." };
  if (["UNAVAILABLE", "INACTIVE"].includes(driver.status)) {
    return { ok: false, reason: `This driver is currently marked ${driver.status.toLowerCase()} and cannot be assigned.` };
  }

  const [start, end] = tripRange(booking);
  const others = await prisma.booking.findMany({
    where: {
      assignedDriverId: driverId,
      id: { not: booking.id },
      bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES, "COMPLETED"] },
      tripStatus: { in: BLOCKING_TRIP_STATUSES },
    },
  });
  for (const other of others) {
    const [oStart, oEnd] = tripRange(other);
    if (rangesOverlap(start, end, oStart, oEnd)) {
      return {
        ok: false,
        reason: "This driver is already assigned to another trip during the selected travel period.",
      };
    }
  }
  return { ok: true, driver };
}

module.exports = { checkVehicleAvailability, checkDriverAvailability, tripRange, rangesOverlap };
