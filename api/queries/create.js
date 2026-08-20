/**
 * POST /api/queries/create   { bookingId, email, message }
 * Customer "Raise a Query" — Part 42. Same secure bookingId+email match
 * as booking-status, so a query can't be filed against someone else's booking.
 */
const { prisma } = require("../../lib/db");
const { sendJson, methodGuard, withErrorHandling, isValidEmail, normalizeEmail } = require("../../lib/apiUtils");

const GENERIC_ERROR = "Booking not found. Please check your Booking ID and registered email address.";

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  const bookingId = String(body.bookingId || "").trim().toUpperCase();
  const email = normalizeEmail(body.email);
  const message = String(body.message || "").trim();

  if (!bookingId || !isValidEmail(email)) return sendJson(res, 400, { error: GENERIC_ERROR });
  if (!message || message.length < 5) return sendJson(res, 400, { error: "Please enter your query message." });
  if (message.length > 2000) return sendJson(res, 400, { error: "Message is too long (max 2000 characters)." });

  const booking = await prisma.booking.findFirst({ where: { bookingId, customerEmail: email } });
  if (!booking) return sendJson(res, 404, { error: GENERIC_ERROR });

  const query = await prisma.customerQuery.create({
    data: { bookingId: booking.id, customerMessage: message, status: "OPEN" },
  });

  sendJson(res, 201, { success: true, message: "Your query has been submitted. We'll get back to you soon.", queryId: query.id });
});
