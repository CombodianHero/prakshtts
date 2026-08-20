/**
 * POST /api/admin/bookings/approve
 *
 * Body:
 * {
 *   bookingId: "TRV-2026-00001",
 *   baseAmount: 10000,
 *   advanceMode: "DEFAULT_PERCENT" | "CUSTOM_PERCENT" | "MANUAL_AMOUNT",
 *   advancePercentage: 30,
 *   manualAdvanceAmount: 3000
 * }
 *
 * Production flow:
 * 1. Validate admin and request.
 * 2. Calculate advance amount.
 * 3. Approve booking.
 * 4. Save pricing.
 * 5. Create secure ADVANCE payment request.
 * 6. Create REQUIRED payment record.
 * 7. Add timeline/audit records.
 * 8. Commit database transaction.
 * 9. Build /payment.html?token=SECURE_TOKEN URL.
 * 10. Send email AFTER transaction.
 */

const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");

const {
  computeAdvanceRequired,
  round2,
} = require("../../../lib/calc");

const { addTimelineEvent } = require("../../../lib/timeline");
const { addAuditLog } = require("../../../lib/audit");
const { generateSecureToken } = require("../../../lib/ids");
const { sendAndLogEmail } = require("../../../lib/mailer");

const {
  readJsonBody,
  sendJson,
  methodGuard,
  toNumber,
  withErrorHandling,
} = require("../../../lib/apiUtils");


const DEFAULT_ADVANCE_PERCENT = 30;
const PAYMENT_LINK_TTL_DAYS = 7;


