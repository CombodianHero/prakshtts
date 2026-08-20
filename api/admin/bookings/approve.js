/**
 * POST /api/admin/bookings/approve
 *
 * Body:
 * {
 *   bookingId,
 *   baseAmount,
 *   advanceMode: "DEFAULT_PERCENT" | "CUSTOM_PERCENT" | "MANUAL_AMOUNT",
 *   advancePercentage?,
 *   manualAdvanceAmount?
 * }
 *
 * Production flow:
 * 1. Validate admin request
 * 2. Validate booking and pricing
 * 3. Calculate advance amount
 * 4. Approve booking
 * 5. Recalculate financial values
 * 6. Create secure ADVANCE payment request
 * 7. Create REQUIRED payment record
 * 8. Add timeline and audit records
 * 9. Commit transaction
 * 10. Build the correct payment.html?token= URL
 * 11. Send payment email
 */

const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");

const {
  computeAdvanceRequired,
  recalculateBookingFinancials,
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

    const {
      bookingId,
      advanceMode = "DEFAULT_PERCENT",
      advancePercentage,
      manualAdvanceAmount,
    } = body;

    const baseAmount = round2(toNumber(body.baseAmount, -1));

    if (!bookingId || typeof bookingId !== "string") {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }

    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
      return sendJson(res, 400, {
        error: "A valid, non-negative base amount is required.",
      });
    }

    // ============================================================
    // 2. VALIDATE ADVANCE MODE
    // ============================================================

    const validAdvanceModes = [
      "DEFAULT_PERCENT",
      "CUSTOM_PERCENT",
      "MANUAL_AMOUNT",
    ];

    if (!validAdvanceModes.includes(advanceMode)) {
      return sendJson(res, 400, {
        error: "Invalid advance mode.",
      });
    }

    if (advanceMode === "CUSTOM_PERCENT") {
      const percentage = toNumber(advancePercentage, 0);

      if (
        !Number.isFinite(percentage) ||
        percentage <= 0 ||
        percentage > 100
      ) {
        return sendJson(res, 400, {
          error: "Advance percentage must be greater than 0 and at most 100.",
        });
      }
    }

    if (advanceMode === "MANUAL_AMOUNT") {
      const manualAmount = round2(
        toNumber(manualAdvanceAmount, -1)
      );

      if (
        !Number.isFinite(manualAmount) ||
        manualAmount <= 0 ||
        manualAmount > baseAmount
      ) {
        return sendJson(res, 400, {
          error:
            "Manual advance amount must be greater than ₹0 and cannot exceed the base amount.",
        });
      }
    }

    // ============================================================
    // 3. LOAD BOOKING
    // ============================================================

    const existing = await prisma.booking.findUnique({
      where: {
        bookingId: bookingId.trim(),
      },
    });

    if (!existing) {
      return sendJson(res, 404, {
        error: "Booking not found.",
      });
    }

    if (existing.bookingStatus !== "PENDING_APPROVAL") {
      return sendJson(res, 409, {
        error: `Booking is already ${existing.bookingStatus}, cannot approve again.`,
      });
    }

    // ============================================================
    // 4. CALCULATE EXPECTED ADVANCE
    // ============================================================

    const effectivePercentage =
      advanceMode === "DEFAULT_PERCENT"
        ? DEFAULT_ADVANCE_PERCENT
        : advanceMode === "CUSTOM_PERCENT"
          ? toNumber(advancePercentage, DEFAULT_ADVANCE_PERCENT)
          : null;

    const calculatedAdvanceAmount = round2(
      computeAdvanceRequired({
        baseAmount,
        advanceMode,
        advancePercentage: effectivePercentage,
        manualAdvanceAmount:
          advanceMode === "MANUAL_AMOUNT"
            ? toNumber(manualAdvanceAmount, 0)
            : undefined,
      })
    );

    if (
      !Number.isFinite(calculatedAdvanceAmount) ||
      calculatedAdvanceAmount <= 0
    ) {
      return sendJson(res, 409, {
        error:
          "Advance payment amount is ₹0. Please configure a valid advance percentage or manual advance amount.",
      });
    }

    // ============================================================
    // 5. DATABASE TRANSACTION
    // ============================================================

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        // --------------------------------------------------------
        // Approve and save initial pricing.
        // --------------------------------------------------------

        const updated = await tx.booking.update({
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

            advanceRequiredAmount:
              calculatedAdvanceAmount,

            bookingStatus: "APPROVED",

            paymentStatus:
              "ADVANCE_PAYMENT_REQUIRED",

            approvedAt: new Date(),
          },
        });

        // --------------------------------------------------------
        // Recalculate all financial fields using THIS transaction.
        // --------------------------------------------------------

        const recalculated =
          await recalculateBookingFinancials(
            updated.id,
            tx
          );

        // --------------------------------------------------------
        // IMPORTANT:
        // Read the advance amount safely from the recalculated
        // values first, then fall back to the stored calculated value.
        // --------------------------------------------------------

        const advanceAmount = round2(
          Number(
            recalculated?.advanceRequiredAmount ??
            recalculated?.advanceAmount ??
            updated.advanceRequiredAmount ??
            calculatedAdvanceAmount ??
            0
          )
        );

        if (
          !Number.isFinite(advanceAmount) ||
          advanceAmount <= 0
        ) {
          throw Object.assign(
            new Error(
              "Advance payment amount is ₹0. Configure the advance amount or percentage before creating the payment request."
            ),
            {
              statusCode: 409,
            }
          );
        }

        // --------------------------------------------------------
        // Generate ONE secure token.
        // This exact token is saved in DB and later sent by email.
        // --------------------------------------------------------

        const secureToken = generateSecureToken();

        // --------------------------------------------------------
        // Create ADVANCE payment request.
        // --------------------------------------------------------

        const paymentRequest =
          await tx.paymentRequest.create({
            data: {
              bookingId: updated.id,

              paymentStage: "ADVANCE",

              // Never use 0 here.
              amount: advanceAmount,

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

        // --------------------------------------------------------
        // Create REQUIRED payment record.
        // --------------------------------------------------------

        await tx.payment.create({
          data: {
            bookingId: updated.id,

            paymentStage: "ADVANCE",

            // Same amount as PaymentRequest.
            amount: advanceAmount,

            status: "REQUIRED",

            paymentRequestId:
              paymentRequest.id,
          },
        });

        // --------------------------------------------------------
        // Timeline
        // --------------------------------------------------------

        await addTimelineEvent(
          updated.id,
          "BOOKING_APPROVED",
          { tx }
        );

        await addTimelineEvent(
          updated.id,
          "ADVANCE_PAYMENT_REQUIRED",
          { tx }
        );

        // --------------------------------------------------------
        // Audit
        // --------------------------------------------------------

        await addAuditLog(
          {
            adminId: session.adminId,

            actionType:
              "BOOKING_APPROVED",

            entityType: "Booking",

            entityId: updated.id,

            oldValue: {
              bookingStatus:
                existing.bookingStatus,

              baseAmount:
                Number(existing.baseAmount || 0),
            },

            newValue: {
              bookingStatus: "APPROVED",

              baseAmount,

              advanceMode,

              advancePercentage:
                effectivePercentage,

              advanceRequiredAmount:
                advanceAmount,

              paymentRequestId:
                paymentRequest.id,
            },
          },
          tx
        );

        return {
          bookingId: updated.id,

          paymentRequest,

          advanceAmount,

          recalculated,
        };
      },
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );

    // ============================================================
    // 6. BUILD PAYMENT URL AFTER TRANSACTION
    // ============================================================

    const appUrl = String(
      process.env.APP_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");

    if (!appUrl) {
      throw Object.assign(
        new Error(
          "APP_URL environment variable is missing."
        ),
        {
          statusCode: 500,
        }
      );
    }

    // IMPORTANT:
    // Correct URL for your application:
    //
    // https://your-domain/payment.html?token=SECURE_TOKEN
    //
    // NOT:
    // /payment/SECURE_TOKEN
    // ============================================================

    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(
        transactionResult.paymentRequest.secureToken
      );

    // ============================================================
    // 7. RELOAD BOOKING FOR EMAIL
    // ============================================================

    const freshBooking =
      await prisma.booking.findUnique({
        where: {
          id: transactionResult.bookingId,
        },
      });

    if (!freshBooking) {
      throw Object.assign(
        new Error(
          "Booking could not be found after approval."
        ),
        {
          statusCode: 500,
        }
      );
    }

    const advanceAmount =
      transactionResult.advanceAmount;

    const remainingBaseAmount =
      round2(baseAmount - advanceAmount);

    // ============================================================
    // 8. SEND EMAIL
    //
    // The email gets the SAME token stored in the database.
    // ============================================================

    await sendAndLogEmail(
      "booking_approved_payment_required",

      freshBooking.customerEmail,

      {
        booking: {
          ...freshBooking,

          baseAmount,

          advanceRequiredAmount:
            advanceAmount,

          advanceAmount,

          remainingBaseAmount,
        },

        advanceAmount,

        advanceRequiredAmount:
          advanceAmount,

        remainingBaseAmount,

        paymentUrl,

        paymentToken:
          transactionResult.paymentRequest
            .secureToken,

        paymentLinkExpiresAt:
          transactionResult.paymentRequest
            .expiresAt,
      },

      freshBooking.id
    );

    // ============================================================
    // 9. SUCCESS RESPONSE
    // ============================================================

    return sendJson(res, 200, {
      success: true,

      message:
        "Booking approved and advance payment request created successfully.",

      booking: {
        ...freshBooking,

        baseAmount,

        advanceRequiredAmount:
          advanceAmount,
      },

      payment: {
        stage: "ADVANCE",

        amount: advanceAmount,

        token:
          transactionResult.paymentRequest
            .secureToken,

        expiresAt:
          transactionResult.paymentRequest
            .expiresAt,
      },

      paymentUrl,
    });
  })
);
