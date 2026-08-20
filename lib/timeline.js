/**
 * lib/timeline.js
 *
 * Booking timeline helper.
 *
 * Usage:
 *
 * Normal:
 * await addTimelineEvent(
 *   bookingId,
 *   "BOOKING_APPROVED"
 * );
 *
 * Inside transaction:
 * await addTimelineEvent(
 *   bookingId,
 *   "BOOKING_APPROVED",
 *   { tx }
 * );
 */

const { prisma } = require("./db");


/**
 * Add a booking timeline event.
 *
 * @param {string} bookingId
 * @param {string} eventType
 * @param {object} options
 * @param {object|null} options.tx
 * @param {object|null} options.metadata
 */
async function addTimelineEvent(
  bookingId,
  eventType,
  options = {}
) {
  const {
    tx = null,
    metadata = null,
  } = options;


  // ============================================================
  // IMPORTANT TRANSACTION FIX
  // ============================================================

  const db =
    tx || prisma;


  if (!bookingId) {
    throw new Error(
      "bookingId is required for timeline event."
    );
  }


  if (!eventType) {
    throw new Error(
      "eventType is required for timeline event."
    );
  }


  // ============================================================
  // CREATE EVENT
  //
  // If your Prisma model name is not bookingTimeline,
  // replace only `bookingTimeline` with your actual model name.
  //
  // Example possibilities:
  // db.bookingTimeline.create(...)
  // db.timelineEvent.create(...)
  // db.bookingEvent.create(...)
  // ============================================================

  return db.bookingTimeline.create({
    data: {
      bookingId,
      eventType,

      // If your schema has metadata/json/details,
      // this safely stores it.
      ...(metadata !== null
        ? {
            metadata,
          }
        : {}),
    },
  });
}


module.exports = {
  addTimelineEvent,
};
