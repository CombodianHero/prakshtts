/**
 * POST /api/invoices/lookup   { bookingId, email }
 * Same secure-match rule as /api/booking-status (Part 26/27). Returns the
 * full invoice breakdown only when the booking is FULLY_PAID and an
 * invoice has actually been generated — never a preview of an
 * unfinalized invoice (Part 24).
 */
const { prisma } = require("../../lib/db");
const { sendJson, methodGuard, withErrorHandling, isValidEmail, normalizeEmail } = require("../../lib/apiUtils");

const GENERIC_ERROR = "Booking not found. Please check your Booking ID and registered email address.";

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  const bookingId = String(body.bookingId || "").trim().toUpperCase();
  const email = normalizeEmail(body.email);

  if (!bookingId || !isValidEmail(email)) return sendJson(res, 400, { error: GENERIC_ERROR });

  const booking = await prisma.booking.findFirst({
    where: { bookingId, customerEmail: email },
    include: { invoices: true, charges: true, assignedVehicle: true },
  });
  if (!booking) return sendJson(res, 404, { error: GENERIC_ERROR });

  const invoice = booking.invoices.find((i) => i.invoiceType === "FINAL");
  if (!invoice) return sendJson(res, 404, { error: "No final invoice has been generated for this booking yet." });

  sendJson(res, 200, {
    success: true,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      generatedAt: invoice.generatedAt,
      bookingId: booking.bookingId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      pickupLocation: booking.pickupLocation,
      destination: booking.destination,
      travelDate: booking.travelDate,
      baseAmount: Number(booking.baseAmount),
      advancePaidAmount: Number(booking.advancePaidAmount),
      charges: booking.charges.map((c) => ({ chargeType: c.chargeType, description: c.description, amount: Number(c.amount) })),
      additionalChargesTotal: Number(booking.additionalChargesTotal),
      totalPaidAmount: Number(booking.totalPaidAmount),
      outstandingBalance: Number(booking.outstandingBalance),
    },
  });
});
