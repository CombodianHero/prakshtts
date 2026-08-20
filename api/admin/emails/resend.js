/**
 * POST /api/admin/emails/resend   { emailLogId }
 * Re-sends a previously logged email verbatim (subject/recipient),
 * regenerating via the same template + latest booking data, and logs a
 * fresh EmailLog row rather than mutating the old one (Part 33).
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendAndLogEmail } = require("../../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const { emailLogId } = await readJsonBody(req);
  if (!emailLogId) return sendJson(res, 400, { error: "emailLogId is required." });

  const log = await prisma.emailLog.findUnique({ where: { id: emailLogId }, include: { booking: true } });
  if (!log) return sendJson(res, 404, { error: "Email log not found." });
  if (!log.booking) return sendJson(res, 409, { error: "Original booking context is missing; cannot safely resend." });

  const result = await sendAndLogEmail(log.emailType, log.recipient, { booking: log.booking }, log.bookingId);
  sendJson(res, 200, { success: true, email: result });
}));
