/**
 * api/_lib/emailTemplates.js
 * ------------------------------------------------------------
 * Every transactional email the business sends, in one place.
 * Each function takes plain data (never a DB row directly, so
 * this file has no dependency on how data is stored) and returns
 * { subject, html }.
 *
 * Email HTML uses inline styles only (table-based layout) because
 * most email clients strip <style> blocks and ignore flex/grid.
 */

const NAVY = "#0f172a";
const GOLD = "#f59e0b";
const CREAM = "#fafaf9";
const TEXT = "#1c1917";
const MUTED = "#78716c";

function money(n) {
  const num = Number(n || 0);
  return "₹" + num.toLocaleString("en-IN");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) {
    return d;
  }
}

/** Shared branded wrapper. `business` = { name, address, phone, whatsapp, email }. */
function layout({ business, preheader, kicker, heading, bodyHtml, ctaText, ctaUrl, footerNote }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Inter',Arial,sans-serif;color:${TEXT};">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader || ""}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr>
          <td style="background:${NAVY};padding:28px 32px;">
            <span style="font-family:Georgia,serif;font-weight:800;font-size:20px;color:#ffffff;">
              ${business.name.split(" ")[0]} <span style="color:${GOLD};">${business.name.split(" ").slice(1).join(" ")}</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${kicker ? `<p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};font-weight:700;">${kicker}</p>` : ""}
            <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${NAVY};">${heading}</h1>
            <div style="font-size:14px;line-height:1.7;color:${TEXT};">${bodyHtml}</div>
            ${
              ctaText && ctaUrl
                ? `<table cellpadding="0" cellspacing="0" style="margin:26px 0 6px;"><tr><td style="border-radius:8px;background:${GOLD};">
                     <a href="${ctaUrl}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:${NAVY};text-decoration:none;">${ctaText}</a>
                   </td></tr></table>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f4;padding:20px 32px;font-size:12px;color:${MUTED};">
            ${footerNote ? `<p style="margin:0 0 10px;">${footerNote}</p>` : ""}
            <p style="margin:0;">${business.name} · ${business.address}</p>
            <p style="margin:4px 0 0;">${business.phone}${business.email ? " · " + business.email : ""}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label, value) {
  return `<tr><td style="padding:4px 0;color:${MUTED};">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${value}</td></tr>`;
}
function table(rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin:14px 0;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;padding:6px 0;">${rows.join("")}</table>`;
}

/* ------------------------------------------------------------ */
/*  A. BOOKING REQUEST RECEIVED                                  */
/* ------------------------------------------------------------ */
function bookingReceivedEmail({ business, appUrl, booking }) {
  const subject = `Booking Request Received – ${booking.bookingId}`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Thanks for your booking request. Our team is reviewing it now and will confirm pricing shortly.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Pickup → Destination", `${booking.pickup} → ${booking.destination}`),
      row("Travel Date", fmtDate(booking.travelDate)),
      row("Passengers", booking.passengers || "—"),
      booking.totalAmount ? row("Amount", money(booking.totalAmount)) : "",
      row("Status", "Pending Admin Approval"),
    ]) +
    `<p>You can check your booking status anytime using your Booking ID and the email address you provided.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `We've received your booking request ${booking.bookingId}.`,
      kicker: "Booking Received",
      heading: "We've got your request!",
      bodyHtml,
      ctaText: "Check Booking Status",
      ctaUrl: `${appUrl}/booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}`,
      footerNote: "This is an automatic confirmation — no payment has been taken yet.",
    }),
  };
}

/* ------------------------------------------------------------ */
/*  B. BOOKING APPROVED – PAYMENT REQUIRED                       */
/* ------------------------------------------------------------ */
function bookingApprovedPaymentRequiredEmail({ business, appUrl, booking, isReminder }) {
  const subject = isReminder
    ? `Reminder: Payment Required – ${booking.bookingId}`
    : `Your Booking Has Been Approved – Payment Required`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>${isReminder ? "Just a reminder — your" : "Good news! Your"} booking request has been approved${isReminder ? "" : ""}. Please complete your payment to confirm it.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Trip", `${booking.pickup} → ${booking.destination}`),
      row("Travel Date", fmtDate(booking.travelDate)),
      row("Total Amount", money(booking.totalAmount)),
      row("Amount to Pay Now", money(booking.advanceAmount || booking.totalAmount)),
    ]) +
    `<p>Tap the button below to view your secure payment page and pay by UPI/QR.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Payment of ${money(booking.advanceAmount || booking.totalAmount)} required for ${booking.bookingId}.`,
      kicker: isReminder ? "Payment Reminder" : "Booking Approved",
      heading: isReminder ? "Your payment is still pending" : "Your booking is approved!",
      bodyHtml,
      ctaText: "Complete Payment",
      ctaUrl: `${appUrl}/payment.html?token=${encodeURIComponent(booking.paymentToken || booking.bookingId)}`,
      footerNote: "Please complete payment to secure your vehicle for the requested date.",
    }),
  };
}

