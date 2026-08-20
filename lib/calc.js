/**
 * lib/calc.js
 * THE single source of truth for all money math. Every place in the
 * codebase that needs a booking's financial numbers must call
 * recalculateBookingFinancials() and persist the result — never
 * recompute money client-side and trust it.
 */
const { prisma } = require("./db");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Computes advanceRequiredAmount from baseAmount + advance mode, per Part 11.
 */
function computeAdvanceRequired({ baseAmount, advanceMode, advancePercentage, manualAdvanceAmount }) {
  const base = Math.max(0, round2(baseAmount));
  if (advanceMode === "MANUAL_AMOUNT") {
    let amt = Math.max(0, round2(manualAdvanceAmount));
    if (amt > base) amt = base; // never exceed the base amount
    return amt;
  }
  const pct = Math.min(100, Math.max(0, Number(advancePercentage) || 0));
  return round2((base * pct) / 100);
}

/**
 * Recalculates and persists every derived financial field on a booking,
 * based on the booking's approved payments and additional charges.
 * Must be called (inside a transaction where relevant) after:
 *   - base amount / advance settings change
 *   - a payment is approved or rejected
 *   - a charge is added, edited, or removed
 */
async function recalculateBookingFinancials(bookingId, tx = prisma) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found for financial recalculation");

  const approvedPayments = await tx.payment.findMany({
    where: { bookingId, status: "APPROVED" },
  });
  const charges = await tx.additionalCharge.findMany({ where: { bookingId } });

  const baseAmount = round2(booking.baseAmount);
  const advanceRequiredAmount = round2(booking.advanceRequiredAmount);

  const advancePaidAmount = round2(
    approvedPayments.filter((p) => p.paymentStage === "ADVANCE").reduce((s, p) => s + Number(p.amount), 0)
  );
  const finalPaidAmount = round2(
    approvedPayments.filter((p) => p.paymentStage === "FINAL").reduce((s, p) => s + Number(p.amount), 0)
  );
  const totalPaidAmount = round2(advancePaidAmount + finalPaidAmount);

  const remainingBaseAmount = Math.max(0, round2(baseAmount - advancePaidAmount));
  const additionalChargesTotal = round2(charges.reduce((s, c) => s + Number(c.amount), 0));
  const finalAmountDue = Math.max(0, round2(remainingBaseAmount + additionalChargesTotal));
  const outstandingBalance = Math.max(0, round2(baseAmount + additionalChargesTotal - totalPaidAmount));

  const updated = await tx.booking.update({
    where: { id: bookingId },
    data: {
      advancePaidAmount,
      remainingBaseAmount,
      additionalChargesTotal,
      finalAmountDue,
      totalPaidAmount,
      outstandingBalance,
    },
  });

  return updated;
}

module.exports = { round2, computeAdvanceRequired, recalculateBookingFinancials };