module.exports = withErrorHandling(
  requireAdmin(async (req, res, session) => {
    if (!methodGuard(req, res, "POST")) return;


    // ============================================================
    // 1. READ REQUEST
    // ============================================================

    const body = await readJsonBody(req);

    const bookingId =
      typeof body.bookingId === "string"
        ? body.bookingId.trim()
        : "";

    const advanceMode =
      body.advanceMode || "DEFAULT_PERCENT";

    const baseAmount =
      round2(toNumber(body.baseAmount, -1));


    if (!bookingId) {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }


    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return sendJson(res, 400, {
        error: "baseAmount must be greater than ₹0.",
      });
    }


    const allowedModes = [
      "DEFAULT_PERCENT",
      "CUSTOM_PERCENT",
      "MANUAL_AMOUNT",
    ];

    if (!allowedModes.includes(advanceMode)) {
      return sendJson(res, 400, {
        error:
          "advanceMode must be DEFAULT_PERCENT, CUSTOM_PERCENT, or MANUAL_AMOUNT.",
      });
    }


    // ============================================================
    // 2. VALIDATE ADVANCE SETTINGS
    // ============================================================

    let effectivePercentage = DEFAULT_ADVANCE_PERCENT;
    let manualAdvanceAmount = null;


    if (advanceMode === "CUSTOM_PERCENT") {
      effectivePercentage =
        round2(toNumber(body.advancePercentage, -1));

      if (
        !Number.isFinite(effectivePercentage) ||
        effectivePercentage <= 0 ||
        effectivePercentage > 100
      ) {
        return sendJson(res, 400, {
          error:
            "advancePercentage must be greater than 0 and at most 100.",
        });
      }
    }


    if (advanceMode === "MANUAL_AMOUNT") {
      manualAdvanceAmount =
        round2(toNumber(body.manualAdvanceAmount, -1));

      if (
        !Number.isFinite(manualAdvanceAmount) ||
        manualAdvanceAmount <= 0 ||
        manualAdvanceAmount > baseAmount
      ) {
        return sendJson(res, 400, {
          error:
            "manualAdvanceAmount must be greater than ₹0 and cannot exceed the base amount.",
        });
      }
    }


    // ============================================================
    // 3. CALCULATE ADVANCE BEFORE DATABASE TRANSACTION
    // ============================================================

    const advanceRequiredAmount =
      round2(
        computeAdvanceRequired({
          baseAmount,
          advanceMode,
          advancePercentage: effectivePercentage,
          manualAdvanceAmount,
        })
      );


    // IMPORTANT:
    // Never create a payment request for ₹0.

    if (
      !Number.isFinite(advanceRequiredAmount) ||
      advanceRequiredAmount <= 0
    ) {
      return sendJson(res, 409, {
        error:
          "Advance payment amount is ₹0. Please configure a valid advance amount or percentage.",
      });
    }


    if (advanceRequiredAmount > baseAmount) {
      return sendJson(res, 400, {
        error:
          "Advance payment cannot be greater than the base amount.",
      });
    }


    // ============================================================
    // 4. VALIDATE APP URL
    // ============================================================

    const appUrl =
      String(process.env.APP_URL || "")
        .trim()
        .replace(/\/+$/, "");


    if (!appUrl) {
      throw Object.assign(
        new Error(
          "APP_URL environment variable is missing."
        ),
        { statusCode: 500 }
      );
    }


    // ============================================================
    // 5. LOAD BOOKING
    // ============================================================

    const existing =
      await prisma.booking.findUnique({
        where: {
          bookingId,
        },
      });


    if (!existing) {
      return sendJson(res, 404, {
        error: "Booking not found.",
      });
    }


    if (existing.bookingStatus !== "PENDING_APPROVAL") {
      return sendJson(res, 409, {
        error:
          `Booking is already ${existing.bookingStatus}, cannot approve again.`,
      });
    }


    // ============================================================
    // 6. CREATE TOKEN BEFORE TRANSACTION
    // ============================================================

    const secureToken = generateSecureToken();

    const expiresAt =
      new Date(
        Date.now() +
        PAYMENT_LINK_TTL_DAYS *
        24 *
        60 *
        60 *
        1000
      );


    // ============================================================
    // 7. DATABASE TRANSACTION
    //
    // IMPORTANT:
    // Every database operation inside uses tx.
    // No email/network request inside transaction.
    // ============================================================

    const result =
      await prisma.$transaction(
        async (tx) => {

          const updatedBooking =
            await tx.booking.update({
              where: {
                id: existing.id,
              },

              data: {
                baseAmount,

                advanceMode,

                advancePercentage:
                  advanceMode === "MANUAL_AMOUNT"
                    ? null
                    : effectivePercentage,

                advanceRequiredAmount,

                bookingStatus: "APPROVED",

                paymentStatus:
                  "ADVANCE_PAYMENT_REQUIRED",

                approvedAt:
                  new Date(),
              },
            });


          const paymentRequest =
            await tx.paymentRequest.create({
              data: {
                bookingId:
                  updatedBooking.id,

                paymentStage:
                  "ADVANCE",

                amount:
                  advanceRequiredAmount,

                secureToken,

                status:
                  "ACTIVE",

                expiresAt,
              },
            });


          await tx.payment.create({
            data: {
              bookingId:
                updatedBooking.id,

              paymentStage:
                "ADVANCE",

              paymentType:
                "MANUAL_UPI",

              amount:
                advanceRequiredAmount,

              status:
                "REQUIRED",

              paymentRequestId:
                paymentRequest.id,
            },
          });


          // These helpers MUST use tx internally when { tx } is supplied.

          await addTimelineEvent(
            updatedBooking.id,
            "BOOKING_APPROVED",
            { tx }
          );


          await addTimelineEvent(
            updatedBooking.id,
            "ADVANCE_PAYMENT_REQUIRED",
            { tx }
          );


          await addAuditLog(
            {
              adminId:
                session.adminId,

              actionType:
                "BOOKING_APPROVED",

              entityType:
                "Booking",

              entityId:
                updatedBooking.id,

              oldValue: {
                bookingStatus:
                  existing.bookingStatus,

                baseAmount:
                  Number(existing.baseAmount || 0),
              },

              newValue: {
                bookingStatus:
                  "APPROVED",

                baseAmount,

                advanceMode,

                advancePercentage:
                  advanceMode === "MANUAL_AMOUNT"
                    ? null
                    : effectivePercentage,

                advanceRequiredAmount,
              },
            },
            tx
          );


          return {
            booking:
              updatedBooking,

            paymentRequest,
          };
        },
        {
          maxWait: 10000,
          timeout: 20000,
        }
      );


    const {
      booking,
      paymentRequest,
    } = result;


    // ============================================================
    // 8. BUILD CORRECT PAYMENT URL AFTER TRANSACTION
    //
    // CORRECT:
    // /payment.html?token=TOKEN
    //
    // WRONG:
    // /payment/TOKEN
    // ============================================================

    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(
        paymentRequest.secureToken
      );


    // ============================================================
    // 9. EMAIL AFTER DATABASE TRANSACTION
    // ============================================================

    const emailBooking = {
      ...booking,

      baseAmount:
        Number(baseAmount),

      advanceRequiredAmount:
        Number(advanceRequiredAmount),

      remainingBaseAmount:
        round2(
          baseAmount -
          advanceRequiredAmount
        ),
    };


    try {
      await sendAndLogEmail(
        "booking_approved_payment_required",

        booking.customerEmail,

        {
          booking:
            emailBooking,

          baseAmount:
            Number(baseAmount),

          advanceRequiredAmount:
            Number(advanceRequiredAmount),

          remainingBaseAmount:
            round2(
              baseAmount -
              advanceRequiredAmount
            ),

          paymentUrl,

          paymentToken:
            paymentRequest.secureToken,

          paymentLinkExpiresAt:
            paymentRequest.expiresAt,
        },

        booking.id
      );
    } catch (emailError) {

      console.error(
        "[approve booking email error]",
        emailError
      );

      // Booking/payment request remains valid even if email fails.
    }


    // ============================================================
    // 10. SUCCESS
    // ============================================================

    return sendJson(res, 200, {
      success: true,

      message:
        "Booking approved and advance payment request created successfully.",

      booking,

      payment: {
        stage:
          "ADVANCE",

        amount:
          Number(paymentRequest.amount),

        expiresAt:
          paymentRequest.expiresAt,

        token:
          paymentRequest.secureToken,
      },

      paymentUrl,
    });
  })
);
