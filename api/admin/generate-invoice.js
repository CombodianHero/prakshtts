/**
 * POST /api/admin/generate-invoice   { bookingId }
 * Part 24-25: only allowed once outstandingBalance = 0 and
 * paymentStatus = FULLY_PAID. Creates a sequential, unique invoice
 * number and record; the actual printable invoice is rendered by
 * invoice.html from /api/invoices/lookup (customer) or this admin
 * endpoint's returned invoice object (admin) — no separate PDF
 * pipeline is wired up yet, see STATUS.md.
 */
const { prisma } = require("../../lib/db");
const { requireAdmin } = require("../../lib/auth");
const { generateInvoiceNumber } = require("../../lib/ids");
const { addTimelineEvent } = require("../../lib/timeline");
const { addAuditLog } = require("../../lib/audit");
const { sendAndLogEmail } = require("../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { bookingId } = await readJsonBody(req);
  if (!bookingId) return sendJson(res, 400, { error: "bookingId is required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId }, include: { invoices: true } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  if (Number(booking.outstandingBalance) > 0 || booking.paymentStatus !== "FULLY_PAID") {
    return sendJson(res, 409, { error: "Final invoice can only be generated once the outstanding balance is ₹0 and payment status is FULLY_PAID." });
  }

  const existingFinal = booking.invoices.find((i) => i.invoiceType === "FINAL");
  if (existingFinal) {
    return sendJson(res, 200, { success: true, invoice: existingFinal, alreadyExisted: true });
  }

  const invoiceNumber = await generateInvoiceNumber(prisma);
  const appUrl = process.env.APP_URL || "";

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        bookingId: booking.id,
        invoiceNumber,
        invoiceType: "FINAL",
        invoiceUrl: `${appUrl}/invoice.html?bookingId=${encodeURIComponent(booking.bookingId)}&invoice=${encodeURIComponent(invoiceNumber)}`,
        generatedByAdminId: session.adminId,
      },
    });
    await addTimelineEvent(booking.id, "INVOICE_GENERATED", { tx });
    await tx.booking.update({ where: { id: booking.id }, data: { bookingStatus: "COMPLETED", completedAt: new Date() } });
    await addAuditLog({ adminId: session.adminId, actionType: "INVOICE_GENERATED", entityType: "Booking", entityId: booking.id, oldValue: null, newValue: { invoiceNumber } }, tx);
    return created;
  });

  await sendAndLogEmail("invoice_ready", booking.customerEmail, { booking }, booking.id);

  sendJson(res, 201, { success: true, invoice });
}));
