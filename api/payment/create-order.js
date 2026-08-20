/**
 * POST /api/payment/create-order   { token }
 * Real Razorpay order creation — only reachable when RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET are configured. If they aren't, the payment page
 * simply doesn't offer the "Pay Online" button and falls back to the
 * manual UPI + receipt-upload flow (api/payment/submit.js) — Part 46.
 */
const { prisma } = require("../../lib/db");
const { sendJson, methodGuard, withErrorHandling, readJsonBody } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return sendJson(res, 501, { error: "Online gateway payment is not configured. Please use the manual UPI + receipt upload option instead." });
  }

  const { token } = await readJsonBody(req);
  if (!token) return sendJson(res, 400, { error: "Missing payment token." });

  const paymentRequest = await prisma.paymentRequest.findUnique({ where: { secureToken: token }, include: { booking: true } });
  if (!paymentRequest) return sendJson(res, 404, { error: "This payment link is invalid." });
  if (paymentRequest.status !== "ACTIVE") return sendJson(res, 410, { error: "This payment link is no longer active." });
  if (paymentRequest.expiresAt && new Date(paymentRequest.expiresAt) < new Date()) {
    return sendJson(res, 410, { error: "This payment link has expired. Please contact us for a new one." });
  }

  // The amount ALWAYS comes from the server-side PaymentRequest, never from
  // the client — this is what prevents a tampered-amount attack.
  const amountPaise = Math.round(Number(paymentRequest.amount) * 100);

  const Razorpay = require("razorpay");
  const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

  const order = await instance.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `${paymentRequest.booking.bookingId}-${paymentRequest.paymentStage}`,
    notes: { bookingId: paymentRequest.booking.bookingId, paymentStage: paymentRequest.paymentStage },
  });

  sendJson(res, 200, { success: true, orderId: order.id, amount: amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
});
