/**
 * GET /api/admin/bookings/[id]
 * Complete admin management view: everything from Part 41 in one payload.
 * [id] here is the human-readable bookingId (e.g. TRV-2026-00001), since
 * that's what admin will search/navigate by.
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const bookingId = req.query && req.query.id;
  const booking = await prisma.booking.findUnique({
    where: { bookingId },
    include: {
      customer: true,
      requestedVehicle: true,
      assignedVehicle: true,
      assignedDriver: true,
      payments: { orderBy: { createdAt: "desc" } },
      paymentRequests: { orderBy: { createdAt: "desc" } },
      charges: { orderBy: { addedAt: "desc" } },
      timelineEvents: { orderBy: { createdAt: "asc" } },
      invoices: true,
      emailLogs: { orderBy: { createdAt: "desc" } },
      queries: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Booking", entityId: booking.id },
    orderBy: { createdAt: "desc" },
  });

  sendJson(res, 200, { success: true, booking, auditLogs });
}));
