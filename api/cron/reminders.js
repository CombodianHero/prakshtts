/**
 * GET /api/cron/reminders
 * Manual/external-trigger entry point for the reminder job (still handy
 * for testing, or if you'd rather trigger this from Koyeb's own Cron Job
 * service type hitting this URL instead of the in-process scheduler in
 * server.js). Protected by CRON_SECRET so it can't be triggered publicly.
 *
 * The actual logic lives in runReminders() below, which server.js also
 * calls directly on an in-process node-cron schedule — Koyeb runs this
 * app as a persistent container, unlike Vercel's ephemeral functions, so
 * there's no need for external cron infrastructure at all unless you
 * prefer it.
 *
 * Sends at most one reminder per booking/stage per MIN_GAP_HOURS window.
 */
const { prisma } = require("../../lib/db");
const { sendAndLogEmail } = require("../../lib/mailer");
const { sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

const MIN_GAP_HOURS = 24;
const REMIND_AFTER_HOURS = 24; // don't nag within the first day

async function runReminders() {
  const cutoff = new Date(Date.now() - REMIND_AFTER_HOURS * 60 * 60 * 1000);

  const requests = await prisma.paymentRequest.findMany({
    where: { status: "ACTIVE", createdAt: { lt: cutoff }, expiresAt: { gt: new Date() } },
    include: { booking: true },
  });

  let sent = 0;
  for (const reqRow of requests) {
    const paidStatuses = reqRow.paymentStage === "ADVANCE" ? ["ADVANCE_PAID", "FULLY_PAID"] : ["FULLY_PAID"];
    if (paidStatuses.includes(reqRow.booking.paymentStatus)) continue;

    const lastReminder = await prisma.reminderLog.findFirst({
      where: { bookingId: reqRow.bookingId, stage: reqRow.paymentStage },
      orderBy: { sentAt: "desc" },
    });
    if (lastReminder && Date.now() - new Date(lastReminder.sentAt).getTime() < MIN_GAP_HOURS * 60 * 60 * 1000) continue;

    const paymentUrl = `${process.env.APP_URL || ""}/payment/${reqRow.secureToken}`;
    await sendAndLogEmail(
      reqRow.paymentStage === "ADVANCE" ? "booking_approved_payment_required" : "final_payment_required",
      reqRow.booking.customerEmail,
      { booking: reqRow.booking, paymentUrl, finalAmountDue: Number(reqRow.amount) },
      reqRow.bookingId
    );
    await prisma.reminderLog.create({ data: { bookingId: reqRow.bookingId, stage: reqRow.paymentStage } });
    sent += 1;
  }

  return sent;
}

const handler = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return sendJson(res, 401, { error: "Unauthorized." });
    }
  }

  const sent = await runReminders();
  sendJson(res, 200, { success: true, remindersSent: sent });
});

module.exports = handler;
module.exports.runReminders = runReminders;
