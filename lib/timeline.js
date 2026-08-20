/**
 * lib/timeline.js
 * Persistent, customer-facing booking events (Part 2.8).
 * Never fabricate the timeline on the frontend — every entry here is a
 * real database row written at the moment the event actually happened.
 */
const { prisma } = require("./db");

const EVENT_COPY = {
  BOOKING_CREATED: ["Booking Request Received", "We've received your booking request and it's now under review."],
  BOOKING_APPROVED: ["Booking Approved", "Your booking has been approved. Advance payment details have been sent to you."],
  BOOKING_REJECTED: ["Booking Rejected", "Unfortunately we're unable to accept this booking request."],
  BOOKING_CANCELLED: ["Booking Cancelled", "This booking has been cancelled."],
  ADVANCE_PAYMENT_REQUIRED: ["Advance Payment Required", "Please complete your advance payment to confirm this booking."],
  ADVANCE_PAYMENT_SUBMITTED: ["Advance Payment Submitted", "Your advance payment proof has been submitted."],
  ADVANCE_PAYMENT_APPROVED: ["Advance Payment Verified", "Your advance payment has been verified. Booking confirmed."],
  ADVANCE_PAYMENT_REJECTED: ["Advance Payment Rejected", "There was an issue with your advance payment proof."],
  VEHICLE_ASSIGNED: ["Vehicle Assigned", "A vehicle has been assigned to your trip."],
  VEHICLE_CHANGED: ["Vehicle Updated", "The assigned vehicle for your trip has been updated."],
  DRIVER_ASSIGNED: ["Driver Assigned", "A driver has been assigned to your trip."],
  DRIVER_CHANGED: ["Driver Updated", "The assigned driver for your trip has been updated."],
  TRIP_STARTED: ["Trip Started", "Your trip is now in progress."],
  TRIP_COMPLETED: ["Travel Completed", "Your trip has been completed."],
  FINAL_CHARGES_ADDED: ["Final Charges Added", "Toll, parking, or other charges have been added to your booking."],
  FINAL_PAYMENT_REQUIRED: ["Final Payment Required", "Please review and pay the final amount for your trip."],
  FINAL_PAYMENT_SUBMITTED: ["Final Payment Submitted", "Your final payment proof has been submitted."],
  FINAL_PAYMENT_APPROVED: ["Final Payment Verified", "Your final payment has been verified."],
  FINAL_PAYMENT_REJECTED: ["Final Payment Rejected", "There was an issue with your final payment proof."],
  BOOKING_COMPLETED: ["Booking Completed", "This booking is now fully complete."],
  INVOICE_GENERATED: ["Final Invoice Ready", "Your final invoice is ready to view and download."],
};

/**
 * @param {string} bookingId - internal Booking.id (not the human bookingId)
 * @param {string} eventType - one of EVENT_COPY keys
 * @param {object} [opts] - { titleOverride, descriptionOverride }, tx (Prisma transaction client)
 */
async function addTimelineEvent(bookingId, eventType, opts = {}) {
  const tx = opts.tx || prisma;
  const copy = EVENT_COPY[eventType] || [eventType, ""];
  return tx.bookingTimeline.create({
    data: {
      bookingId,
      eventType,
      customerTitle: opts.titleOverride || copy[0],
      customerDescription: opts.descriptionOverride || copy[1],
    },
  });
}

module.exports = { addTimelineEvent, EVENT_COPY };