/* ------------------------------------------------------------ */
/*  C. PAYMENT SUBMITTED                                         */
/* ------------------------------------------------------------ */
function paymentSubmittedEmail({ business, appUrl, booking, amount }) {
  const subject = `Payment Submitted – Under Verification`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>We've received your payment proof and it's now being verified by our team. This usually doesn't take long.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Amount Submitted", money(amount)),
      row("Status", "Payment Under Verification"),
    ]) +
    `<p>We'll email you as soon as it's confirmed.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Your payment for ${booking.bookingId} is under verification.`,
      kicker: "Payment Submitted",
      heading: "Payment received — verifying now",
      bodyHtml,
      ctaText: "Check Booking Status",
      ctaUrl: `${appUrl}/booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  D. PAYMENT APPROVED                                          */
/* ------------------------------------------------------------ */
function paymentApprovedEmail({ business, appUrl, booking }) {
  const subject = `Payment Approved – Your Booking is Confirmed`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Your payment has been verified and approved. Thank you!</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Amount Paid", money(booking.amountPaid)),
      row("Payment Status", "Approved"),
      row("Booking Status", "Confirmed"),
    ]) +
    `<p>Your invoice/receipt is available from your booking status page.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Payment approved for ${booking.bookingId} — your booking is confirmed.`,
      kicker: "Payment Approved",
      heading: "You're all set!",
      bodyHtml,
      ctaText: "View Booking & Invoice",
      ctaUrl: `${appUrl}/booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  E. PAYMENT REJECTED                                          */
/* ------------------------------------------------------------ */
function paymentRejectedEmail({ business, appUrl, booking, reason }) {
  const subject = `Payment Verification Failed – Action Required`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>We weren't able to verify your last payment submission.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Amount", money(booking.advanceAmount || booking.totalAmount)),
      row("Reason", reason || "The submitted proof could not be verified."),
    ]) +
    `<p>Please submit a new payment screenshot or receipt using the button below.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Payment verification failed for ${booking.bookingId}.`,
      kicker: "Action Required",
      heading: "We couldn't verify your payment",
      bodyHtml,
      ctaText: "Pay Again",
      ctaUrl: `${appUrl}/payment.html?token=${encodeURIComponent(booking.paymentToken || booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  F. VEHICLE & DRIVER ASSIGNED                                 */
/* ------------------------------------------------------------ */
function vehicleDriverAssignedEmail({ business, appUrl, booking, vehicle, driver, isUpdate }) {
  const subject = isUpdate
    ? `Important: Your Vehicle/Driver Details Have Been Updated`
    : `Your Vehicle & Driver Details – ${booking.bookingId}`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>${isUpdate ? "Your vehicle/driver assignment has been updated." : "Your vehicle and driver have been assigned for your upcoming trip."}</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Vehicle", vehicle?.name || "—"),
      row("Vehicle Number", vehicle?.number || "—"),
      row("Driver Name", driver?.name || "—"),
      row("Driver Phone", driver?.phone || "—"),
      row("Travel Date", fmtDate(booking.travelDate)),
      row("Pickup → Destination", `${booking.pickup} → ${booking.destination}`),
    ]);
  return {
    subject,
    html: layout({
      business,
      preheader: `Vehicle and driver confirmed for ${booking.bookingId}.`,
      kicker: isUpdate ? "Assignment Updated" : "Vehicle Reserved",
      heading: isUpdate ? "Your trip details have changed" : "Vehicle reserved for your booking ✅",
      bodyHtml,
      ctaText: "View Booking",
      ctaUrl: `${appUrl}/booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  G. FINAL PAYMENT REQUIRED (toll/parking/other after travel)  */
