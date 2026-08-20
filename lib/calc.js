/**
 * lib/calc.js
 *
 * Central financial calculation utilities.
 *
 * IMPORTANT TRANSACTION RULE:
 *
 * When a Prisma transaction client is supplied:
 *
 *   recalculateBookingFinancials(bookingId, tx)
 *
 * EVERY database query in this function uses `tx`.
 *
 * When no transaction is supplied:
 *
 *   recalculateBookingFinancials(bookingId)
 *
 * The normal global Prisma client is used.
 */

const { prisma } = require("./db");


/**
 * Convert a value safely to a number.
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


/**
 * Round money to 2 decimal places.
 */
function round2(value) {
  return Math.round(
    (toNumber(value) + Number.EPSILON) * 100
  ) / 100;
}


/**
 * Calculate advance payment required.
 *
 * Supported modes:
 * DEFAULT_PERCENT
 * CUSTOM_PERCENT
 * MANUAL_AMOUNT
 */
function computeAdvanceRequired({
  baseAmount,
  advanceMode = "DEFAULT_PERCENT",
  advancePercentage = 30,
  manualAdvanceAmount = null,
}) {
  const safeBaseAmount = round2(
    toNumber(baseAmount, 0)
  );

  if (safeBaseAmount <= 0) {
    return 0;
  }


  if (advanceMode === "MANUAL_AMOUNT") {
    const amount = round2(
      toNumber(manualAdvanceAmount, 0)
    );

    return Math.min(
      Math.max(amount, 0),
      safeBaseAmount
    );
  }


  const percentage = Math.min(
    Math.max(
      toNumber(advancePercentage, 30),
      0
    ),
    100
  );


  return round2(
    safeBaseAmount *
    percentage /
    100
  );
}


/**
 * Recalculate all booking financial values.
 *
 * @param {string} bookingId
 * @param {object|null} tx Prisma transaction client
 *
 * IMPORTANT:
 * `db` is the ONLY database client used below.
 */
async function recalculateBookingFinancials(
  bookingId,
  tx = null
) {
  // ============================================================
  // CRITICAL FIX FOR P2028
  // ============================================================
  //
  // If this function was called inside:
  //
  // prisma.$transaction(async (tx) => {
  //   await recalculateBookingFinancials(id, tx);
  // });
  //
  // all database queries must use tx.
  //
  // NEVER directly use `prisma` below.
  // ============================================================

  const db = tx || prisma;


  // ============================================================
  // 1. LOAD BOOKING
  // ============================================================

  const booking =
    await db.booking.findUnique({
      where: {
        id: bookingId,
      },
    });


  if (!booking) {
    throw Object.assign(
      new Error("Booking not found."),
      {
        statusCode: 404,
      }
    );
  }


  // ============================================================
  // 2. LOAD ADDITIONAL CHARGES
  // ============================================================

  const charges =
    await db.additionalCharge.findMany({
      where: {
        bookingId,
      },
    });


  // ============================================================
  // 3. CALCULATE TOTAL ADDITIONAL CHARGES
  // ============================================================

  const additionalChargesTotal =
    round2(
      charges.reduce(
        (total, charge) =>
          total +
          toNumber(charge.amount, 0),
        0
      )
    );


  // ============================================================
  // 4. BASE AMOUNT
  // ============================================================

  const baseAmount =
    round2(
      toNumber(
        booking.baseAmount,
        0
      )
    );


  // ============================================================
  // 5. ADVANCE REQUIRED
  // ============================================================

  let advanceRequiredAmount =
    round2(
      toNumber(
        booking.advanceRequiredAmount,
        0
      )
    );


  // If old/incomplete booking data does not have the value,
  // calculate it from booking settings.

  if (
    advanceRequiredAmount <= 0 &&
    baseAmount > 0
  ) {
    advanceRequiredAmount =
      computeAdvanceRequired({
        baseAmount,

        advanceMode:
          booking.advanceMode ||
          "DEFAULT_PERCENT",

        advancePercentage:
          booking.advancePercentage ||
          30,

        manualAdvanceAmount:
          booking.manualAdvanceAmount ||
          null,
      });
  }


  // ============================================================
  // 6. LOAD PAYMENTS
  // ============================================================

  const payments =
    await db.payment.findMany({
      where: {
        bookingId,
      },
    );


  // ============================================================
  // 7. CALCULATE ACTUALLY PAID AMOUNTS
  //
  // Only approved/verified/paid payment records count as paid.
  //
  // REQUIRED does not count.
  // UNDER_VERIFICATION does not count.
  // REJECTED does not count.
  // ============================================================

  const paidStatuses = [
    "PAID",
    "APPROVED",
    "VERIFIED",
    "SUCCESS",
  ];


  const advancePaidAmount =
    round2(
      payments
        .filter(
          (payment) =>
            payment.paymentStage === "ADVANCE" &&
            paidStatuses.includes(
              payment.status
            )
        )
        .reduce(
          (total, payment) =>
            total +
            toNumber(payment.amount, 0),
          0
        )
    );


  const finalPaidAmount =
    round2(
      payments
        .filter(
          (payment) =>
            payment.paymentStage === "FINAL" &&
            paidStatuses.includes(
              payment.status
            )
        )
        .reduce(
          (total, payment) =>
            total +
            toNumber(payment.amount, 0),
          0
        )
    );


  const totalPaidAmount =
    round2(
      advancePaidAmount +
      finalPaidAmount
    );


  // ============================================================
  // 8. CALCULATE TOTAL BOOKING COST
  // ============================================================

  const totalBookingAmount =
    round2(
      baseAmount +
      additionalChargesTotal
    );


  // ============================================================
  // 9. REMAINING BASE AMOUNT
  // ============================================================

  const remainingBaseAmount =
    round2(
      Math.max(
        0,
        baseAmount -
        advancePaidAmount
      )
    );


  // ============================================================
  // 10. TOTAL OUTSTANDING BALANCE
  // ============================================================

  const outstandingBalance =
    round2(
      Math.max(
        0,
        totalBookingAmount -
        totalPaidAmount
      )
    );


  // ============================================================
  // 11. FINAL PAYMENT DUE
  // ============================================================

  // Final payment means everything still unpaid.

  const finalAmountDue =
    outstandingBalance;


  // ============================================================
  // 12. UPDATE BOOKING
  //
  // IMPORTANT:
  // Uses db, which is tx if transaction was supplied.
  // ============================================================

  const updatedBooking =
    await db.booking.update({
      where: {
        id: bookingId,
      },

      data: {
        advanceRequiredAmount,

        additionalChargesTotal,

        totalAmount:
          totalBookingAmount,

        advancePaidAmount,

        finalPaidAmount,

        totalPaidAmount,

        remainingBaseAmount,

        outstandingBalance,

        finalAmountDue,
      },
    });


  // ============================================================
  // 13. RETURN COMPLETE RESULT
  // ============================================================

  return {
    booking:
      updatedBooking,

    baseAmount,

    advanceRequiredAmount,

    additionalChargesTotal,

    totalBookingAmount,

    advancePaidAmount,

    finalPaidAmount,

    totalPaidAmount,

    remainingBaseAmount,

    outstandingBalance,

    finalAmountDue,

    charges,
  };
}


module.exports = {
  toNumber,
  round2,
  computeAdvanceRequired,
  recalculateBookingFinancials,
};
