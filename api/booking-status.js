/**
 * POST /api/booking-status
 * Secure customer booking lookup — Part 26/27.
 * Requires BOTH bookingId and the registered email to match exactly.
 * Always returns the same generic error on any mismatch, never
 * revealing which field was wrong (prevents booking-ID enumeration).
 */
const { prisma } = require("../lib/db");
const { customerBookingDto } = require("../lib/dto");
const { readJsonBody, sendJson, methodGuard, withErrorHandling, isValidEmail, normalizeEmail } = require("../lib/apiUtils");

// Minimal in-memory rate limiting per server instance. For real
// multi-instance rate limiting, move this to Redis/Upstash.
const attempts = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 15;

function rateLimited(key) {
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }
  record.count += 1;
  attempts.set(key, record);
  return record.count > MAX_ATTEMPTS;
}

const GENERIC_ERROR = "Booking not found. Please check your Booking ID and registered email address.";

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const body = await readJsonBody(req);
  const bookingId = String(body.bookingId || "").trim().toUpperCase();
  const email = normalizeEmail(body.email);

  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return sendJson(res, 429, { error: "Too many attempts. Please try again in a few minutes." });
  }

  if (!bookingId || !isValidEmail(email)) {
    return sendJson(res, 400, { error: GENERIC_ERROR });
  }

  const booking = await prisma.booking.findFirst({
    where: { bookingId, customerEmail: email },
    include: {
      assignedVehicle: true,
      assignedDriver: true,
      charges: true,
      timelineEvents: true,
      paymentRequests: true,
      invoices: true,
    },
  });

  if (!booking) {
    return sendJson(res, 404, { error: GENERIC_ERROR });
  }

  sendJson(res, 200, { success: true, booking: customerBookingDto(booking) });
});
