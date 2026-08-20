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


    const body = await readJsonBody(req);

    const bookingId =
      typeof body.bookingId === "string"
        ? body.bookingId.trim()
        : "";


    if (!bookingId) {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }


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


    const booking =
      await prisma.booking.findUnique({
        where: {
          bookingId,
        },
      });


    if (!booking) {
      return sendJson(res, 404, {
        error: "Booking not found.",
      });
    }


    if (
      booking.tripStatus !==
      "TRAVEL_COMPLETED"
    ) {
      return sendJson(res, 409, {
        error:
          "Trip must be marked Travel Completed before finalizing charges.",
      });
    }


    const existingActiveFinal =
      await prisma.paymentRequest.findFirst({
        where: {
          bookingId:
            booking.id,

          paymentStage:
            "FINAL",

          status:
            "ACTIVE",
        },
      });


    if (existingActiveFinal) {
      return sendJson(res, 409, {
        error:
          "A final payment request is already active for this booking.",
      });
    }


    const secureToken =
      generateSecureToken();


    const expiresAt =
      new Date(
        Date.now() +
        PAYMENT_LINK_TTL_DAYS *
        24 *
        60 *
        60 *
        1000
      );


    const result =
      await prisma.$transaction(
        async (tx) => {

          // IMPORTANT:
          // recalculateBookingFinancials MUST use tx when supplied.

          const recalculated =
            await recalculateBookingFinancials(
              booking.id,
              tx
            );


          const finalAmountDue =
            Number(
              recalculated.finalAmountDue || 0
            );


          if (
            !Number.isFinite(finalAmountDue) ||
            finalAmountDue <= 0
          ) {
            throw Object.assign(
              new Error(
                "Final payment amount is ₹0. No final payment request is required."
              ),
              {
                statusCode: 409,
              }
            );
          }


          const updatedBooking =
            await tx.booking.update({
              where: {
                id: booking.id,
              },

              data: {
                paymentStatus:
                  "FINAL_PAYMENT_REQUIRED",
              },
            });


          const paymentRequest =
            await tx.paymentRequest.create({
              data: {
                bookingId:
                  booking.id,

                paymentStage:
                  "FINAL",

                amount:
                  finalAmountDue,

                secureToken,

                status:
                  "ACTIVE",

                expiresAt,
              },
            });


          await tx.payment.create({
            data: {
              bookingId:
                booking.id,

              paymentStage:
                "FINAL",

              paymentType:
                "MANUAL_UPI",

              amount:
                finalAmountDue,

              status:
                "REQUIRED",

              paymentRequestId:
                paymentRequest.id,
            },
          });


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


          await addAuditLog(
            {
              adminId:
                session.adminId,

              actionType:
                "FINAL_PAYMENT_REQUEST_CREATED",

              entityType:
                "Booking",

              entityId:
                booking.id,

              oldValue:
                null,

              newValue: {
                finalAmountDue,
                paymentRequestId:
                  paymentRequest.id,
              },
            },
            tx
          );


          return {
            updatedBooking,
            paymentRequest,
            recalculated,
          };
        },
        {
          maxWait: 10000,
          timeout: 20000,
        }
      );


    // Reload AFTER transaction.
    // Do not use base prisma queries from inside the tx helper incorrectly.

    const freshBooking =
      await prisma.booking.findUnique({
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
          "Booking not found after final payment creation."
        ),
        {
          statusCode: 500,
        }
      );
    }


    const {
      updatedBooking,
      paymentRequest,
      recalculated,
    } = result;


    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(
        paymentRequest.secureToken
      );


    const normalizedCharges =
      (freshBooking.charges || []).map(
        (charge) => {

          const label =
            charge.description ||
            charge.name ||
            charge.category ||
            charge.type ||
            "Additional Charge";


          return {
            ...charge,

            label,

            description:
              label,

            amount:
              Number(
                charge.amount || 0
              ),
          };
        }
      );


    const baseAmount =
      Number(
        freshBooking.baseAmount || 0
      );


    const advancePaid =
      Number(
        recalculated.advancePaidAmount ||
        freshBooking.advancePaidAmount ||
        0
      );


    const remainingBaseAmount =
      Math.max(
        0,
        baseAmount - advancePaid
      );


    const finalAmountDue =
      Number(
        paymentRequest.amount || 0
      );


    try {
      await sendAndLogEmail(
        "final_payment_required",

        freshBooking.customerEmail,

        {
          booking: {
            ...freshBooking,

            baseAmount,

            advancePaid,

            remainingBaseAmount,

            finalAmountDue,
          },

          charges:
            normalizedCharges,

          additionalCharges:
            normalizedCharges,

          baseAmount,

          advancePaid,

          remainingBaseAmount,

          finalAmountDue,

          paymentUrl,

          paymentToken:
            paymentRequest.secureToken,

          paymentLinkExpiresAt:
            paymentRequest.expiresAt,
        },

        freshBooking.id
      );
    } catch (emailError) {

      console.error(
        "[final payment email error]",
        emailError
      );
    }


    return sendJson(res, 200, {
      success: true,

      message:
        "Final charges finalized and payment request created successfully.",

      booking:
        updatedBooking,

      payment: {
        stage:
          "FINAL",

        amount:
          finalAmountDue,

        token:
          paymentRequest.secureToken,

        expiresAt:
          paymentRequest.expiresAt,
      },

      paymentUrl,
    });
  })
);
