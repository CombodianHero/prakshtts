/**
 * GET /api/admin/bookings/list?status=&search=&page=&pageSize=
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, toNumber, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const { status, search } = req.query || {};
  const page = Math.max(1, toNumber(req.query?.page, 1));
  const pageSize = Math.min(100, Math.max(1, toNumber(req.query?.pageSize, 25)));

  const where = {
    ...(status ? { bookingStatus: status } : {}),
    ...(search
      ? {
          OR: [
            { bookingId: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { customerEmail: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedVehicle: true, assignedDriver: true },
    }),
  ]);

  sendJson(res, 200, { success: true, total, page, pageSize, bookings });
}));
