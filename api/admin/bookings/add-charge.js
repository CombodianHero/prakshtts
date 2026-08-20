/**
 * POST /api/admin/bookings/add-charge      { bookingId, chargeType, description?, amount }
 * PUT/PATCH-like behaviour via action field also supports edit/remove:
 *   { bookingId, chargeId, action: "edit", description?, amount }
 *   { bookingId, chargeId, action: "remove" }
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { recalculateBookingFinancials, round2 } = require("../../../lib/calc");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, toNumber, withErrorHandling } = require("../../../lib/apiUtils");

const CHARGE_TYPES = ["TOLL", "PARKING", "OTHER"];

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = await readJsonBody(req);
  const { bookingId, chargeId, action } = body;
  if (!bookingId) return sendJson(res, 400, { error: "bookingId is required." });

  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking) return sendJson(res, 404, { error: "Booking not found." });

  if (action === "remove") {
    if (!chargeId) return sendJson(res, 400, { error: "chargeId is required to remove a charge." });
    const charge = await prisma.additionalCharge.findUnique({ where: { id: chargeId } });
    if (!charge || charge.bookingId !== booking.id) return sendJson(res, 404, { error: "Charge not found." });

    await prisma.$transaction(async (tx) => {
      await tx.additionalCharge.delete({ where: { id: chargeId } });
      await recalculateBookingFinancials(booking.id, tx);
      await addAuditLog({ adminId: session.adminId, actionType: "CHARGE_REMOVED", entityType: "Booking", entityId: booking.id, oldValue: charge, newValue: null }, tx);
    });
    const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: { charges: true } });
    return sendJson(res, 200, { success: true, booking: updated });
  }

  if (action === "edit") {
    if (!chargeId) return sendJson(res, 400, { error: "chargeId is required to edit a charge." });
    const charge = await prisma.additionalCharge.findUnique({ where: { id: chargeId } });
    if (!charge || charge.bookingId !== booking.id) return sendJson(res, 404, { error: "Charge not found." });
    const amount = round2(toNumber(body.amount, Number(charge.amount)));
    if (amount < 0) return sendJson(res, 400, { error: "Amount cannot be negative." });

    await prisma.$transaction(async (tx) => {
      const updatedCharge = await tx.additionalCharge.update({
        where: { id: chargeId },
        data: { amount, description: body.description !== undefined ? body.description : charge.description },
      });
      await recalculateBookingFinancials(booking.id, tx);
      await addAuditLog({ adminId: session.adminId, actionType: "CHARGE_EDITED", entityType: "Booking", entityId: booking.id, oldValue: charge, newValue: updatedCharge }, tx);
    });
    const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: { charges: true } });
    return sendJson(res, 200, { success: true, booking: updated });
  }

  // default action: add
  const { chargeType, description } = body;
  const amount = round2(toNumber(body.amount, -1));
  if (!CHARGE_TYPES.includes(chargeType)) return sendJson(res, 400, { error: "chargeType must be TOLL, PARKING, or OTHER." });
  if (amount < 0) return sendJson(res, 400, { error: "A valid, non-negative amount is required." });
  if (chargeType === "OTHER" && !description) return sendJson(res, 400, { error: "A description is required for OTHER charges." });

  await prisma.$transaction(async (tx) => {
    const created = await tx.additionalCharge.create({
      data: { bookingId: booking.id, chargeType, description: description || null, amount, addedByAdminId: session.adminId },
    });
    await recalculateBookingFinancials(booking.id, tx);
    await addAuditLog({ adminId: session.adminId, actionType: `${chargeType}_ADDED`, entityType: "Booking", entityId: booking.id, oldValue: null, newValue: created }, tx);
  });

  const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: { charges: true } });
  sendJson(res, 200, { success: true, booking: updated });
}));
