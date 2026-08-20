/**
 * lib/mailer.js
 * Every outbound email in the system should go through sendAndLogEmail()
 * so that (a) it's actually sent via the real Resend API, server-side
 * only, and (b) it's permanently recorded in EmailLog (Part 2.10 / 33),
 * regardless of whether Resend reports success or failure.
 */
const { prisma } = require("./db");
const { sendEmail } = require("../api/_lib/resend");
const { TEMPLATES } = require("../api/_lib/emailTemplates");

const BUSINESS = {
  name: "Prakash Tour & Travels",
  phone: process.env.BUSINESS_PHONE || "8409150824",
  whatsapp: process.env.BUSINESS_WHATSAPP || "918409150824",
  email: process.env.BUSINESS_EMAIL || "info@prakashtourtravels.in",
  address: "Near Sasaram Railway Station, Sasaram, Bihar",
};

/**
 * @param {string} emailType - key into TEMPLATES (see api/_lib/emailTemplates.js)
 * @param {string} recipient
 * @param {object} templateData - passed to the template function, minus business/appUrl
 * @param {string|null} bookingId - internal Booking.id, for EmailLog linkage
 */
async function sendAndLogEmail(emailType, recipient, templateData, bookingId = null) {
  const templateFn = TEMPLATES[emailType];
  if (!templateFn) {
    console.warn(`[mailer] No template registered for emailType "${emailType}" — skipping send, logging as FAILED.`);
    return prisma.emailLog.create({
      data: {
        bookingId,
        emailType,
        recipient: recipient || "unknown",
        subject: `(no template: ${emailType})`,
        status: "FAILED",
        errorMessage: `No email template registered for "${emailType}"`,
      },
    });
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const { subject, html } = templateFn({ business: BUSINESS, appUrl, ...templateData });

  const result = await sendEmail(recipient, subject, html);

  return prisma.emailLog.create({
    data: {
      bookingId,
      emailType,
      recipient,
      subject,
      resendMessageId: result.success ? result.id : null,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.success ? null : result.error,
      sentAt: result.success ? new Date() : null,
    },
  });
}

module.exports = { sendAndLogEmail, BUSINESS };
