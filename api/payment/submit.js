/**
 * POST /api/payment/submit
 *
 * multipart/form-data:
 *
 * token
 * transactionReference (optional)
 * receipt
 */

const Busboy = require("busboy");

const { prisma } = require("../../lib/db");
const { uploadReceipt } = require("../../lib/blob");
const { addTimelineEvent } = require("../../lib/timeline");

const {
  sendJson,
  methodGuard,
  withErrorHandling,
} = require("../../lib/apiUtils");

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      return reject(
        createError(
          "Expected multipart/form-data with a receipt file.",
          400
        )
      );
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 8 * 1024 * 1024,
        files: 1,
      },
    });

    const fields = {};
    let file = null;
    let fileTooLarge = false;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== "receipt") {
        stream.resume();
        return;
      }

      const chunks = [];

      stream.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        fileTooLarge = true;
      });

      stream.on("error", reject);

      stream.on("end", () => {
        if (!fileTooLarge) {
          file = {
            buffer: Buffer.concat(chunks),
            mimeType: info.mimeType,
            filename: info.filename || "receipt",
          };
        }
      });
    });

    busboy.on("filesLimit", () => {
      reject(createError("Only one receipt file is allowed.", 400));
    });

    busboy.on("error", reject);

    busboy.on("finish", () => {
      if (fileTooLarge) {
        return reject(
          createError(
            "File too large. Maximum receipt size is 8 MB.",
            400
          )
        );
      }

      resolve({ fields, file });
    });

    req.pipe(busboy);
  });
}

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const { fields, file } = await parseMultipart(req);

  const token = String(fields.token || "").trim();
  const transactionReference = String(
    fields.transactionReference || ""
  ).trim();

  if (!token) {
    return sendJson(res, 400, {
      error: "Missing payment token.",
    });
  }

  if (!file) {
    return sendJson(res, 400, {
      error:
        "Please attach a receipt file (JPG, PNG, WEBP, or PDF).",
    });
  }

  const paymentRequest =
    await prisma.paymentRequest.findUnique({
      where: {
        secureToken: token,
      },
      include: {
        booking: true,
      },
    });

  if (!paymentRequest) {
    return sendJson(res, 404, {
      error: "This payment link is invalid.",
    });
  }

  if (paymentRequest.status !== "ACTIVE") {
    return sendJson(res, 410, {
      error: "This payment link is no longer active.",
    });
  }

  if (
    paymentRequest.expiresAt &&
    new Date(paymentRequest.expiresAt).getTime() < Date.now()
  ) {
    await prisma.paymentRequest.update({
      where: {
        id: paymentRequest.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    return sendJson(res, 410, {
      error:
        "This payment link has expired. Please contact us for a new one.",
    });
  }

  if (Number(paymentRequest.amount) <= 0) {
    return sendJson(res, 409, {
      error:
        "This payment request has an invalid amount. Please contact Prakash Tour & Travels.",
    });
  }

  const existingPending = await prisma.payment.findFirst({
    where: {
      paymentRequestId: paymentRequest.id,
      status: "UNDER_VERIFICATION",
    },
  });

  if (existingPending) {
    return sendJson(res, 200, {
      success: true,
      alreadySubmitted: true,
      message:
        "Your payment proof was already submitted and is under verification.",
    });
  }

  const uploaded = await uploadReceipt(
    file.buffer,
    file.mimeType,
    paymentRequest.booking.bookingId,
    file.filename
  );

  const payment = await prisma.$transaction(
    async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: paymentRequest.bookingId,
          paymentStage: paymentRequest.paymentStage,
          paymentType: "MANUAL_UPI",
          amount: Number(paymentRequest.amount),
          status: "UNDER_VERIFICATION",
          paymentRequestId: paymentRequest.id,
          transactionReference:
            transactionReference || null,

          // IMPORTANT:
          // Store pathname for private Blob retrieval.
          receiptUrl: uploaded.pathname,
          receiptFileName: uploaded.fileName,

          submittedAt: new Date(),
        },
      });

      const overallStatus =
        paymentRequest.paymentStage === "ADVANCE"
          ? "ADVANCE_PAYMENT_UNDER_VERIFICATION"
          : "FINAL_PAYMENT_UNDER_VERIFICATION";

      await tx.booking.update({
        where: {
          id: paymentRequest.bookingId,
        },
        data: {
          paymentStatus: overallStatus,
        },
      });

      await addTimelineEvent(
        paymentRequest.bookingId,
        paymentRequest.paymentStage === "ADVANCE"
          ? "ADVANCE_PAYMENT_SUBMITTED"
          : "FINAL_PAYMENT_SUBMITTED",
        { tx }
      );

      return created;
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );

  return sendJson(res, 201, {
    success: true,
    message:
      "Your payment proof has been submitted and is now under verification.",
    paymentId: payment.id,
  });
});
