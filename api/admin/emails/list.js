/**
 * GET /api/admin/emails/list?bookingId=&status=
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;
  const { bookingId, status } = req.query || {};

  let internalId;
  if (bookingId) {
    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) return sendJson(res, 404, { error: "Booking not found." });
    internalId = booking.id;
  }

  const emails = await prisma.emailLog.findMany({
    where: { ...(internalId ? { bookingId: internalId } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  sendJson(res, 200, { success: true, emails });
}));
