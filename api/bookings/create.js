/**
 * POST /api/bookings/create
 * Customer booking submission — Part 4.
 * Validates input, finds/creates the Customer, generates a unique
 * server-side Booking ID, writes the booking + first timeline event,
 * and sends the "booking received" email. All inside a transaction.
 */
const { prisma } = require("../../lib/db");
const { generateBookingId } = require("../../lib/ids");
const { addTimelineEvent } = require("../../lib/timeline");
const { sendAndLogEmail } = require("../../lib/mailer");
const { readJsonBody, sendJson, methodGuard, withErrorHandling, isValidEmail, normalizeEmail, toNumber } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const body = await readJsonBody(req);
  const {
    customerName,
    customerEmail,
    customerPhone,
    pickupLocation,
    destination,
    tripType,
    travelDate,
    pickupTime,
    returnDate,
    returnTime,
    passengerCount,
    specialRequirements,
    requestedVehicleId,
  } = body || {};

  // ---- Server-side validation (Part 38) — never trust the client alone ----
  const errors = [];
  if (!customerName || String(customerName).trim().length < 2) errors.push("Please enter your full name.");
  if (!isValidEmail(customerEmail)) errors.push("Please enter a valid email address.");
  if (!customerPhone || String(customerPhone).replace(/\D/g, "").length < 10) errors.push("Please enter a valid phone number.");
  if (!pickupLocation) errors.push("Pickup location is required.");
  if (!destination) errors.push("Destination is required.");
  if (!travelDate || isNaN(new Date(travelDate).getTime())) errors.push("A valid travel date is required.");
  const passengers = toNumber(passengerCount, 0);
  if (passengers < 1 || passengers > 60) errors.push("Passenger count must be between 1 and 60.");
  if (returnDate && isNaN(new Date(returnDate).getTime())) errors.push("Return date is invalid.");
  if (errors.length) return sendJson(res, 400, { error: errors[0], errors });

  const email = normalizeEmail(customerEmail);

  let requestedVehicle = null;
  if (requestedVehicleId) {
    requestedVehicle = await prisma.vehicle.findUnique({ where: { id: requestedVehicleId } });
  }

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { email },
      update: { name: customerName.trim(), phone: customerPhone },
      create: { name: customerName.trim(), email, phone: customerPhone },
    });

    const bookingId = await generateBookingId(tx);

    const booking = await tx.booking.create({
      data: {
        bookingId,
        customerId: customer.id,
        customerName: customerName.trim(),
        customerEmail: email,
        customerPhone,
        pickupLocation,
        destination,
        tripType: tripType || "ONE_WAY",
        travelDate: new Date(travelDate),
        pickupTime: pickupTime || null,
        returnDate: returnDate ? new Date(returnDate) : null,
        returnTime: returnTime || null,
        passengerCount: passengers,
        specialRequirements: specialRequirements || null,
        requestedVehicleId: requestedVehicle ? requestedVehicle.id : null,
        requestedVehicleName: requestedVehicle ? requestedVehicle.vehicleName : body.requestedVehicleName || null,
        bookingStatus: "PENDING_APPROVAL",
        paymentStatus: "NO_PAYMENT_REQUIRED_YET",
        tripStatus: "NOT_ASSIGNED",
      },
    });

    await addTimelineEvent(booking.id, "BOOKING_CREATED", { tx });

    return booking;
  });

  // Email is sent after the transaction commits — a slow/failed email must
  // never roll back a successfully saved booking.
  await sendAndLogEmail("booking_received", email, { booking: serializeBooking(result) }, result.id);

  sendJson(res, 201, {
    success: true,
    bookingId: result.bookingId,
    booking: {
      bookingId: result.bookingId,
      customerName: result.customerName,
      pickupLocation: result.pickupLocation,
      destination: result.destination,
      travelDate: result.travelDate,
      bookingStatus: result.bookingStatus,
    },
    message: "Your booking request has been received and is under review.",
  });
});

function serializeBooking(b) {
  return { ...b, baseAmount: Number(b.baseAmount || 0) };
}
