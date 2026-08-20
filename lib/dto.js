/**
 * lib/dto.js
 * Maps internal database rows to customer-safe response shapes.
 * Booking-status and payment-page endpoints must go through this —
 * never `res.json(booking)` a raw Prisma row to a customer.
 */

function num(v) {
  return v === null || v === undefined ? 0 : Number(v);
}

function customerBookingDto(booking) {
  return {
    bookingId: booking.bookingId,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    tripStatus: booking.tripStatus,
    createdAt: booking.createdAt,

    trip: {
      pickupLocation: booking.pickupLocation,
      destination: booking.destination,
      tripType: booking.tripType,
      travelDate: booking.travelDate,
      pickupTime: booking.pickupTime,
      returnDate: booking.returnDate,
      returnTime: booking.returnTime,
      passengerCount: booking.passengerCount,
      requestedVehicleName: booking.requestedVehicleName,
    },

    payment: {
      baseAmount: num(booking.baseAmount),
      advancePercentage: num(booking.advancePercentage),
      advanceRequiredAmount: num(booking.advanceRequiredAmount),
      advancePaidAmount: num(booking.advancePaidAmount),
      remainingBaseAmount: num(booking.remainingBaseAmount),
      additionalChargesTotal: num(booking.additionalChargesTotal),
      finalAmountDue: num(booking.finalAmountDue),
      totalPaidAmount: num(booking.totalPaidAmount),
      outstandingBalance: num(booking.outstandingBalance),
    },

    vehicle: booking.assignedVehicle
      ? {
          vehicleName: booking.assignedVehicle.vehicleName,
          vehicleType: booking.assignedVehicle.vehicleType,
          vehicleNumber: booking.assignedVehicle.vehicleNumber,
          seatingCapacity: booking.assignedVehicle.seatingCapacity,
          features: booking.assignedVehicle.features,
        }
      : null,

    driver: booking.assignedDriver
      ? {
          driverName: booking.assignedDriver.driverName,
          phone: booking.assignedDriver.phone,
        }
      : null,

    charges: (booking.charges || []).map((c) => ({
      chargeType: c.chargeType,
      description: c.description,
      amount: num(c.amount),
      addedAt: c.addedAt,
    })),

    timeline: (booking.timelineEvents || [])
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((t) => ({ eventType: t.eventType, title: t.customerTitle, description: t.customerDescription, at: t.createdAt })),

    activePaymentRequest: pickActivePaymentRequest(booking.paymentRequests),

    invoice: (function () {
      const inv = (booking.invoices || []).find((i) => i.invoiceType === "FINAL");
      if (!inv) return null;
      // Strip internal admin id before this ever reaches a customer response.
      return { invoiceNumber: inv.invoiceNumber, invoiceUrl: inv.invoiceUrl, generatedAt: inv.generatedAt };
    })(),
  };
}

function pickActivePaymentRequest(requests) {
  if (!requests || !requests.length) return null;
  const active = requests
    .filter((r) => r.status === "ACTIVE" && (!r.expiresAt || new Date(r.expiresAt) > new Date()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!active) return null;
  return { paymentStage: active.paymentStage, amount: num(active.amount), secureToken: active.secureToken };
}

/** Safe shape for the /payment/[token] page — no internal IDs, no other bookings. */
function paymentPageDto(paymentRequest, booking) {
  return {
    paymentStage: paymentRequest.paymentStage,
    amount: num(paymentRequest.amount),
    status: paymentRequest.status,
    expiresAt: paymentRequest.expiresAt,
    bookingId: booking.bookingId,
    customerName: booking.customerName,
    trip: {
      pickupLocation: booking.pickupLocation,
      destination: booking.destination,
      travelDate: booking.travelDate,
    },
  };
}

module.exports = { customerBookingDto, paymentPageDto };
