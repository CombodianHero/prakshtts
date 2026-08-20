const { prisma } = require("../../lib/db");
const { requireAdmin } = require("../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const [
    totalBookings,
    pendingApproval,
    approved,
    confirmed,
    completed,
    upcomingTrips,
    onTrip,
    completedTrips,
    advancePending,
    underVerification,
    finalPending,
    fullyPaid,
    vehiclesAvailable,
    vehiclesOnTrip,
    vehiclesMaintenance,
    driversAvailable,
    driversAssigned,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { bookingStatus: "PENDING_APPROVAL" } }),
    prisma.booking.count({ where: { bookingStatus: "APPROVED" } }),
    prisma.booking.count({ where: { bookingStatus: "CONFIRMED" } }),
    prisma.booking.count({ where: { bookingStatus: "COMPLETED" } }),
    prisma.booking.count({ where: { tripStatus: "UPCOMING" } }),
    prisma.booking.count({ where: { tripStatus: "ON_TRIP" } }),
    prisma.booking.count({ where: { tripStatus: "TRAVEL_COMPLETED" } }),
    prisma.booking.count({ where: { paymentStatus: "ADVANCE_PAYMENT_REQUIRED" } }),
    prisma.booking.count({ where: { paymentStatus: { in: ["ADVANCE_PAYMENT_UNDER_VERIFICATION", "FINAL_PAYMENT_UNDER_VERIFICATION"] } } }),
    prisma.booking.count({ where: { paymentStatus: "FINAL_PAYMENT_REQUIRED" } }),
    prisma.booking.count({ where: { paymentStatus: "FULLY_PAID" } }),
    prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
    prisma.vehicle.count({ where: { status: "ON_TRIP" } }),
    prisma.vehicle.count({ where: { status: "MAINTENANCE" } }),
    prisma.driver.count({ where: { status: "AVAILABLE" } }),
    prisma.driver.count({ where: { status: "ASSIGNED" } }),
  ]);

  sendJson(res, 200, {
    success: true,
    stats: {
      totalBookings,
      pendingApproval,
      approved,
      confirmed,
      completed,
      upcomingTrips,
      onTrip,
      completedTrips,
      advancePaymentPending: advancePending,
      paymentsUnderVerification: underVerification,
      finalPaymentPending: finalPending,
      fullyPaidBookings: fullyPaid,
      vehiclesAvailable,
      vehiclesOnTrip,
      vehiclesMaintenance,
      driversAvailable,
      driversAssigned,
    },
  });
}));
