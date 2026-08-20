const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;
  const { status } = req.query || {};
  const queries = await prisma.customerQuery.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    include: { booking: { select: { bookingId: true, customerName: true, customerEmail: true } } },
  });
  sendJson(res, 200, { success: true, queries });
}));
