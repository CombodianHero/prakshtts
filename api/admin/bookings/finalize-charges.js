/**
 * POST /api/admin/bookings/finalize-charges
 *
 * Body:
 * {
 *   "bookingId": "TRV-2026-00003"
 * }
 *
 * Production final-payment flow:
 * 1. Verify admin
 * 2. Verify booking and trip completion
 * 3. Prevent duplicate active final-payment links
 * 4. Recalculate all financial values server-side
 * 5. Create secure final-payment request
 * 6. Create REQUIRED payment record
 * 7. Update booking status
 * 8. Add timeline and audit records
 * 9. Reload latest booking + charges
 * 10. Build correct payment URL
 * 11. Normalize charge labels to prevent "undefined"
 * 12. Send itemized final-payment email
 */

const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { recalculateBookingFinancials } = require("../../../lib/calc");
const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { generateSecureToken } = require("../../../lib/ids");
const { sendAndLogEmail } = require("../../../lib/mailer");

const {
  readJsonBody,
  sendJson,
  methodGuard,
  withErrorHandling,
} = require("../../../lib/apiUtils");

const PAYMENT_LINK_TTL_DAYS = 7;

module.exports = withErrorHandling(
  requireAdmin(async (req, res, session) => {
    if (!methodGuard(req, res, "POST")) return;

    // ============================================================
    // 1. READ REQUEST
    // ============================================================

    const { bookingId } = await readJsonBody(req);

    if (!bookingId || typeof bookingId !== "string") {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }

    // ============================================================
    // 2. APP URL VALIDATION
    // ============================================================

    const appUrl = (process.env.APP_URL || "").trim().replace(/\/$/, "");

    if (!appUrl) {
      throw Object.assign(
        new Error(
          "APP_URL environment variable is missing. Add your public Koyeb domain to the environment variables."
        ),
        { statusCode: 500 }
      );
    }

    // ============================================================
    // 3. LOAD BOOKING
    // ============================================================

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: {
        charges: true,
      },
    });

    if (!booking) {
      return sendJson(res, 404, {
        error: "Booking not found.",
      });
    }

    // ============================================================
    // 4. ONLY ALLOW AFTER TRAVEL COMPLETION
    // ============================================================

    if (booking.tripStatus !== "TRAVEL_COMPLETED") {
      return sendJson(res, 409, {
        error:
          "Trip must be marked Travel Completed before finalizing charges.",
      });
    }

    // ============================================================
    // 5. PREVENT DUPLICATE ACTIVE FINAL PAYMENT REQUEST
    // ============================================================

    const existingActiveFinal =
      await prisma.paymentRequest.findFirst({
        where: {
          bookingId: booking.id,
          paymentStage: "FINAL",
          status: "ACTIVE",
        },
      });

    if (existingActiveFinal) {
      return sendJson(res, 409, {
        error:
          "A final payment request is already active for this booking.",
      });
    }

    // ============================================================
    // 6. DATABASE TRANSACTION
    // ============================================================

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        // Recalculate using the transaction client.
        const recalced = await recalculateBookingFinancials(
          booking.id,
          tx
        );

        const outstandingBalance = Number(
          recalced.outstandingBalance || 0
        );

        const finalAmountDue = Number(
          recalced.finalAmountDue || 0
        );

        // Safety validation.
        if (outstandingBalance <= 0 || finalAmountDue <= 0) {
          throw Object.assign(
            new Error(
              "Outstanding balance is already ₹0 — no final payment is needed."
            ),
            { statusCode: 409 }
          );
        }

        // Update booking payment status.
        const updatedBooking = await tx.booking.update({
          where: {
            id: booking.id,
          },
          data: {
            paymentStatus: "FINAL_PAYMENT_REQUIRED",
          },
        });

        // Generate secure payment token.
        const secureToken = generateSecureToken();

        // Create final payment request.
        const paymentRequest =
          await tx.paymentRequest.create({
            data: {
              bookingId: booking.id,
              paymentStage: "FINAL",
              amount: finalAmountDue,
              secureToken,
              status: "ACTIVE",
              expiresAt: new Date(
                Date.now() +
                  PAYMENT_LINK_TTL_DAYS *
                    24 *
                    60 *
                    60 *
                    1000
              ),
            },
          });

        // Create REQUIRED payment record.
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            paymentStage: "FINAL",
            amount: finalAmountDue,
            status: "REQUIRED",
            paymentRequestId: paymentRequest.id,
          },
        });

        // Timeline events.
        await addTimelineEvent(
          booking.id,
          "FINAL_CHARGES_ADDED",
          { tx }
        );

        await addTimelineEvent(
          booking.id,
          "FINAL_PAYMENT_REQUIRED",
          { tx }
        );

        // Audit log.
        await addAuditLog(
          {
            adminId: session.adminId,
            actionType: "FINAL_PAYMENT_REQUEST_CREATED",
            entityType: "Booking",
            entityId: booking.id,
            oldValue: null,
            newValue: {
              finalAmountDue,
              outstandingBalance,
              paymentRequestId: paymentRequest.id,
            },
          },
          tx
        );

        return {
          updatedBooking,
          paymentRequest,
          recalced,
        };
      },
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );

    const {
      updatedBooking,
      paymentRequest,
      recalced,
    } = transactionResult;

    // ============================================================
    // 7. RELOAD CHARGES AFTER TRANSACTION
    //
    // This ensures the email gets current database data.
    // ============================================================

    const freshBooking = await prisma.booking.findUnique({
      where: {
        id: booking.id,
      },
      include: {
        charges: true,
      },
    });

    if (!freshBooking) {
      throw Object.assign(
        new Error(
          "Booking disappeared after final payment request creation."
        ),
        { statusCode: 500 }
      );
    }

    // ============================================================
    // 8. CREATE CORRECT PAYMENT URL
    //
    // IMPORTANT:
    // Your payment page uses:
    // /payment.html?token=TOKEN
    //
    // NOT:
    // /payment/TOKEN
    // ============================================================

    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(paymentRequest.secureToken);

    // ============================================================
    // 9. NORMALIZE CHARGES
    //
    // Prevents "undefined" in the email.
    // The mail template can safely use charge.label and charge.amount.
    // ============================================================

    const normalizedCharges = (freshBooking.charges || []).map(
      (charge) => ({
        id: charge.id,

        label:
          charge.description ||
          charge.name ||
          charge.category ||
          charge.type ||
          "Additional Charge",

        description:
          charge.description ||
          charge.name ||
          charge.category ||
          charge.type ||
          "Additional Charge",

        amount: Number(charge.amount || 0),
      })
    );

    // ============================================================
    // 10. EMAIL DATA
    // ============================================================

    const remainingBaseAmount = Number(
      recalced.outstandingBalance || 0
    );

    const finalAmountDue = Number(
      paymentRequest.amount || 0
    );

    // ============================================================
    // 11. SEND EMAIL
    // ============================================================

    await sendAndLogEmail(
      "final_payment_required",
      freshBooking.customerEmail,
      {
        booking: {
          ...freshBooking,

          finalAmountDue,

          remainingBaseAmount,
        },

        // Keep both names in case the mail template uses either.
        charges: normalizedCharges,
        additionalCharges: normalizedCharges,

        remainingBaseAmount,

        finalAmountDue,

        paymentUrl,

        paymentToken: paymentRequest.secureToken,

        paymentLinkExpiresAt: paymentRequest.expiresAt,
      },
      freshBooking.id
    );

    // ============================================================
    // 12. SUCCESS RESPONSE
    // ============================================================

    return sendJson(res, 200, {
      success: true,

      message:
        "Final charges were finalized and the final payment request was sent to the customer.",

      booking: updatedBooking,

      payment: {
        stage: "FINAL",
        amount: finalAmountDue,
        expiresAt: paymentRequest.expiresAt,
      },

      paymentUrl,
    });
  })
);
