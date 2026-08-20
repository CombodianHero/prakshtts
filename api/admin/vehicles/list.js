const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assignedToBookings: {
        where: { bookingStatus: { in: ["APPROVED", "CONFIRMED"] } },
        orderBy: { travelDate: "asc" },
        select: { bookingId: true, travelDate: true, returnDate: true, tripStatus: true, customerName: true },
      },
    },
  });
  sendJson(res, 200, { success: true, vehicles });
}));