/* ------------------------------------------------------------ */
function finalPaymentRequiredEmail({ business, appUrl, booking, charges, finalAmountDue }) {
  const subject = `Important: Your Final Payment Amount Is Ready`;
  const chargeRows = (charges || []).map((c) => row(c.label, money(c.amount)));
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p><b>⚠️ Toll, parking and other charges were added after your trip.</b> Please review the itemized breakdown below before paying.</p>` +
    table([row("Remaining Base Amount", money(booking.totalAmount - (booking.amountPaid || 0))), ...chargeRows, row("Final Amount Due", money(finalAmountDue))]) +
    `<p>Have a question about a charge? Reply to this email or contact us directly before paying.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Final payment of ${money(finalAmountDue)} is ready for ${booking.bookingId}.`,
      kicker: "Final Payment Ready",
      heading: "Review & pay your final amount",
      bodyHtml,
      ctaText: "Review & Pay Final Amount",
      ctaUrl: `${appUrl}/payment.html?token=${encodeURIComponent(booking.paymentToken || booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  H. FULLY PAID — FINAL INVOICE READY                          */
/* ------------------------------------------------------------ */
function invoiceReadyEmail({ business, appUrl, booking }) {
  const subject = `Payment Complete – Your Final Invoice Is Ready`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Your payment is complete and your final invoice is ready to download.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Invoice Number", booking.invoiceId || "—"),
      row("Total Paid", money(booking.amountPaid)),
      row("Outstanding Balance", money(0)),
    ]);
  return {
    subject,
    html: layout({
      business,
      preheader: `Invoice ready for ${booking.bookingId}.`,
      kicker: "Fully Paid",
      heading: "Payment complete — thank you!",
      bodyHtml,
      ctaText: "Download Final Invoice",
      ctaUrl: `${appUrl}/invoice.html?booking=${encodeURIComponent(booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  I. BOOKING CONFIRMED                                         */
/* ------------------------------------------------------------ */
function bookingConfirmedEmail({ business, appUrl, booking }) {
  const subject = `Your Booking Is Confirmed – ${booking.bookingId}`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Your booking is fully confirmed. Here's a summary for your records.</p>` +
    table([
      row("Booking ID", booking.bookingId),
      row("Travel Date", fmtDate(booking.travelDate)),
      row("Pickup → Destination", `${booking.pickup} → ${booking.destination}`),
      row("Vehicle", booking.vehicle || "—"),
      row("Payment Status", "Paid"),
    ]) +
    `<p>We look forward to having you travel with us. Save your Booking ID for any future reference.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Booking ${booking.bookingId} is confirmed.`,
      kicker: "Booking Confirmed",
      heading: "Your trip is confirmed 🎉",
      bodyHtml,
      ctaText: "View Booking & Invoice",
      ctaUrl: `${appUrl}/booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}`,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  J. BOOKING CANCELLED                                         */
/* ------------------------------------------------------------ */
function bookingCancelledEmail({ business, booking, reason }) {
  const subject = `Booking Cancelled – ${booking.bookingId}`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Your booking has been cancelled.</p>` +
    table([row("Booking ID", booking.bookingId), row("Reason", reason || "Not specified")]) +
    `<p>If you've already made a payment and believe a refund applies, please contact us directly using the details below.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Booking ${booking.bookingId} has been cancelled.`,
      kicker: "Booking Cancelled",
      heading: "Your booking was cancelled",
      bodyHtml,
    }),
  };
}

/* ------------------------------------------------------------ */
/*  K. BOOKING REJECTED (before any payment)                     */
/* ------------------------------------------------------------ */
function bookingRejectedEmail({ business, booking, reason }) {
  const subject = `Update on Your Booking Request – ${booking.bookingId}`;
  const bodyHtml =
    `<p>Hi ${booking.name || "there"},</p>
     <p>Unfortunately we're unable to accept this booking request.</p>` +
    table([row("Booking ID", booking.bookingId), row("Reason", reason || "Not specified")]) +
    `<p>Feel free to reach out if you'd like to discuss alternative dates or vehicles.</p>`;
  return {
    subject,
    html: layout({
      business,
      preheader: `Update on your booking request ${booking.bookingId}.`,
      kicker: "Booking Update",
      heading: "We're unable to accept this request",
      bodyHtml,
    }),
  };
}

/* Registry used by api/send-email.js — add new templates here. */
const TEMPLATES = {
  booking_received: bookingReceivedEmail,
  booking_approved_payment_required: bookingApprovedPaymentRequiredEmail,
  payment_submitted: paymentSubmittedEmail,
  payment_approved: paymentApprovedEmail,
  payment_rejected: paymentRejectedEmail,
  vehicle_driver_assigned: vehicleDriverAssignedEmail,
  final_payment_required: finalPaymentRequiredEmail,
  invoice_ready: invoiceReadyEmail,
  booking_confirmed: bookingConfirmedEmail,
  booking_cancelled: bookingCancelledEmail,
  booking_rejected: bookingRejectedEmail,
};

module.exports = { TEMPLATES };
