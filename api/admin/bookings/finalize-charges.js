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
 * 2. Validate booking
 * 3. Validate APP_URL
 * 4. Verify trip is completed
 * 5. Prevent duplicate active final payment request
 * 6. Recalculate financial values inside one transaction
 * 7. Create secure FINAL payment request
 * 8. Create REQUIRED payment record
 * 9. Update booking payment status
 * 10. Add timeline and audit records
 * 11. Reload latest booking and charges
 * 12. Build correct URL: /payment.html?token=...
 * 13. Normalize charge labels for email
 * 14. Send final-payment email
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
    // 1. READ AND VALIDATE REQUEST
    // ============================================================

    const body = await readJsonBody(req);
    const bookingId =
      typeof body?.bookingId === "string"
        ? body.bookingId.trim()
        : "";

    if (!bookingId) {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }

    // ============================================================
    // 2. VALIDATE PUBLIC APPLICATION URL
    // ============================================================

    const appUrl = (process.env.APP_URL || "")
      .trim()
      .replace(/\/+$/, "");

    if (!appUrl) {
      return sendJson(res, 500, {
        error:
          "APP_URL environment variable is missing. Set it to your public application URL.",
      });
    }

    if (!/^https?:\/\//i.test(appUrl)) {
      return sendJson(res, 500, {
        error:
          "APP_URL must start with http:// or https://",
      });
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
    // 4. VALIDATE TRIP STATUS
    // ============================================================

    if (booking.tripStatus !== "TRAVEL_COMPLETED") {
      return sendJson(res, 409, {
        error:
          "Trip must be marked Travel Completed before finalizing charges.",
      });
    }

    // ============================================================
    // 5. PREVENT DUPLICATE ACTIVE FINAL PAYMENT LINK
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
      const existingPaymentUrl =
        `${appUrl}/payment.html?token=` +
        encodeURIComponent(existingActiveFinal.secureToken);

      return sendJson(res, 409, {
        error: "A final payment request is already active for this booking.",
        paymentUrl: existingPaymentUrl,
        expiresAt: existingActiveFinal.expiresAt,
      });
    }

    // ============================================================
    // 6. CREATE FINAL PAYMENT REQUEST IN TRANSACTION
    // ============================================================

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        /*
         * IMPORTANT:
         * recalculateBookingFinancials MUST use the supplied `tx`
         * for all Prisma queries when tx is provided.
         */
        const recalced = await recalculateBookingFinancials(
          booking.id,
          tx
        );

        const outstandingBalance = Number(
          recalced?.outstandingBalance || 0
        );

        const finalAmountDue = Number(
          recalced?.finalAmountDue || 0
        );

        if (
          !Number.isFinite(outstandingBalance) ||
          !Number.isFinite(finalAmountDue)
        ) {
          throw Object.assign(
            new Error("Invalid financial calculation result."),
            { statusCode: 500 }
          );
        }

        if (outstandingBalance <= 0 || finalAmountDue <= 0) {
          throw Object.assign(
            new Error(
              "Outstanding balance is already ₹0 — no final payment is needed."
            ),
            { statusCode: 409 }
          );
        }

        // Update booking status.
        const updatedBooking = await tx.booking.update({
          where: {
            id: booking.id,
          },
          data: {
            paymentStatus: "FINAL_PAYMENT_REQUIRED",
          },
        });

        // Generate a new secure token.
        const secureToken = generateSecureToken();

        if (
          !secureToken ||
          typeof secureToken !== "string"
        ) {
          throw new Error(
            "Secure payment token generation failed."
          );
        }

        // Token expiry.
        const expiresAt = new Date(
          Date.now() +
          PAYMENT_LINK_TTL_DAYS *
          24 *
          60 *
          60 *
          1000
        );

        // Create payment request.
        const paymentRequest =
          await tx.paymentRequest.create({
            data: {
              bookingId: booking.id,
              paymentStage: "FINAL",
              amount: finalAmountDue,
              secureToken,
              status: "ACTIVE",
              expiresAt,
            },
          });

        // Create REQUIRED payment row.
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            paymentStage: "FINAL",
            amount: finalAmountDue,
            status: "REQUIRED",
            paymentRequestId: paymentRequest.id,
          },
        });

        // Timeline.
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
            actionType:
              "FINAL_PAYMENT_REQUEST_CREATED",
            entityType: "Booking",
            entityId: booking.id,
            oldValue: null,
            newValue: {
              paymentStage: "FINAL",
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
          recalced: {
            ...recalced,
            outstandingBalance,
            finalAmountDue,
          },
        };
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    const {
      updatedBooking,
      paymentRequest,
      recalced,
    } = transactionResult;

    // ============================================================
    // 7. BUILD THE EXACT PAYMENT URL
    //
    // Correct:
    // https://your-domain/payment.html?token=ABC
    //
    // Incorrect:
    // /payment/ABC
    // /payment.html?token=BOOKING-ID
    // ============================================================

    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(paymentRequest.secureToken);

    // ============================================================
    // 8. RELOAD LATEST BOOKING DATA
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
          "Final payment was created, but the booking could not be reloaded."
        ),
        { statusCode: 500 }
      );
    }

    // ============================================================
    // 9. NORMALIZE ADDITIONAL CHARGES
    //
    // Prevents "undefined" in the email.
    // ============================================================

    const normalizedCharges =
      (freshBooking.charges || []).map((charge) => {
        const label =
          [
            charge.description,
            charge.name,
            charge.category,
            charge.type,
          ].find(
            (value) =>
              typeof value === "string" &&
              value.trim().length > 0
          ) || "Additional Charge";

        return {
          id: charge.id,
          label,
          description: label,
          name: label,
          amount: Number(charge.amount || 0),
        };
      });

    // ============================================================
    // 10. FINANCIAL VALUES FOR EMAIL
    // ============================================================

    const remainingBaseAmount = Number(
      recalced.outstandingBalance || 0
    );

    const finalAmountDue = Number(
      paymentRequest.amount || 0
    );

    // ============================================================
    // 11. SEND EMAIL
    //
    // Email is intentionally outside the database transaction.
    // Therefore an email provider failure cannot roll back or
    // corrupt an already-created payment request.
    // ============================================================

    let emailSent = false;
    let emailError = null;

    try {
      await sendAndLogEmail(
        "final_payment_required",
        freshBooking.customerEmail,
        {
          booking: {
            ...freshBooking,
            finalAmountDue,
            remainingBaseAmount,
          },

          charges: normalizedCharges,
          additionalCharges: normalizedCharges,

          remainingBaseAmount,
          finalAmountDue,

          // Correct complete URL with secure token.
          paymentUrl,

          // Available for templates that construct URLs themselves.
          paymentToken: paymentRequest.secureToken,
          secureToken: paymentRequest.secureToken,

          paymentLinkExpiresAt:
            paymentRequest.expiresAt,
        },
        freshBooking.id
      );

      emailSent = true;
    } catch (error) {
      console.error(
        "[finalize-charges] Final payment email failed:",
        error
      );

      emailError =
        "Final payment request was created successfully, but the email could not be sent.";
    }

    // ============================================================
    // 12. SUCCESS RESPONSE
    // ============================================================

    return sendJson(res, 200, {
      success: true,

      message: emailSent
        ? "Final charges were finalized and the final payment link was sent to the customer."
        : "Final charges were finalized and the payment link was created. The customer email could not be sent.",

      emailSent,
      emailError,

      booking: updatedBooking,

      payment: {
        stage: "FINAL",
        amount: finalAmountDue,
        expiresAt: paymentRequest.expiresAt,
        token: paymentRequest.secureToken,
      },

      paymentUrl,
    });
  })
);
