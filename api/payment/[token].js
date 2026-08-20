/**
 * GET /api/payment/[token]
 * Secure customer payment page data — Part 14.
 * Validates the token exists, is active, unexpired, and unrevoked
 * before returning any data. Never exposes admin secrets or other
 * bookings.
 */
const { prisma } = require("../../lib/db");
const { paymentPageDto } = require("../../lib/dto");
const { sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const token = req.query && req.query.token;
  if (!token) return sendJson(res, 400, { error: "Missing payment token." });

  const paymentRequest = await prisma.paymentRequest.findUnique({
    where: { secureToken: token },
    include: { booking: true },
  });

  if (!paymentRequest) return sendJson(res, 404, { error: "This payment link is invalid." });
  if (paymentRequest.status === "REVOKED") return sendJson(res, 410, { error: "This payment link has been revoked. Please contact us for a new one." });
  if (paymentRequest.status === "PAID") return sendJson(res, 200, { success: true, alreadyPaid: true, payment: paymentPageDto(paymentRequest, paymentRequest.booking) });
  if (paymentRequest.expiresAt && new Date(paymentRequest.expiresAt) < new Date()) {
    if (paymentRequest.status === "ACTIVE") {
      await prisma.paymentRequest.update({ where: { id: paymentRequest.id }, data: { status: "EXPIRED" } });
    }
    return sendJson(res, 410, { error: "This payment link has expired. Please contact us for a new one." });
  }

  sendJson(res, 200, {
    success: true,
    payment: paymentPageDto(paymentRequest, paymentRequest.booking),
    upi: {
      upiId: process.env.UPI_ID || "prakashtours@upi",
      displayName: process.env.UPI_DISPLAY_NAME || "Prakash Tour & Travels",
    },
  });
});
