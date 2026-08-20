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

function getAppUrl() {
  const appUrl = String(process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!appUrl) {
    const error = new Error(
      "APP_URL environment variable is missing."
    );

    error.statusCode = 500;
    throw error;
  }

  return appUrl;
}

function getChargeLabel(charge) {
  return (
    charge.description ||
    charge.name ||
    charge.category ||
    charge.type ||
    "Additional Charge"
  );
}

module.exports = withErrorHandling(
  requireAdmin(async (req, res, session) => {
    if (!methodGuard(req, res, "POST")) return;

    const body = await readJsonBody(req);
    const bookingId = String(body.bookingId || "").trim();

    if (!bookingId) {
      return sendJson(res, 400, {
        error: "bookingId is required.",
      });
    }

    const appUrl = getAppUrl();

    const booking = await prisma.booking.findUnique({
      where: {
        bookingId,
      },
      include: {
        charges: true,
        customer: true,
      },
    });

    if (!booking) {
      return sendJson(res, 404, {
        error: "Booking not found.",
      });
    }

    if (booking.tripStatus !== "TRAVEL_COMPLETED") {
      return sendJson(res, 409, {
        error:
          "Trip must be marked Travel Completed before finalizing charges.",
      });
    }

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
        error:
          "A final payment request is already active for this booking.",
        paymentUrl: existingPaymentUrl,
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const recalced =
          await recalculateBookingFinancials(
            booking.id,
            tx
          );

        const outstandingBalance = Number(
          recalced.outstandingBalance || 0
        );

        const finalAmountDue = Number(
          recalced.finalAmountDue ||
          recalced.outstandingBalance ||
          0
        );

        if (finalAmountDue <= 0) {
          const error = new Error(
            "Outstanding balance is ₹0. No final payment is required."
          );

          error.statusCode = 409;
          throw error;
        }

        const secureToken = generateSecureToken();

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

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            paymentStage: "FINAL",
            amount: finalAmountDue,
            status: "REQUIRED",
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
            adminId: session.adminId,
            actionType:
              "FINAL_PAYMENT_REQUEST_CREATED",
            entityType: "Booking",
            entityId: booking.id,
            oldValue: null,
            newValue: {
              amount: finalAmountDue,
              outstandingBalance,
              paymentRequestId:
                paymentRequest.id,
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

    const freshBooking =
      await prisma.booking.findUnique({
        where: {
          id: booking.id,
        },
        include: {
          charges: true,
          customer: true,
        },
      });

    if (!freshBooking) {
      throw new Error(
        "Booking could not be reloaded."
      );
    }

    const paymentUrl =
      `${appUrl}/payment.html?token=` +
      encodeURIComponent(
        result.paymentRequest.secureToken
      );

    const normalizedCharges =
      (freshBooking.charges || []).map(
        (charge) => ({
          id: charge.id,
          label: getChargeLabel(charge),
          description: getChargeLabel(charge),
          amount: Number(charge.amount || 0),
        })
      );

    const finalAmountDue = Number(
      result.paymentRequest.amount
    );

    // IMPORTANT:
    // outstandingBalance can be confused with finalAmountDue
    // after extra charges. Calculate the base remaining amount.
    const additionalChargesTotal =
      normalizedCharges.reduce(
        (total, charge) =>
          total + Number(charge.amount || 0),
        0
      );

    const remainingBaseAmount = Math.max(
      0,
      finalAmountDue - additionalChargesTotal
    );

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
          additionalCharges:
            normalizedCharges,

          remainingBaseAmount,
          finalAmountDue,

          paymentUrl,
          paymentToken:
            result.paymentRequest.secureToken,

          paymentLinkExpiresAt:
            result.paymentRequest.expiresAt,
        },
        freshBooking.id
      );

      emailSent = true;
    } catch (error) {
      console.error(
        "[Final payment email error]",
        error
      );

      emailError =
        "Payment request was created, but the email could not be sent.";
    }

    return sendJson(res, 200, {
      success: true,

      message: emailSent
        ? "Final payment request created and emailed successfully."
        : "Final payment request was created successfully. Email delivery failed.",

      emailSent,
      emailError,

      booking: result.updatedBooking,

      payment: {
        stage: "FINAL",
        amount: finalAmountDue,
        token:
          result.paymentRequest.secureToken,
        expiresAt:
          result.paymentRequest.expiresAt,
      },

      paymentUrl,
    });
  })
);
